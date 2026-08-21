import { buildContextHandoff } from '../core/handoff.js';
import { mayRetrySession } from '../core/state-machine.js';
import { deepCompose, deepClick, attachDeepObserver, detachDeepObserver, markSubmission } from './cdp.js';
import { appendTimeline } from './context-vault.js';
import { runtime, sessions, ensureSession, isChatGptUrl, safeError, publicSession, broadcast } from './runtime-state.js';
import { attachIfNeeded, requestSnapshot } from './session-runtime.js';

async function withDeepControl(tabId,fn) {
  const tab=await chrome.tabs.get(tabId);if(!isChatGptUrl(tab.url))throw new Error('Tab đích không phải ChatGPT Web.');
  await attachDeepObserver(tabId);const session=ensureSession(tabId,tab);session.deep={attached:true,error:null,lastAttachAttemptAt:Date.now()};
  try{return await fn();}finally{if(!runtime.settings.deepObserve){await detachDeepObserver(tabId);session.deep={attached:false,error:null,lastAttachAttemptAt:Date.now()};}}
}

export async function doSend(tabId,text,{replace=true}={}) {
  const session=ensureSession(tabId);await requestSnapshot(tabId).catch(()=>null);
  const allowed=new Set(['IDLE','COMPOSING','COMPLETED']);
  if(!allowed.has(session.stateInfo?.state))throw new Error(`Không gửi: ChatGPT đang ở trạng thái ${session.stateInfo?.state||'UNKNOWN'}.`);
  const value=String(text||'').trim();if(!value)throw new Error('Nội dung gửi trống.');
  await withDeepControl(tabId,()=>deepCompose(tabId,value,{replace,submit:true}));markSubmission(tabId,Date.now());
  session.stateInfo={...session.stateInfo,state:'SUBMITTED',confidence:.98,reason:'Đã gửi qua CDP Input.',phaseStartedAt:Date.now(),evidence:['trusted_input_dispatched']};session.turnStartedAt=Date.now();
  await appendTimeline(tabId,{kind:'action',action:'send',textChars:value.length,source:'extension'}).catch(()=>{});await broadcast({kind:'action.sent',session:publicSession(session)});
  setTimeout(()=>requestSnapshot(tabId).catch(()=>{}),350);return {ok:true,tabId};
}

export async function doStop(tabId) {
  await withDeepControl(tabId,()=>deepClick(tabId,['[data-testid="stop-button"]','button[aria-label*="stop" i]'],'^(stop|stop generating|dừng|dừng tạo)$'));
  await appendTimeline(tabId,{kind:'action',action:'stop'}).catch(()=>{});setTimeout(()=>requestSnapshot(tabId).catch(()=>{}),250);return {ok:true};
}

export async function doRetryNow(tabId) {
  const latest=await requestSnapshot(tabId);if(!mayRetrySession(sessions.get(tabId)?.stateInfo))throw new Error(`Retry bị khóa vì trạng thái hiện tại là ${latest?.state||'unknown'}.`);
  await withDeepControl(tabId,()=>deepClick(tabId,[],'^(try again|retry|regenerate|thử lại|tạo lại|reconnect|kết nối lại)$'));
  markSubmission(tabId,Date.now());await appendTimeline(tabId,{kind:'action',action:'retry'}).catch(()=>{});setTimeout(()=>requestSnapshot(tabId).catch(()=>{}),400);return {ok:true};
}

async function waitForChatReady(tabId,timeoutMs=30_000) {
  const deadline=Date.now()+timeoutMs;let last;
  while(Date.now()<deadline){last=await chrome.tabs.sendMessage(tabId,{type:'sentinel.ping'}).catch(()=>null);if(last?.ok&&last.composer)return last;await new Promise(r=>setTimeout(r,400));}
  throw new Error('ChatGPT mới không sẵn sàng trong thời gian chờ.');
}

export async function continueNewChat(tabId,continuation=runtime.settings.handoff.continuation) {
  const source=sessions.get(tabId);if(!source?.snapshot)throw new Error('Không có Context Vault/snapshot để bàn giao.');
  const handoff=buildContextHandoff({title:source.title,url:source.url,conversationId:source.conversationId,turns:source.snapshot.turns,artifacts:source.artifacts,goal:source.snapshot.turns?.filter(x=>x.role==='user').at(-1)?.text},{maxChars:runtime.settings.handoff.maxChars,recentTurns:runtime.settings.handoff.recentTurns});
  const tab=await chrome.tabs.create({url:'https://chatgpt.com/',active:true});if(!tab.id)throw new Error('Không tạo được ChatGPT mới.');
  ensureSession(tab.id,tab);await waitForChatReady(tab.id);if(runtime.settings.deepObserve)await attachIfNeeded(tab.id,true);
  await doSend(tab.id,`${handoff}\n${String(continuation||'').trim()}`);
  await appendTimeline(tabId,{kind:'handoff',toTabId:tab.id,chars:handoff.length}).catch(()=>{});return {ok:true,newTabId:tab.id,handoffChars:handoff.length};
}

function sanitizeFilename(name){return String(name||'chatgpt-artifact').replace(/[\\/:*?"<>|]/g,'_').slice(0,180);}
export async function downloadArtifact(tabId,artifactId) {
  const session=sessions.get(tabId),artifact=session?.artifacts?.find(x=>x.artifactId===artifactId);if(!artifact)throw new Error('Không tìm thấy artifact trong phiên.');
  if(artifact.kind!=='file')throw new Error('Artifact GitHub không phải file tải xuống.');
  let downloadId=null;
  if(artifact.href&&/^https?:/i.test(artifact.href))downloadId=await chrome.downloads.download({url:artifact.href,filename:sanitizeFilename(artifact.name),saveAs:Boolean(runtime.settings.artifactDownloads.saveAs)});
  else {
    const response=await chrome.tabs.sendMessage(tabId,{type:'sentinel.command',command:'clickArtifact',params:{href:artifact.href,name:artifact.name}}).catch(()=>null);
    if(!response?.ok)throw new Error(response?.error||'Không thể kích hoạt download từ page.');
  }
  await appendTimeline(tabId,{kind:'artifact.download',artifactId,name:artifact.name,downloadId}).catch(()=>{});return {ok:true,downloadId,artifact};
}

export async function downloadAllArtifacts(tabId) {
  const files=(sessions.get(tabId)?.artifacts||[]).filter((x)=>x.kind==='file'&&x.downloadable);
  const results=[];
  for(const artifact of files){
    try{const result=await downloadArtifact(tabId,artifact.artifactId);results.push({artifactId:artifact.artifactId,name:artifact.name,ok:true,downloadId:result.downloadId});}
    catch(error){results.push({artifactId:artifact.artifactId,name:artifact.name,ok:false,error:safeError(error)});}
  }
  return {ok:results.some((x)=>x.ok),count:results.length,results};
}

export async function composeOnly(tabId,text,replace=true) {
  await withDeepControl(tabId,()=>deepCompose(tabId,String(text||''),{replace,submit:false}));return {ok:true};
}
