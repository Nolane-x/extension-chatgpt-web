import { assessSessionHealth } from '../core/health.js';
import { normalizeQueuedAction } from '../core/action-queue.js';
import { readTelemetry } from './cdp.js';

export const CHATGPT_PATTERN='https://chatgpt.com/*';
export const ACTIVE_STATES=new Set(['SUBMITTED','QUEUED','THINKING','DEEP_THINKING','STREAMING','TOOL_RUNNING','COMPLETING']);
export const sessions=new Map();
export const localTimers=new Map();
export const runtime={
  settings:null,
  automationRules:[],
  queuedActions:[],
  bridgeStatus:{enabled:false,connected:false,error:null},
  bridge:null,
  lastPruneAt:0,
  hooks:{
    stateChanged:async()=>{},
    sessionPulse:async()=>{},
    queueReconcile:async()=>{},
    orchestratorSync:async()=>{}
  }
};

export const DEFAULT_SETTINGS={
  locale:'vi',deepObserve:true,automationsEnabled:false,automationPaused:false,
  bridgeEnabled:false,agentScopes:['observe','open'],retentionDays:7,retentionMode:'full',
  recovery:{enabled:false,baseMs:10_000,maxMs:120_000,maxAttempts:4},
  handoff:{enabled:false,delayMs:2_000,maxChars:60_000,recentTurns:12,continuation:'Tiếp tục công việc từ ngữ cảnh bàn giao ở trên.'},
  artifactDownloads:{saveAs:false},
  queue:{defaultExpiryMs:86_400_000,sendDelayMs:350},
  watchdog:{enabled:true,periodMinutes:0.5,reattachCooldownMs:30_000}
};

export function mergeSettings(value={}) {
  return {
    ...DEFAULT_SETTINGS,...value,
    recovery:{...DEFAULT_SETTINGS.recovery,...value.recovery},
    handoff:{...DEFAULT_SETTINGS.handoff,...value.handoff},
    artifactDownloads:{...DEFAULT_SETTINGS.artifactDownloads,...value.artifactDownloads},
    queue:{...DEFAULT_SETTINGS.queue,...value.queue},
    watchdog:{...DEFAULT_SETTINGS.watchdog,...value.watchdog}
  };
}

export const ready=(async()=>{
  const stored=await chrome.storage.local.get(['settings','automationRules','queuedActions']);
  runtime.settings=mergeSettings(stored.settings);
  runtime.automationRules=Array.isArray(stored.automationRules)?stored.automationRules:[];
  runtime.queuedActions=Array.isArray(stored.queuedActions)?stored.queuedActions.map((x)=>normalizeQueuedAction(x)):[];
})();

export function isChatGptUrl(url){try{return new URL(url).origin==='https://chatgpt.com';}catch{return false;}}
function hash(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
export function artifactWithId(tabId,item){return {...item,artifactId:item.artifactId||`${tabId}-${hash(`${item.kind}|${item.href||''}|${item.name||''}`)}`};}
export function safeError(error){return error instanceof Error?error.message:String(error);}
export const scheduledStorageKey=(name)=>`scheduled:${name}`;
export async function storeScheduledAction(name,value){await chrome.storage.local.set({[scheduledStorageKey(name)]:value});}
export async function takeScheduledAction(name){const key=scheduledStorageKey(name);const stored=await chrome.storage.local.get(key);await chrome.storage.local.remove(key);return stored[key]||null;}
export async function saveQueue(){await chrome.storage.local.set({queuedActions:runtime.queuedActions});}

export function publicSession(session) {
  if(!session)return null;
  const s=session.stateInfo||{},telemetry=readTelemetry(session.tabId);
  const base={
    tabId:session.tabId,windowId:session.windowId,url:session.url,title:session.title,conversationId:session.conversationId,
    state:s.state||'DISCOVERED',confidence:s.confidence||0,reason:s.reason||'',evidence:s.evidence||[],
    lastActivityAt:s.lastActivityAt||session.lastSeenAt,lastProgressAt:s.lastProgressAt||0,phaseStartedAt:s.phaseStartedAt||session.lastSeenAt,
    turnStartedAt:session.turnStartedAt||null,completedAt:session.completedAt||null,lastText:String(session.snapshot?.assistantText||'').slice(-1600),
    statusTexts:(session.snapshot?.statusTexts||[]).slice(-8),toolActivities:(session.snapshot?.toolActivities||[]).slice(-8),
    artifacts:(session.artifacts||[]).map(({responseHtml,...x})=>x),deep:session.deep||{attached:false},recovery:session.recovery||null,
    queueCount:runtime.queuedActions.filter((x)=>x.tabId===session.tabId).length,lastSeenAt:session.lastSeenAt,domHealth:s.domHealth||{}
  };
  return {...base,health:assessSessionHealth(base,telemetry,Date.now())};
}

export async function broadcast(event) {
  chrome.runtime.sendMessage({type:'sentinel.dashboardUpdated',event}).catch(()=>{});
  runtime.bridge?.emit(event);
}

export function ensureSession(tabId,tab={}) {
  let session=sessions.get(tabId);
  if(!session){session={tabId,windowId:tab.windowId??null,url:tab.url||'',title:tab.title||'ChatGPT',conversationId:null,lastSeenAt:Date.now(),stateInfo:{state:'DISCOVERED',confidence:.5,evidence:[]},artifacts:[],deep:{attached:false,error:null,lastAttachAttemptAt:0},recoveryAttempt:0};sessions.set(tabId,session);}
  if(tab.url)session.url=tab.url;if(tab.title)session.title=tab.title;if(tab.windowId!=null)session.windowId=tab.windowId;
  return session;
}
