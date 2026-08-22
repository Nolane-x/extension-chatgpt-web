import { createTask as createTaskRecord,updateTask as updateTaskRecord,createWorkerBinding,detachWorker as detachWorkerRecord } from './domain.js';
import { acquireLease as acquireLeaseRecord,heartbeatLease as heartbeatLeaseRecord,releaseLease as releaseLeaseRecord,assertWorkerLease } from './leases.js';
import { selectWorker } from './selection.js';
import { createCheckpoint as createCheckpointRecord } from './checkpoints.js';
import { recommendWorkerRecovery } from './recovery.js';
import { mergeTaskArtifacts } from './artifacts.js';
import { normalizeOrchestratorSnapshot } from './store-codec.js';

const RECOVERY_PRIORITY={HUMAN_REVIEW:0,HANDOFF:1,REPLACE:2,RETRY:3,WAIT:4,NONE:5};

function fail(code,message){const error=new Error(`${code}: ${message}`);error.code=code;throw error;}
function clone(value){return structuredClone(value);}
function requireFn(value,name){if(typeof value!=='function')throw new TypeError(`${name} adapter is required`);return value;}

export function createOrchestratorService(adapters={}){
  const store=adapters.store||{};
  const getSession=requireFn(adapters.getSession,'getSession');
  const send=requireFn(adapters.send,'send');
  const queueSend=requireFn(adapters.queueSend,'queueSend');
  const waitUntil=requireFn(adapters.waitUntil,'waitUntil');
  const broadcast=typeof adapters.broadcast==='function'?adapters.broadcast:async()=>{};
  for(const name of ['loadOrchestratorSnapshot','saveTask','saveWorker','saveLease','saveCheckpoint','saveArtifacts'])requireFn(store[name],`store.${name}`);

  const state={tasks:new Map(),workers:new Map(),leases:new Map(),checkpoints:new Map(),artifacts:new Map(),initialized:false};

  function ensureInitialized(){if(!state.initialized)fail('ORCHESTRATOR_NOT_INITIALIZED','initialize() must complete first');}
  function taskById(taskId){const task=state.tasks.get(String(taskId||''));if(!task)fail('TASK_NOT_FOUND',`task ${taskId||''} not found`);return task;}
  function workerById(taskId,workerId){const worker=state.workers.get(String(workerId||''));if(!worker||worker.taskId!==String(taskId||''))fail('WORKER_NOT_FOUND',`worker ${workerId||''} not found in task`);if(worker.detachedAt!=null)fail('WORKER_DETACHED',`worker ${workerId} is detached`);return worker;}
  function workersFor(taskId,{includeDetached=false}={}){return [...state.workers.values()].filter(w=>w.taskId===taskId&&(includeDetached||w.detachedAt==null));}
  function leasesForWorkers(workers){const ids=new Set(workers.map(w=>w.id));return [...state.leases.values()].filter(l=>ids.has(l.workerId));}
  function checkpointsFor(taskId){return [...state.checkpoints.values()].filter(c=>c.taskId===taskId).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||String(a.id).localeCompare(String(b.id),'en'));}
  function artifactsFor(taskId){return [...state.artifacts.values()].filter(a=>a.taskId===taskId).sort((a,b)=>(a.detectedAt||0)-(b.detectedAt||0)||String(a.id).localeCompare(String(b.id),'en'));}
  function leaseState(){return {workers:[...state.workers.values()].map(clone),leases:[...state.leases.values()].map(clone)};}
  async function persistLeaseState(next){
    state.workers.clear();for(const worker of next.workers){state.workers.set(worker.id,clone(worker));await store.saveWorker(worker);}
    state.leases.clear();for(const lease of next.leases){state.leases.set(lease.id,clone(lease));await store.saveLease(lease);}
  }
  async function emit(kind,payload){await broadcast({kind,...clone(payload)});}

  async function initialize(){
    if(state.initialized)return snapshot();
    const loaded=normalizeOrchestratorSnapshot(await store.loadOrchestratorSnapshot());
    for(const name of ['tasks','workers','leases','checkpoints','artifacts']){state[name].clear();for(const record of loaded[name])state[name].set(record.id,clone(record));}
    state.initialized=true;return snapshot();
  }
  function snapshot(){return normalizeOrchestratorSnapshot({tasks:[...state.tasks.values()],workers:[...state.workers.values()],leases:[...state.leases.values()],checkpoints:[...state.checkpoints.values()],artifacts:[...state.artifacts.values()]});}
  function getTask(taskId,{includeCheckpoints=true}={}){
    ensureInitialized();const task=taskById(taskId),workers=workersFor(task.id,{includeDetached:true});
    return {task:clone(task),workers:workers.map(clone),leases:leasesForWorkers(workers).map(clone),checkpoints:includeCheckpoints?checkpointsFor(task.id).map(clone):undefined,artifacts:artifactsFor(task.id).map(clone)};
  }
  function listTasks({status}={}){ensureInitialized();const target=status?String(status).toUpperCase():null;return [...state.tasks.values()].filter(t=>!target||t.status===target).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)||String(a.id).localeCompare(String(b.id),'en')).map(clone);}

  async function createTask(input,now=Date.now()){
    ensureInitialized();const task=createTaskRecord(input,now);state.tasks.set(task.id,clone(task));await store.saveTask(task);await emit('task.created',{task});return clone(task);
  }
  async function updateTask(taskId,patch,now=Date.now()){
    ensureInitialized();const next=updateTaskRecord(taskById(taskId),patch,now);state.tasks.set(next.id,clone(next));await store.saveTask(next);await emit('task.updated',{task:next});return clone(next);
  }
  async function bindWorker(taskId,tabId,role='worker',now=Date.now()){
    ensureInitialized();const task=taskById(taskId),id=Number(tabId),session=getSession(id);if(!session)fail('SESSION_NOT_FOUND',`ChatGPT session for tab ${id} not found`);
    const existing=[...state.workers.values()].find(w=>w.tabId===id&&w.detachedAt==null);
    if(existing){if(existing.taskId===task.id)return clone(existing);fail('WORKER_ALREADY_BOUND',`tab ${id} is already bound to task ${existing.taskId}`);}
    const worker=createWorkerBinding({taskId:task.id,tabId:id,role,conversationId:session.conversationId??null},now);
    worker.lastKnownState=String(session.state||'DISCOVERED');worker.lastSeenAt=Number(session.lastSeenAt||now);
    const nextTask={...task,workerIds:[...new Set([...(task.workerIds||[]),worker.id])],updatedAt:Number(now)};
    state.workers.set(worker.id,clone(worker));state.tasks.set(task.id,clone(nextTask));await store.saveWorker(worker);await store.saveTask(nextTask);await emit('task.worker.bound',{taskId:task.id,worker});return clone(worker);
  }
  async function detachWorker(taskId,workerId,now=Date.now()){
    ensureInitialized();taskById(taskId);const current=workerById(taskId,workerId),worker=detachWorkerRecord(current,now);state.workers.set(worker.id,clone(worker));await store.saveWorker(worker);await emit('task.worker.detached',{taskId,worker});return clone(worker);
  }

  async function acquireLease(taskId,workerId,input={},now=Date.now()){
    ensureInitialized();taskById(taskId);workerById(taskId,workerId);const next=leaseState();const lease=acquireLeaseRecord(next,{...input,workerId},now);await persistLeaseState(next);await emit('task.lease.acquired',{taskId,workerId,lease});return clone(lease);
  }
  async function heartbeatLease(taskId,workerId,input={},now=Date.now()){
    ensureInitialized();taskById(taskId);workerById(taskId,workerId);const next=leaseState();const lease=heartbeatLeaseRecord(next,{...input,workerId},now);await persistLeaseState(next);await emit('task.lease.heartbeat',{taskId,workerId,lease});return clone(lease);
  }
  async function releaseLease(taskId,workerId,input={},now=Date.now()){
    ensureInitialized();taskById(taskId);const current=state.workers.get(String(workerId||''));if(!current||current.taskId!==taskId)fail('WORKER_NOT_FOUND',`worker ${workerId} not found`);
    const next=leaseState();const lease=releaseLeaseRecord(next,{...input,workerId},now);await persistLeaseState(next);await emit('task.lease.released',{taskId,workerId,lease});return clone(lease);
  }
  async function acquireBestWorker(taskId,input={},now=Date.now()){
    ensureInitialized();const task=taskById(taskId),workers=workersFor(task.id),sessionIndex=new Map(workers.map(w=>[w.tabId,getSession(w.tabId)]).filter(([,s])=>Boolean(s)));
    const selected=selectWorker(task,workers,sessionIndex,{...input,leases:[...state.leases.values()]},now);
    const next=leaseState();const lease=acquireLeaseRecord(next,{workerId:selected.worker.id,ownerId:input.ownerId,ownerType:input.ownerType||'agent',ttlMs:input.ttlMs},now);
    await persistLeaseState(next);const worker=state.workers.get(selected.worker.id);await emit('task.lease.acquired',{taskId,workerId:worker.id,lease,selection:{score:selected.score,reasons:selected.reasons}});return {worker:clone(worker),lease:clone(lease),score:selected.score,reasons:[...selected.reasons]};
  }
  function guard(taskId,workerId,leaseId,ownerId,now){taskById(taskId);const worker=workerById(taskId,workerId),next=leaseState();assertWorkerLease(next,{workerId:worker.id,leaseId,ownerId},now);return worker;}

  async function checkpoint(taskId,input,now=Date.now()){
    ensureInitialized();const current=taskById(taskId),result=createCheckpointRecord(current,input,now);state.tasks.set(taskId,clone(result.task));state.checkpoints.set(result.checkpoint.id,clone(result.checkpoint));await store.saveTask(result.task);await store.saveCheckpoint(result.checkpoint);await emit('task.checkpoint.created',{taskId,checkpoint:result.checkpoint});return {task:clone(result.task),checkpoint:clone(result.checkpoint)};
  }
  async function taskSend(input,now=Date.now()){
    ensureInitialized();const worker=guard(input.taskId,input.workerId,input.leaseId,input.ownerId,now),session=getSession(worker.tabId);if(!session)fail('SESSION_NOT_FOUND',`session ${worker.tabId} missing`);if(session.state==='DOM_DRIFT')fail('WORKER_UNSAFE','DOM_DRIFT worker cannot send');
    const text=String(input.text||'').trim();if(!text)fail('INVALID_INPUT','text is required');const result=await send(worker.tabId,text,{replace:input.replace!==false});
    const cp=await checkpoint(input.taskId,{kind:'PROGRESS',summary:`Đã gửi prompt qua worker ${worker.id}.`,workerId:worker.id,contextRef:{tabId:worker.tabId,conversationId:session.conversationId??null},metadata:{action:'send',textChars:text.length}},now);
    await emit('task.action.sent',{taskId:input.taskId,workerId:worker.id,checkpointId:cp.checkpoint.id});return {...result,workerId:worker.id,checkpointId:cp.checkpoint.id};
  }
  async function taskQueueSend(input,now=Date.now()){
    ensureInitialized();const worker=guard(input.taskId,input.workerId,input.leaseId,input.ownerId,now),session=getSession(worker.tabId);if(!session)fail('SESSION_NOT_FOUND',`session ${worker.tabId} missing`);if(session.state==='DOM_DRIFT')fail('WORKER_UNSAFE','DOM_DRIFT worker cannot queue send');
    const text=String(input.text||'').trim();if(!text)fail('INVALID_INPUT','text is required');const result=await queueSend(worker.tabId,text,{expiresInMs:input.expiresInMs,handoffOnLimit:input.handoffOnLimit,source:'task'});
    const cp=await checkpoint(input.taskId,{kind:'PROGRESS',summary:`Đã xếp prompt cho worker ${worker.id}.`,workerId:worker.id,contextRef:{tabId:worker.tabId,conversationId:session.conversationId??null},metadata:{action:'queue_send',textChars:text.length}},now);
    await emit('task.action.queued',{taskId:input.taskId,workerId:worker.id,checkpointId:cp.checkpoint.id});return {...result,workerId:worker.id,checkpointId:cp.checkpoint.id};
  }
  async function taskWait(input){ensureInitialized();taskById(input.taskId);const worker=workerById(input.taskId,input.workerId);return waitUntil(worker.tabId,input.states,input.timeoutMs);}

  async function syncSession(session,now=Date.now()){
    ensureInitialized();if(!session?.tabId)return {updatedWorkers:0,artifactsChanged:0};const bound=[...state.workers.values()].filter(w=>w.tabId===Number(session.tabId)&&w.detachedAt==null);let artifactChanges=0;
    for(const current of bound){
      const worker={...current,conversationId:session.conversationId??current.conversationId??null,lastKnownState:String(session.state||current.lastKnownState||'DISCOVERED'),lastSeenAt:Number(session.lastSeenAt||now)};state.workers.set(worker.id,clone(worker));await store.saveWorker(worker);
      const task=state.tasks.get(worker.taskId);if(!task)continue;
      const incoming=(Array.isArray(session.artifacts)?session.artifacts:[]).filter(a=>a?.artifactId).map(a=>({
        id:`taskArtifact_${worker.id}_${a.artifactId}`,taskId:worker.taskId,workerId:worker.id,sessionArtifactId:String(a.artifactId),tabId:worker.tabId,conversationId:session.conversationId??worker.conversationId??null,
        name:a.name||'artifact',kind:a.kind||'unknown',href:a.href??null,downloadId:a.downloadId??null,downloadState:a.downloadState??null,detectedAt:Number(a.detectedAt||now),provenance:{source:a.source||'session',checkpointId:task.headCheckpointId||null}
      }));
      const existing=artifactsFor(worker.taskId),merged=mergeTaskArtifacts(existing,incoming);artifactChanges+=Math.max(0,merged.length-existing.length);
      for(const item of merged)state.artifacts.set(item.id,clone(item));if(merged.length)await store.saveArtifacts(merged);
    }
    if(bound.length)await emit('task.session.synced',{tabId:Number(session.tabId),workerIds:bound.map(w=>w.id),artifactsChanged:artifactChanges});return {updatedWorkers:bound.length,artifactsChanged:artifactChanges};
  }
  function listArtifacts(taskId){ensureInitialized();taskById(taskId);return artifactsFor(taskId).map(clone);}
  function listCheckpoints(taskId){ensureInitialized();taskById(taskId);return checkpointsFor(taskId).map(clone);}
  function recoveryPlan(taskId,policy={},now=Date.now()){
    ensureInitialized();const task=taskById(taskId),workers=workersFor(task.id,{includeDetached:true}),hasCheckpoint=task.headCheckpointId!=null;
    const recommendations=workers.map(worker=>({worker:clone(worker),recommendation:recommendWorkerRecovery(worker,getSession(worker.tabId),{...policy,hasCheckpoint:policy.hasCheckpoint??hasCheckpoint},now)}));
    recommendations.sort((a,b)=>(RECOVERY_PRIORITY[a.recommendation.action]??99)-(RECOVERY_PRIORITY[b.recommendation.action]??99)||String(a.worker.id).localeCompare(String(b.worker.id),'en'));
    return {taskId:task.id,recommendations};
  }

  return {initialize,snapshot,getTask,listTasks,createTask,updateTask,bindWorker,detachWorker,acquireLease,heartbeatLease,releaseLease,acquireBestWorker,taskSend,taskQueueSend,taskWait,checkpoint,listCheckpoints,listArtifacts,recoveryPlan,syncSession};
}
