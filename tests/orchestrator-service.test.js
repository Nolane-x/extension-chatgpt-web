import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrchestratorService } from '../src/orchestrator/service.js';

function memoryStore(seed={}){
  const data={tasks:[],workers:[],leases:[],checkpoints:[],artifacts:[],...structuredClone(seed)};
  const upsert=(name,record)=>{const i=data[name].findIndex(x=>x.id===record.id);if(i>=0)data[name][i]=structuredClone(record);else data[name].push(structuredClone(record));return structuredClone(record);};
  return {
    data,
    async loadOrchestratorSnapshot(){return structuredClone(data);},
    async saveTask(x){return upsert('tasks',x);},async saveWorker(x){return upsert('workers',x);},async saveLease(x){return upsert('leases',x);},async saveCheckpoint(x){return upsert('checkpoints',x);},
    async saveArtifacts(xs){for(const x of xs)upsert('artifacts',x);return structuredClone(xs);}
  };
}
function harness(seed={}){
  const store=memoryStore(seed),sessions=new Map(),events=[],sent=[],queued=[],waited=[];
  const service=createOrchestratorService({
    store,
    getSession:(tabId)=>sessions.get(tabId)||null,
    send:async(tabId,text,params)=>{sent.push({tabId,text,params});return {ok:true};},
    queueSend:async(tabId,text,params)=>{queued.push({tabId,text,params});return {ok:true};},
    waitUntil:async(tabId,states,timeoutMs)=>{waited.push({tabId,states,timeoutMs});return {ok:true,matched:states[0]};},
    broadcast:async(event)=>events.push(structuredClone(event))
  });
  return {service,store,sessions,events,sent,queued,waited};
}

async function prepared(){
  const h=harness();await h.service.initialize();
  h.sessions.set(7,{tabId:7,state:'IDLE',conversationId:'c1',health:{level:'healthy'},queueCount:0,artifacts:[],lastSeenAt:100});
  const task=await h.service.createTask({title:'Build',goal:'Finish'},100);
  const worker=await h.service.bindWorker(task.id,7,'coding',110);
  return {...h,task,worker};
}

test('initialize hydrates persisted task graph',async()=>{
  const seed={tasks:[{id:'t1',title:'T',goal:'G',status:'ACTIVE',createdAt:1,updatedAt:1,workerIds:['w1'],headCheckpointId:null,metadata:{}}],workers:[{id:'w1',taskId:'t1',tabId:7,conversationId:'c',role:'coding',attachedAt:1,detachedAt:null,leaseId:null,lastKnownState:'IDLE',lastSeenAt:1}]};
  const h=harness(seed);await h.service.initialize();
  const got=h.service.getTask('t1');
  assert.equal(got.task.id,'t1');assert.equal(got.workers[0].id,'w1');
});

test('create and bind worker persist records and reject cross-task live tab reuse',async()=>{
  const h=harness();await h.service.initialize();h.sessions.set(7,{tabId:7,state:'IDLE',conversationId:'c1',health:{level:'healthy'},artifacts:[]});
  const first=await h.service.createTask({title:'A',goal:'G'},10);const worker=await h.service.bindWorker(first.id,7,'research',11);
  assert.equal(worker.conversationId,'c1');assert.ok(h.store.data.tasks[0].workerIds.includes(worker.id));
  const second=await h.service.createTask({title:'B',goal:'G'},12);
  await assert.rejects(()=>h.service.bindWorker(second.id,7,'review',13),(e)=>e?.code==='WORKER_ALREADY_BOUND');
});

test('acquire best worker selects safe worker and returns an exclusive lease',async()=>{
  const h=harness();await h.service.initialize();
  h.sessions.set(1,{tabId:1,state:'DEEP_THINKING',health:{level:'healthy'},queueCount:0,artifacts:[]});
  h.sessions.set(2,{tabId:2,state:'IDLE',health:{level:'healthy'},queueCount:0,artifacts:[]});
  const task=await h.service.createTask({title:'T',goal:'G'},1);await h.service.bindWorker(task.id,1,'research',2);const w2=await h.service.bindWorker(task.id,2,'coding',3);
  const result=await h.service.acquireBestWorker(task.id,{ownerId:'agent-a',ttlMs:10000},4);
  assert.equal(result.worker.id,w2.id);assert.equal(result.lease.ownerId,'agent-a');
  await assert.rejects(()=>h.service.acquireLease(task.id,w2.id,{ownerId:'agent-b',ownerType:'agent',ttlMs:10000},5),(e)=>e?.code==='LEASE_CONFLICT');
});

test('taskSend rejects invalid lease and delegates only with a valid lease',async()=>{
  const h=await prepared();
  await assert.rejects(()=>h.service.taskSend({taskId:h.task.id,workerId:h.worker.id,leaseId:'bad',ownerId:'agent-a',text:'go'},120),(e)=>['LEASE_EXPIRED','LEASE_OWNER_MISMATCH'].includes(e?.code));
  assert.equal(h.sent.length,0);
  const lease=await h.service.acquireLease(h.task.id,h.worker.id,{ownerId:'agent-a',ownerType:'agent',ttlMs:10000},121);
  const result=await h.service.taskSend({taskId:h.task.id,workerId:h.worker.id,leaseId:lease.id,ownerId:'agent-a',text:'go'},122);
  assert.equal(result.ok,true);assert.equal(h.sent.length,1);assert.equal(h.sent[0].tabId,7);
  assert.ok(h.store.data.checkpoints.some(x=>x.kind==='PROGRESS'));
});

test('taskQueueSend and taskWait delegate to the bound worker tab',async()=>{
  const h=await prepared();const lease=await h.service.acquireLease(h.task.id,h.worker.id,{ownerId:'agent-a',ownerType:'agent',ttlMs:10000},121);
  await h.service.taskQueueSend({taskId:h.task.id,workerId:h.worker.id,leaseId:lease.id,ownerId:'agent-a',text:'next',expiresInMs:50000},122);
  assert.equal(h.queued[0].tabId,7);assert.equal(h.queued[0].text,'next');
  const waited=await h.service.taskWait({taskId:h.task.id,workerId:h.worker.id,states:['COMPLETED'],timeoutMs:12000});
  assert.equal(waited.matched,'COMPLETED');assert.deepEqual(h.waited[0],{tabId:7,states:['COMPLETED'],timeoutMs:12000});
});

test('syncSession updates worker state and task artifact provenance',async()=>{
  const h=await prepared();
  await h.service.syncSession({tabId:7,state:'COMPLETED',conversationId:'c2',lastSeenAt:200,artifacts:[{artifactId:'sa1',name:'bundle.zip',kind:'file',href:'https://chatgpt.com/f',downloadId:9,downloadState:'complete',source:'dom',detectedAt:190}]},200);
  const got=h.service.getTask(h.task.id);
  assert.equal(got.workers[0].lastKnownState,'COMPLETED');assert.equal(got.workers[0].conversationId,'c2');
  assert.equal(got.artifacts.length,1);assert.equal(got.artifacts[0].sessionArtifactId,'sa1');assert.equal(got.artifacts[0].downloadId,9);
});

test('recoveryPlan prioritizes human review before retry/wait',async()=>{
  const h=harness();await h.service.initialize();
  h.sessions.set(1,{tabId:1,state:'DOM_DRIFT',health:{level:'critical'},artifacts:[]});
  h.sessions.set(2,{tabId:2,state:'CONNECTION_LOST',health:{level:'degraded'},artifacts:[]});
  const task=await h.service.createTask({title:'T',goal:'G'},1);await h.service.bindWorker(task.id,1,'review',2);await h.service.bindWorker(task.id,2,'coding',3);
  const plan=h.service.recoveryPlan(task.id,{recoveryEnabled:true,hasCheckpoint:true},10);
  assert.equal(plan.recommendations[0].recommendation.action,'HUMAN_REVIEW');
  assert.ok(plan.recommendations.some(x=>x.recommendation.action==='RETRY'));
});
