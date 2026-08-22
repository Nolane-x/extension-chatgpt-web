import { createOrchestratorService } from '../orchestrator/service.js';
import { createTaskCommandRouter } from '../orchestrator/commands.js';
import {
  loadOrchestratorSnapshot,saveTask,saveWorker,saveLease,saveCheckpoint,saveArtifacts
} from '../orchestrator/store.js';
import { runtime,sessions,publicSession,broadcast } from './runtime-state.js';
import { doSend } from './action-controller.js';
import { queueSend } from './scheduler.js';
import { requestSnapshot } from './session-runtime.js';

let initPromise=null;

async function waitTabUntil(tabId,states,timeoutMs=25_000){
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

const store={loadOrchestratorSnapshot,saveTask,saveWorker,saveLease,saveCheckpoint,saveArtifacts};

export const orchestratorService=createOrchestratorService({
  store,
  getSession:(tabId)=>publicSession(sessions.get(Number(tabId))),
  send:(tabId,text,params)=>doSend(Number(tabId),text,{replace:params?.replace!==false}),
  queueSend:(tabId,text,params)=>queueSend(Number(tabId),text,{...params,source:'task'}),
  waitUntil:waitTabUntil,
  broadcast
});

const routeTaskCommand=createTaskCommandRouter(orchestratorService,{
  getRecoveryPolicy:()=>({
    recoveryEnabled:Boolean(runtime.settings?.recovery?.enabled),
    retryDelayMs:Number(runtime.settings?.recovery?.baseMs)||10_000,
    replaceAfterMs:Math.max(60_000,Number(runtime.settings?.watchdog?.reattachCooldownMs||30_000)*4)
  })
});

function normalizeSession(session){
  if(!session)return null;
  return session.stateInfo?publicSession(session):session;
}

export async function initializeOrchestratorRuntime(){
  if(!initPromise){
    initPromise=(async()=>{
      const snapshot=await orchestratorService.initialize();
      runtime.hooks.orchestratorSync=async(session)=>orchestratorService.syncSession(normalizeSession(session));
      return snapshot;
    })().catch((error)=>{initPromise=null;throw error;});
  }
  return initPromise;
}

export async function handleOrchestratorCommand(action,params={},context={source:'ui'}){
  await initializeOrchestratorRuntime();
  if(action==='taskDashboard')return getOrchestratorDashboard();
  return routeTaskCommand(action,params,context);
}

export async function syncOrchestratorSession(session){
  await initializeOrchestratorRuntime();
  const normalized=normalizeSession(session);if(!normalized)return {updatedWorkers:0,artifactsChanged:0};
  return orchestratorService.syncSession(normalized);
}

export async function detachOrchestratorTab(tabId,now=Date.now()){
  await initializeOrchestratorRuntime();
  const id=Number(tabId),snapshot=orchestratorService.snapshot(),matches=snapshot.workers.filter((worker)=>worker.tabId===id&&worker.detachedAt==null),results=[];
  for(const worker of matches){
    try{results.push(await orchestratorService.detachWorker(worker.taskId,worker.id,now));}
    catch(error){results.push({workerId:worker.id,error:error instanceof Error?error.message:String(error)});}
  }
  return results;
}

export async function getOrchestratorDashboard(){
  await initializeOrchestratorRuntime();
  return orchestratorService.listTasks().map((task)=>orchestratorService.getTask(task.id,{includeCheckpoints:true}));
}
