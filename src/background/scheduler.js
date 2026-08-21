import { evaluateQueuedActions, normalizeQueuedAction } from '../core/action-queue.js';
import { evaluateAutomationRules, nextRetryDelay } from '../core/automation.js';
import { mayRetrySession } from '../core/state-machine.js';
import { appendTimeline } from './context-vault.js';
import {
  runtime, sessions, localTimers, safeError, saveQueue, publicSession, broadcast,
  storeScheduledAction, takeScheduledAction
} from './runtime-state.js';
import { requestSnapshot, attachIfNeeded } from './session-runtime.js';
import { doSend, doRetryNow, continueNewChat } from './action-controller.js';

export async function queueSend(tabId,text,params={}) {
  const tab=await chrome.tabs.get(tabId);if(!tab?.url?.startsWith('https://chatgpt.com/'))throw new Error('Tab đích không phải ChatGPT Web.');
  const value=String(text||'').trim();if(!value)throw new Error('Prompt xếp hàng trống.');
  const now=Date.now(),expiresIn=Math.max(60_000,Math.min(7*86_400_000,Number(params.expiresInMs)||runtime.settings.queue.defaultExpiryMs));
  const action=normalizeQueuedAction({id:crypto.randomUUID(),tabId,text:value,createdAt:now,expiresAt:now+expiresIn,source:params.source||'user',handoffOnLimit:params.handoffOnLimit!==false});
  runtime.queuedActions.push(action);await saveQueue();await appendTimeline(tabId,{kind:'queue.added',queueId:action.id,textChars:value.length,expiresAt:action.expiresAt}).catch(()=>{});
  const session=sessions.get(tabId);if(session)await reconcileQueueForSession(session);await broadcast({kind:'queue.changed',session:publicSession(session)});return {ok:true,queued:action};
}

export async function cancelQueued(queueId) {
  const id=String(queueId||''),item=runtime.queuedActions.find((x)=>x.id===id);
  runtime.queuedActions=runtime.queuedActions.filter((x)=>x.id!==id);await saveQueue();
  if(item)appendTimeline(item.tabId,{kind:'queue.cancelled',queueId:id}).catch(()=>{});return {ok:Boolean(item)};
}

export async function reconcileQueueForSession(session) {
  if(!session)return;
  const policy=evaluateQueuedActions(publicSession(session),runtime.queuedActions,Date.now(),{handoffEnabled:runtime.settings.handoff.enabled});
  if(policy.expired.length){
    const ids=new Set(policy.expired.map(x=>x.id));runtime.queuedActions=runtime.queuedActions.filter((x)=>!ids.has(x.id));await saveQueue();
    for(const item of policy.expired)appendTimeline(item.tabId,{kind:'queue.expired',queueId:item.id}).catch(()=>{});
  }
  for(const item of [...policy.ready,...policy.handoff]){
    const current=runtime.queuedActions.find((x)=>x.id===item.id);if(!current||current.status==='scheduled')continue;
    current.status='scheduled';await saveQueue();await scheduleSystemAction('queue',item.tabId,Date.now()+runtime.settings.queue.sendDelayMs,{queueId:item.id});
  }
}

async function executeQueuedAction(queueId,tabId) {
  const item=runtime.queuedActions.find((x)=>x.id===queueId);if(!item)return;
  const session=sessions.get(tabId);if(!session){runtime.queuedActions=runtime.queuedActions.filter((x)=>x.id!==queueId);await saveQueue();return;}
  await requestSnapshot(tabId).catch(()=>{});
  const policy=evaluateQueuedActions(publicSession(session),[item],Date.now(),{handoffEnabled:runtime.settings.handoff.enabled});
  try {
    if(policy.ready.length)await doSend(tabId,item.text);
    else if(policy.handoff.length)await continueNewChat(tabId,item.text);
    else {item.status='queued';await saveQueue();return;}
    runtime.queuedActions=runtime.queuedActions.filter((x)=>x.id!==queueId);await saveQueue();await appendTimeline(tabId,{kind:'queue.executed',queueId}).catch(()=>{});
  } catch(error) {
    item.status='queued';await saveQueue();await appendTimeline(tabId,{kind:'queue.failed',queueId,error:safeError(error)}).catch(()=>{});throw error;
  } finally {broadcast({kind:'queue.changed',session:publicSession(session)}).catch(()=>{});}
}

export async function scheduleSystemAction(kind,tabId,dueAt,payload={}) {
  const name=`sentinel:${kind}:${tabId}:${dueAt}`;
  await storeScheduledAction(name,{kind,tabId,dueAt,payload});await chrome.alarms.create(name,{when:dueAt});
  const delay=Math.max(0,dueAt-Date.now()),timer=setTimeout(()=>executeScheduled(name,kind,tabId,payload).catch(()=>{}),delay);localTimers.set(name,{timer,kind,tabId,payload});return name;
}

export async function executeScheduled(name,kind,tabId,payload={}) {
  const local=localTimers.get(name);if(local){clearTimeout(local.timer);localTimers.delete(name);}
  const persisted=await takeScheduledAction(name).catch(()=>null);
  if(persisted){kind=persisted.kind||kind;tabId=Number(persisted.tabId??tabId);payload=persisted.payload||payload||{};}
  await chrome.alarms.clear(name).catch(()=>{});
  if(!sessions.has(tabId)){
    const tab=await chrome.tabs.get(tabId).catch(()=>null);
    if(tab?.url?.startsWith('https://chatgpt.com/')){await attachIfNeeded(tabId).catch(()=>{});await requestSnapshot(tabId).catch(()=>{});}
  }
  if(kind==='recovery'){
    const session=sessions.get(tabId);if(!session)return;await requestSnapshot(tabId);
    if(mayRetrySession(session.stateInfo))await doRetryNow(tabId);session.recovery=null;return;
  }
  if(kind==='handoff'){await requestSnapshot(tabId);if(sessions.get(tabId)?.stateInfo?.state==='CONVERSATION_LIMIT')await continueNewChat(tabId);return;}
  if(kind==='automation'){await executeAutomation(payload.ruleId,tabId,payload.action);return;}
  if(kind==='queue')await executeQueuedAction(payload.queueId,tabId);
}

export async function scheduleRecovery(session) {
  if((session.recoveryAttempt||0)>=runtime.settings.recovery.maxAttempts)return;
  if(session.recovery?.dueAt&&session.recovery.dueAt>Date.now())return;
  const delay=nextRetryDelay(session.recoveryAttempt||0,{baseMs:runtime.settings.recovery.baseMs,maxMs:runtime.settings.recovery.maxMs,jitter:.12});
  session.recoveryAttempt=(session.recoveryAttempt||0)+1;session.recovery={attempt:session.recoveryAttempt,dueAt:Date.now()+delay};
  await scheduleSystemAction('recovery',session.tabId,session.recovery.dueAt,{});await broadcast({kind:'recovery.scheduled',session:publicSession(session)});
}

export async function scheduleMatchingAutomations(session) {
  for(const action of evaluateAutomationRules({...publicSession(session),conversationId:session.conversationId},runtime.automationRules,Date.now()))await scheduleSystemAction('automation',session.tabId,action.scheduledAt,{ruleId:action.ruleId,action:action.action});
}

async function executeAutomation(ruleId,tabId,action) {
  if(!runtime.settings.automationsEnabled||runtime.settings.automationPaused)return;
  const rule=runtime.automationRules.find(x=>x.id===ruleId);if(!rule?.enabled)return;
  if(action.type==='send')await doSend(tabId,action.text);else if(action.type==='retry')await doRetryNow(tabId);else if(action.type==='continueNewChat')await continueNewChat(tabId,action.continuation);
  rule.runCount=Number(rule.runCount||0)+1;rule.lastRunAt=Date.now();await chrome.storage.local.set({automationRules:runtime.automationRules});
}

export function installSchedulerHooks() {
  runtime.hooks.queueReconcile=reconcileQueueForSession;
  runtime.hooks.stateChanged=async(session)=>{
    const state=session.stateInfo?.state;
    if(runtime.settings.automationsEnabled&&!runtime.settings.automationPaused)await scheduleMatchingAutomations(session);
    if(runtime.settings.recovery.enabled&&['CONNECTION_LOST','FAILED','STALLED'].includes(state))await scheduleRecovery(session);
    if(runtime.settings.handoff.enabled&&state==='CONVERSATION_LIMIT')await scheduleSystemAction('handoff',session.tabId,Date.now()+runtime.settings.handoff.delayMs,{type:'continueNewChat'});
  };
}
