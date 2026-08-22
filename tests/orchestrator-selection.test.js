import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWorker } from '../src/orchestrator/selection.js';

const task={id:'t1',status:'ACTIVE'};
const worker=(id,tabId,attachedAt=1,extra={})=>({id,taskId:'t1',tabId,attachedAt,detachedAt:null,leaseId:null,...extra});
const session=(state,extra={})=>({state,health:{level:'healthy'},queueCount:0,conversationId:null,...extra});

test('IDLE worker outranks COMPLETED and WAITING_USER deterministically',()=>{
  const workers=[worker('w-complete',2,1),worker('w-idle',1,2),worker('w-wait',3,3)];
  const sessions=new Map([[1,session('IDLE')],[2,session('COMPLETED')],[3,session('WAITING_USER')]]);
  const result=selectWorker(task,workers,sessions,{ownerId:'agent-a',intent:'send'},1000);
  assert.equal(result.worker.id,'w-idle');
  assert.ok(result.reasons.includes('state:IDLE'));
});

test('busy and DOM_DRIFT workers are excluded for new sends',()=>{
  const workers=[worker('w-deep',1),worker('w-stream',2),worker('w-drift',3),worker('w-idle',4)];
  const sessions=new Map([[1,session('DEEP_THINKING')],[2,session('STREAMING')],[3,session('DOM_DRIFT')],[4,session('IDLE')]]);
  assert.equal(selectWorker(task,workers,sessions,{ownerId:'agent-a',intent:'send'},1000).worker.id,'w-idle');
});

test('worker leased by another owner is excluded while same owner may reuse it',()=>{
  const workers=[worker('w1',1,1,{leaseId:'l1'}),worker('w2',2,2)];
  const sessions=new Map([[1,session('IDLE')],[2,session('COMPLETED')]]);
  const leases=[{id:'l1',workerId:'w1',ownerId:'agent-b',expiresAt:5000,revokedAt:null}];
  assert.equal(selectWorker(task,workers,sessions,{ownerId:'agent-a',leases},1000).worker.id,'w2');
  assert.equal(selectWorker(task,workers,sessions,{ownerId:'agent-b',leases},1000).worker.id,'w1');
});

test('health, queue depth and continuity affect scoring after state rank',()=>{
  const workers=[worker('w1',1,1),worker('w2',2,2)];
  const sessions=new Map([
    [1,session('IDLE',{health:{level:'degraded'},queueCount:2,conversationId:'c-old'})],
    [2,session('IDLE',{health:{level:'healthy'},queueCount:0,conversationId:'c-target'})]
  ]);
  const result=selectWorker(task,workers,sessions,{ownerId:'agent-a',preferredConversationId:'c-target'},1000);
  assert.equal(result.worker.id,'w2');
  assert.ok(result.score>100);
});

test('ties break by attachedAt then worker id',()=>{
  const workers=[worker('w-b',1,10),worker('w-a',2,10),worker('w-old',3,5)];
  const sessions=new Map([[1,session('IDLE')],[2,session('IDLE')],[3,session('IDLE')]]);
  assert.equal(selectWorker(task,workers,sessions,{ownerId:'agent-a'},1000).worker.id,'w-old');
  const tied=workers.slice(0,2);
  assert.equal(selectWorker(task,tied,sessions,{ownerId:'agent-a'},1000).worker.id,'w-a');
});

test('no eligible worker throws stable code',()=>{
  const workers=[worker('w1',1)];
  const sessions=new Map([[1,session('DOM_DRIFT')]]);
  assert.throws(()=>selectWorker(task,workers,sessions,{ownerId:'agent-a'},1000),(e)=>e?.code==='NO_ELIGIBLE_WORKER');
});
