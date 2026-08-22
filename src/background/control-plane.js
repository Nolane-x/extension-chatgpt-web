import { nextRetryDelay } from '../core/automation.js';
import { mayRetrySession } from '../core/state-machine.js';
import { validateAgentRequest } from '../core/protocol.js';
import { mergeSettingsPatch } from '../core/settings.js';
import { createNativeBridge } from '../bridge/native-client.js';
import { captureDeepDiagnostics, readTelemetry } from './cdp.js';
import { appendTimeline, deleteContext, getContext } from './context-vault.js';
import {
  runtime, sessions, safeError, publicSession, broadcast, ensureSession,
  isChatGptUrl, mergeSettings
} from './runtime-state.js';
import { attachIfNeeded, requestSnapshot } from './session-runtime.js';
import {
  composeOnly, doSend, doStop, continueNewChat,
  downloadArtifact, downloadAllArtifacts
} from './action-controller.js';
import { cancelQueued, queueSend, scheduleSystemAction } from './scheduler.js';
import { handleOrchestratorCommand } from './orchestrator-runtime.js';

let applySettingsHook=async()=>{};

export function configureControlPlane({applySettings}={}) {
  if(typeof applySettings==='function')applySettingsHook=applySettings;
}

export async function diagnoseTab(tabId) {
  await requestSnapshot(tabId).catch(()=>{});
  const session=sessions.get(tabId);if(!session)throw new Error('Không tìm thấy phiên ChatGPT.');
  let deep=null;
  if(runtime.settings.deepObserve){
    await attachIfNeeded(tabId);
    if(session.deep?.attached)deep=await captureDeepDiagnostics(tabId).catch((error)=>({error:safeError(error)}));
  }
  return {session:publicSession(session),telemetry:readTelemetry(tabId),deep,lastDiagnostic:session.lastDiagnostic||null};
}

export async function waitUntil(tabId,states,timeoutMs=25_000) {
  const targets=new Set((Array.isArray(states)?states:[]).map((x)=>String(x).toUpperCase()));
  if(!targets.size)throw new Error('states phải có ít nhất một trạng thái.');
  const timeout=Math.max(0,Math.min(25_000,Number(timeoutMs)||25_000)),deadline=Date.now()+timeout;
  while(true){
    const session=await requestSnapshot(tabId);
    if(session&&targets.has(session.state))return {ok:true,matched:session.state,session};
    if(Date.now()>=deadline)return {ok:false,timeout:true,session};
    await new Promise((resolve)=>setTimeout(resolve,350));
  }
}

export async function handleCommand(action,params={},context={source:'ui'}) {
  if(String(action||'').startsWith('task'))return handleOrchestratorCommand(action,params,context);
  if(action==='getDashboardState'||action==='listTabs')return {
    sessions:[...sessions.values()].map(publicSession),settings:runtime.settings,
    automationRules:runtime.automationRules,queuedActions:runtime.queuedActions,bridge:runtime.bridgeStatus
  };
  if(action==='observe'){
    const tabId=Number(params.tabId);
    return {session:publicSession(sessions.get(tabId)),context:params.includeContext?await getContext(tabId):undefined};
  }
  if(action==='diagnose')return diagnoseTab(Number(params.tabId));
  if(action==='waitUntil')return waitUntil(Number(params.tabId),params.states,params.timeoutMs);
  if(action==='openChat'){
    const tab=await chrome.tabs.create({url:isChatGptUrl(params.url)?params.url:'https://chatgpt.com/',active:params.active!==false});
    if(tab.id)ensureSession(tab.id,tab);
    return {ok:true,tabId:tab.id};
  }
  if(action==='focusTab'){
    const tabId=Number(params.tabId);await chrome.tabs.update(tabId,{active:true});const tab=await chrome.tabs.get(tabId);
    if(tab.windowId!=null)await chrome.windows.update(tab.windowId,{focused:true});return {ok:true};
  }
  if(action==='compose')return composeOnly(Number(params.tabId),params.text,params.replace!==false);
  if(action==='send')return doSend(Number(params.tabId),params.text,{replace:params.replace!==false});
  if(action==='queueSend')return queueSend(Number(params.tabId),params.text,{...params,source:params.source||'agent'});
  if(action==='listQueue'){
    const tabId=params.tabId==null?null:Number(params.tabId);
    return {queuedActions:runtime.queuedActions.filter((item)=>tabId==null||item.tabId===tabId)};
  }
  if(action==='cancelQueued')return cancelQueued(params.queueId);
  if(action==='stop')return doStop(Number(params.tabId));
  if(action==='retry'){
    const tabId=Number(params.tabId),session=sessions.get(tabId);
    if(!mayRetrySession(session?.stateInfo))throw new Error('Retry không an toàn ở trạng thái hiện tại.');
    const attempt=(session.recoveryAttempt||0)+1;
    const delay=nextRetryDelay(attempt-1,{baseMs:runtime.settings.recovery.baseMs,maxMs:runtime.settings.recovery.maxMs,jitter:.12});
    session.recoveryAttempt=attempt;session.recovery={attempt,dueAt:Date.now()+delay};
    await scheduleSystemAction('recovery',tabId,session.recovery.dueAt,{});
    return {ok:true,dueAt:session.recovery.dueAt,attempt};
  }
  if(action==='continueNewChat')return continueNewChat(Number(params.tabId),params.continuation);
  if(action==='listArtifacts')return {artifacts:sessions.get(Number(params.tabId))?.artifacts||[]};
  if(action==='downloadArtifact')return downloadArtifact(Number(params.tabId),String(params.artifactId||''));
  if(action==='downloadAllArtifacts')return downloadAllArtifacts(Number(params.tabId));
  if(action==='getDownload'){
    const items=await chrome.downloads.search({id:Number(params.downloadId)}),item=items[0];
    if(!item)throw new Error('Không tìm thấy download.');
    return {download:{id:item.id,state:item.state,filename:item.filename,url:item.finalUrl||item.url,bytesReceived:item.bytesReceived,totalBytes:item.totalBytes,error:item.error||null,exists:item.exists}};
  }
  if(action==='getContext')return getContext(Number(params.tabId));
  if(action==='deleteContext'){await deleteContext(Number(params.tabId));return {ok:true};}
  if(action==='listAutomations')return {automationRules:runtime.automationRules};
  if(action==='setAutomationEnabled'){
    const rule=runtime.automationRules.find((item)=>item.id===params.ruleId);if(!rule)throw new Error('Không tìm thấy automation.');
    rule.enabled=Boolean(params.enabled);await chrome.storage.local.set({automationRules:runtime.automationRules});return {ok:true,rule};
  }
  if(action==='saveAutomation'){
    const incoming={...(params.rule||{})};if(!incoming.id)incoming.id=crypto.randomUUID();
    const index=runtime.automationRules.findIndex((item)=>item.id===incoming.id);
    if(index>=0)runtime.automationRules[index]={...runtime.automationRules[index],...incoming};else runtime.automationRules.push(incoming);
    await chrome.storage.local.set({automationRules:runtime.automationRules});return {ok:true,rule:runtime.automationRules.find((item)=>item.id===incoming.id)};
  }
  if(action==='deleteAutomation'){
    runtime.automationRules=runtime.automationRules.filter((item)=>item.id!==params.ruleId);
    await chrome.storage.local.set({automationRules:runtime.automationRules});return {ok:true};
  }
  if(action==='updateSettings'){
    runtime.settings=mergeSettings(mergeSettingsPatch(runtime.settings,params.patch||{}));
    await chrome.storage.local.set({settings:runtime.settings});await applySettingsHook();return {ok:true,settings:runtime.settings};
  }
  if(action==='showDownload'){await chrome.downloads.show(Number(params.downloadId));return {ok:true};}
  throw new Error(`Command không hỗ trợ: ${action}`);
}

export async function handleAgentRequest(payload) {
  const parsed=validateAgentRequest(payload,runtime.settings.agentScopes||[]),tabId=Number(parsed.params?.tabId);
  const hasTab=Number.isInteger(tabId)&&tabId>0,start=Date.now();
  if(hasTab)appendTimeline(tabId,{kind:'agent.action.started',action:parsed.action,scope:parsed.requiredScope,requestId:parsed.id??null}).catch(()=>{});
  try{
    const result=await handleCommand(parsed.action,parsed.params,{source:'agent',requestId:parsed.id??null,requiredScope:parsed.requiredScope});
    if(hasTab)appendTimeline(tabId,{kind:'agent.action.succeeded',action:parsed.action,scope:parsed.requiredScope,durationMs:Date.now()-start}).catch(()=>{});
    return result;
  }catch(error){
    if(hasTab)appendTimeline(tabId,{kind:'agent.action.failed',action:parsed.action,scope:parsed.requiredScope,durationMs:Date.now()-start,error:safeError(error)}).catch(()=>{});
    throw error;
  }
}

export function initializeNativeBridge() {
  if(runtime.bridge)return runtime.bridge;
  runtime.bridge=createNativeBridge({
    handleRequest:handleAgentRequest,
    onStatus:(status)=>{
      runtime.bridgeStatus={...runtime.bridgeStatus,...status};
      broadcast({kind:'bridge.status',bridge:runtime.bridgeStatus}).catch(()=>{});
    }
  });
  return runtime.bridge;
}
