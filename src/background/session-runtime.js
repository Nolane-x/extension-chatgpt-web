import { deriveSessionState } from '../core/state-machine.js';
import { DEFAULT_THRESHOLDS } from '../core/constants.js';
import { createCompletionSettler } from '../core/completion-settle.js';
import { classifyArtifactCandidate, mergeArtifacts } from '../core/artifacts.js';
import { shouldAttemptDeepAttach } from '../core/health.js';
import { readTelemetry, attachDeepObserver, clearSubmission, captureDeepDiagnostics } from './cdp.js';
import { appendTimeline, getStoredSession, putSession } from './context-vault.js';
import {
  ACTIVE_STATES, runtime, sessions, safeError, publicSession, broadcast,
  ensureSession, artifactWithId
} from './runtime-state.js';

const completionSettler=createCompletionSettler({
  settleMs:DEFAULT_THRESHOLDS.completionSettleMs,
  onDue:(tabId)=>requestSnapshot(tabId)
});

export function clearCompletionSettle(tabId){completionSettler.cancel(tabId);}

export function sanitizeSnapshot(raw={}) {
  const clamp=(x,n)=>String(x||'').replace(/\u0000/g,'').slice(0,n);
  return {
    version:1,capturedAt:Number(raw.capturedAt)||Date.now(),url:clamp(raw.url,3000),title:clamp(raw.title,1000),conversationId:raw.conversationId?clamp(raw.conversationId,300):null,
    composerPresent:Boolean(raw.composerPresent),composerText:clamp(raw.composerText,30_000),responsePresent:Boolean(raw.responsePresent),assistantText:clamp(raw.assistantText,80_000),responseHtml:clamp(raw.responseHtml,60_000),
    userTurnCount:Number(raw.userTurnCount)||0,assistantTurnCount:Number(raw.assistantTurnCount)||0,
    turns:(Array.isArray(raw.turns)?raw.turns:[]).slice(-20).map(x=>({role:x?.role==='assistant'?'assistant':'user',text:clamp(x?.text,14_000),testId:clamp(x?.testId,300)})),
    stopVisible:Boolean(raw.stopVisible),generationRunning:Boolean(raw.generationRunning),completionActionVisible:Boolean(raw.completionActionVisible),
    statusTexts:(Array.isArray(raw.statusTexts)?raw.statusTexts:[]).slice(-20).map(x=>clamp(x,1800)),
    toolActivities:(Array.isArray(raw.toolActivities)?raw.toolActivities:[]).slice(-20).map(x=>({name:clamp(x?.name,200),text:clamp(x?.text,3000),active:x?.active!==false})),
    waitingUser:Boolean(raw.waitingUser),connectionLost:Boolean(raw.connectionLost),rateLimited:Boolean(raw.rateLimited),conversationLimit:Boolean(raw.conversationLimit),terminalError:Boolean(raw.terminalError),
    artifacts:(Array.isArray(raw.artifacts)?raw.artifacts:[]).slice(-80).map(x=>({href:x?.href?clamp(x.href,5000):null,text:clamp(x?.text,800),download:clamp(x?.download,300),mime:clamp(x?.mime,200),clickable:Boolean(x?.clickable),source:clamp(x?.source,100)})),
    lastDomMutationAt:Number(raw.lastDomMutationAt)||0,lastAssistantMutationAt:Number(raw.lastAssistantMutationAt)||0,lastStatusMutationAt:Number(raw.lastStatusMutationAt)||0
  };
}

function compileArtifacts(tabId,snapshot,telemetry,prior=[]) {
  const dom=(snapshot.artifacts||[]).map(classifyArtifactCandidate).filter(Boolean);
  const combined=mergeArtifacts(prior,dom,telemetry.networkArtifacts||[]).slice(-96);
  return combined.map(x=>artifactWithId(tabId,x));
}

async function persistSession(session) {
  const mode=runtime.settings?.retentionMode||'full';
  if(mode==='off')return;
  const snapshot=mode==='telemetry'?{
    capturedAt:session.snapshot?.capturedAt,url:session.snapshot?.url,title:session.snapshot?.title,conversationId:session.snapshot?.conversationId,
    userTurnCount:session.snapshot?.userTurnCount,assistantTurnCount:session.snapshot?.assistantTurnCount,statusTexts:session.snapshot?.statusTexts?.slice(-8),artifacts:session.artifacts
  }:{...session.snapshot,responseHtml:undefined};
  await putSession({...publicSession(session),snapshot,artifacts:session.artifacts});
}

export async function captureDriftEvidence(session) {
  try {
    const diagnostic=runtime.settings.deepObserve?await captureDeepDiagnostics(session.tabId):{capturedAt:Date.now(),telemetry:readTelemetry(session.tabId),page:null,metrics:{}};
    session.lastDiagnostic=diagnostic;
    await appendTimeline(session.tabId,{kind:'diagnostic',reason:'dom_drift',deepAttached:Boolean(diagnostic.telemetry?.debuggerAttached),page:diagnostic.page?{url:diagnostic.page.url,readyState:diagnostic.page.readyState,composer:diagnostic.page.composer,assistant:diagnostic.page.assistant,stopControls:diagnostic.page.stopControls?.length||0,completionControls:diagnostic.page.completionControls?.length||0}:null,metrics:diagnostic.metrics}).catch(()=>{});
  } catch(error) {
    await appendTimeline(session.tabId,{kind:'diagnostic.failed',reason:'dom_drift',error:safeError(error)}).catch(()=>{});
  }
}

export async function processSnapshot(tabId,rawSnapshot,telemetry=readTelemetry(tabId),source='dom') {
  const snapshot=sanitizeSnapshot(rawSnapshot),session=ensureSession(tabId,{url:snapshot.url,title:snapshot.title});
  const previous=session.stateInfo||{},now=Date.now();
  session.snapshot=snapshot;session.url=snapshot.url||session.url;session.title=snapshot.title||session.title;session.conversationId=snapshot.conversationId;session.lastSeenAt=now;
  session.artifacts=compileArtifacts(tabId,snapshot,telemetry,session.artifacts);
  const next=deriveSessionState(snapshot,telemetry,previous,now);session.stateInfo=next;
  completionSettler.reconcile(tabId,next,now);
  if(!ACTIVE_STATES.has(previous.state)&&ACTIVE_STATES.has(next.state))session.turnStartedAt=now;
  if(next.state==='COMPLETED'){session.completedAt=now;session.recoveryAttempt=0;session.recovery=null;clearSubmission(tabId);}
  const changed=previous.state!==next.state;
  if(changed){
    await appendTimeline(tabId,{kind:'state',source,from:previous.state||null,to:next.state,confidence:next.confidence,reason:next.reason,evidence:next.evidence,statusTexts:snapshot.statusTexts.slice(-4)}).catch(()=>{});
    if(next.state==='DOM_DRIFT')captureDriftEvidence(session).catch(()=>{});
    await broadcast({kind:'state.changed',session:publicSession(session)});
    await runtime.hooks.stateChanged(session,previous).catch(()=>{});
  } else if(source==='cdp'&&now-(session.lastBroadcastAt||0)>1500){
    session.lastBroadcastAt=now;await broadcast({kind:'session.pulse',session:publicSession(session)});await runtime.hooks.sessionPulse(session).catch(()=>{});
  }
  await runtime.hooks.queueReconcile(session).catch(()=>{});
  await runtime.hooks.orchestratorSync(session).catch(()=>{});
  persistSession(session).catch(()=>{});
  return publicSession(session);
}

export async function requestSnapshot(tabId) {
  const response=await chrome.tabs.sendMessage(tabId,{type:'sentinel.requestSnapshot'}).catch(()=>null);
  if(response?.snapshot)return processSnapshot(tabId,response.snapshot,readTelemetry(tabId),'poll');
  return publicSession(sessions.get(tabId));
}

export async function attachIfNeeded(tabId,force=false) {
  if(!runtime.settings.deepObserve)return;
  const session=ensureSession(tabId),now=Date.now();
  if(!force&&!shouldAttemptDeepAttach(session,now,runtime.settings.watchdog.reattachCooldownMs))return;
  session.deep={...session.deep,attached:false,lastAttachAttemptAt:now};
  try {await attachDeepObserver(tabId);session.deep={attached:true,error:null,lastAttachAttemptAt:now};}
  catch(error){session.deep={attached:false,error:safeError(error),lastAttachAttemptAt:now};}
}

export async function restoreSession(tab) {
  if(!tab?.id)return null;
  const saved=await getStoredSession(tab.id).catch(()=>null);
  const sameConversation=!saved?.conversationId||!tab.url||tab.url.includes(`/c/${saved.conversationId}`);
  if(saved&&sameConversation){
    sessions.set(tab.id,{...saved,tabId:tab.id,windowId:tab.windowId??saved.windowId,url:tab.url||saved.url,title:tab.title||saved.title,lastSeenAt:Date.now(),stateInfo:{state:saved.state||'DISCOVERED',confidence:saved.confidence||.5,reason:saved.reason||'',evidence:saved.evidence||[],lastActivityAt:saved.lastActivityAt||saved.updatedAt||Date.now(),lastProgressAt:saved.lastProgressAt||0,phaseStartedAt:saved.phaseStartedAt||Date.now(),lastAssistantText:saved.snapshot?.assistantText||'',domHealth:saved.domHealth||{}},artifacts:saved.artifacts||[],deep:{attached:false,error:null,lastAttachAttemptAt:0},recoveryAttempt:saved.recovery?.attempt||0});
  }
  return ensureSession(tab.id,tab);
}
