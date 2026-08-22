import { classifyArtifactCandidate, mergeArtifacts } from '../core/artifacts.js';
import { normalizeQueuedAction } from '../core/action-queue.js';
import { initCdpEvents, clearTelemetry, detachDeepObserver } from './cdp.js';
import { appendTimeline, pruneContext } from './context-vault.js';
import {
  CHATGPT_PATTERN, runtime, sessions, ready, mergeSettings, ensureSession,
  artifactWithId, publicSession, broadcast, isChatGptUrl
} from './runtime-state.js';
import {
  restoreSession, attachIfNeeded, requestSnapshot, captureDriftEvidence, processSnapshot
} from './session-runtime.js';
import { executeScheduled, installSchedulerHooks } from './scheduler.js';
import { configureControlPlane, handleCommand, initializeNativeBridge } from './control-plane.js';

let listenersInstalled=false;

export async function discoverTabs() {
  const tabs=await chrome.tabs.query({url:CHATGPT_PATTERN});
  for(const tab of tabs){
    if(!tab.id)continue;
    if(!sessions.has(tab.id))await restoreSession(tab);
    else ensureSession(tab.id,tab);
    await attachIfNeeded(tab.id).catch(()=>{});
    requestSnapshot(tab.id).catch(()=>{});
  }
  return tabs.length;
}

export async function applySettings() {
  const tabIds=[...sessions.keys()];
  if(runtime.settings.deepObserve){
    for(const tabId of tabIds)attachIfNeeded(tabId).catch(()=>{});
  }else{
    for(const tabId of tabIds)detachDeepObserver(tabId).catch(()=>{});
  }
  runtime.bridge?.setEnabled(Boolean(runtime.settings.bridgeEnabled));
  if(runtime.settings.watchdog.enabled){
    await chrome.alarms.create('sentinel:watchdog',{periodInMinutes:Math.max(0.5,Number(runtime.settings.watchdog.periodMinutes)||0.5)});
  }else await chrome.alarms.clear('sentinel:watchdog');
}

export async function runWatchdog() {
  const tabs=await chrome.tabs.query({url:CHATGPT_PATTERN}),live=new Set();
  for(const tab of tabs){
    if(!tab.id)continue;live.add(tab.id);
    const session=sessions.has(tab.id)?ensureSession(tab.id,tab):await restoreSession(tab);
    await attachIfNeeded(tab.id).catch(()=>{});
    await requestSnapshot(tab.id).catch(()=>{});
    if(session?.stateInfo?.state==='DOM_DRIFT'&&!session.lastDiagnostic)captureDriftEvidence(session).catch(()=>{});
  }
  for(const tabId of [...sessions.keys()]){
    if(live.has(tabId))continue;
    sessions.delete(tabId);clearTelemetry(tabId);
    runtime.queuedActions=runtime.queuedActions.filter((item)=>item.tabId!==tabId);
  }
  if(Date.now()-runtime.lastPruneAt>6*60*60*1000){
    runtime.lastPruneAt=Date.now();
    const cutoff=Date.now()-Math.max(1,runtime.settings.retentionDays||7)*86_400_000;
    pruneContext(cutoff).catch(()=>{});
  }
}

function installCdpLifecycle() {
  initCdpEvents((tabId,method,telemetry)=>{
    const session=sessions.get(tabId);if(!session)return;
    session.deep={...session.deep,attached:telemetry.debuggerAttached,error:telemetry.detachReason||null};
    if(method==='Debugger.detached')session.deep.lastAttachAttemptAt=Date.now();
    if(Date.now()-(session.lastCdpProcessAt||0)>220&&session.snapshot){
      session.lastCdpProcessAt=Date.now();processSnapshot(tabId,session.snapshot,telemetry,'cdp').catch(()=>{});
    }
  });
}

function installRuntimeMessaging() {
  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(message?.type==='sentinel.snapshot'){
      if(!sender.tab?.id||!isChatGptUrl(sender.tab.url)){sendResponse({ok:false});return;}
      processSnapshot(sender.tab.id,message.snapshot,undefined,'dom')
        .then((session)=>sendResponse({ok:true,state:session?.state}))
        .catch((error)=>sendResponse({ok:false,error:error instanceof Error?error.message:String(error)}));
      return true;
    }
    if(message?.type==='sentinel.commandRequest'){
      handleCommand(message.command,message.params)
        .then((result)=>sendResponse({ok:true,result}))
        .catch((error)=>sendResponse({ok:false,error:error instanceof Error?error.message:String(error)}));
      return true;
    }
  });
}

function installTabLifecycle() {
  chrome.tabs.onCreated.addListener((tab)=>{
    if(tab.id&&isChatGptUrl(tab.url)){ensureSession(tab.id,tab);attachIfNeeded(tab.id).catch(()=>{});}
  });
  chrome.tabs.onUpdated.addListener((tabId,change,tab)=>{
    if(!isChatGptUrl(tab.url||change.url))return;
    ensureSession(tabId,tab);
    if(change.status==='complete'||change.url){
      attachIfNeeded(tabId).catch(()=>{});
      setTimeout(()=>requestSnapshot(tabId).catch(()=>{}),300);
    }
  });
  chrome.tabs.onRemoved.addListener((tabId)=>{
    sessions.delete(tabId);clearTelemetry(tabId);
    const before=runtime.queuedActions.length;
    runtime.queuedActions=runtime.queuedActions.filter((item)=>item.tabId!==tabId);
    if(before!==runtime.queuedActions.length)chrome.storage.local.set({queuedActions:runtime.queuedActions}).catch(()=>{});
  });
}

function installDownloadLifecycle() {
  chrome.downloads.onCreated.addListener((item)=>{
    const candidate=classifyArtifactCandidate({href:item.finalUrl||item.url,filename:item.filename,source:'chrome-download'});if(!candidate)return;
    for(const session of sessions.values()){
      const match=session.artifacts?.some((artifact)=>artifact.href&&[item.url,item.finalUrl].includes(artifact.href))||(item.referrer&&session.url===item.referrer);
      if(!match)continue;
      session.artifacts=mergeArtifacts(session.artifacts,[artifactWithId(session.tabId,{...candidate,downloadId:item.id,downloadState:item.state})]);
      appendTimeline(session.tabId,{kind:'download.created',downloadId:item.id,name:item.filename}).catch(()=>{});
      broadcast({kind:'download.created',session:publicSession(session)}).catch(()=>{});
    }
  });
  chrome.downloads.onChanged.addListener((delta)=>{
    if(!delta.state&&!delta.error)return;
    for(const session of sessions.values()){
      const artifact=session.artifacts?.find((item)=>item.downloadId===delta.id);if(!artifact)continue;
      if(delta.state)artifact.downloadState=delta.state.current;
      if(delta.error)artifact.downloadError=delta.error.current;
      broadcast({kind:'download.changed',session:publicSession(session)}).catch(()=>{});
    }
  });
}

function installAlarmAndCommandLifecycle() {
  chrome.alarms.onAlarm.addListener((alarm)=>{
    if(alarm.name==='sentinel:watchdog'){runWatchdog().catch(()=>{});return;}
    if(!alarm.name.startsWith('sentinel:'))return;
    const parts=alarm.name.split(':'),kind=parts[1],tabId=Number(parts[2]);
    executeScheduled(alarm.name,kind,tabId,{}).catch(()=>{});
  });
  chrome.commands.onCommand.addListener(async(command)=>{
    if(command==='open-new-chat')await handleCommand('openChat',{});
    if(command==='toggle-automation-pause'){
      runtime.settings.automationPaused=!runtime.settings.automationPaused;
      await chrome.storage.local.set({settings:runtime.settings});
      broadcast({kind:'settings.changed',settings:runtime.settings}).catch(()=>{});
    }
  });
}

function installStorageLifecycle() {
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local')return;
    if(changes.settings){runtime.settings=mergeSettings(changes.settings.newValue);applySettings().catch(()=>{});}
    if(changes.automationRules)runtime.automationRules=Array.isArray(changes.automationRules.newValue)?changes.automationRules.newValue:[];
    if(changes.queuedActions)runtime.queuedActions=Array.isArray(changes.queuedActions.newValue)?changes.queuedActions.newValue.map((item)=>normalizeQueuedAction(item)):[];
  });
}

function installChromeListeners() {
  if(listenersInstalled)return;listenersInstalled=true;
  installRuntimeMessaging();installTabLifecycle();installDownloadLifecycle();installAlarmAndCommandLifecycle();installStorageLifecycle();
  chrome.runtime.onInstalled.addListener(()=>{chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});});
}

export async function bootstrapLifecycle() {
  await ready;
  installSchedulerHooks();configureControlPlane({applySettings});initializeNativeBridge();
  installCdpLifecycle();installChromeListeners();
  await chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
  await discoverTabs();await applySettings();await runWatchdog().catch(()=>{});
  return {sessions:sessions.size,bridge:runtime.bridgeStatus};
}
