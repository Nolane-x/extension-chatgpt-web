import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckpoint } from '../src/orchestrator/checkpoints.js';

const baseTask=()=>({id:'t1',status:'ACTIVE',createdAt:1,updatedAt:1,workerIds:['w1'],headCheckpointId:null,metadata:{}});

test('checkpoint advances task head without mutating original task',()=>{
  const task=baseTask();
  const {task:next,checkpoint}=createCheckpoint(task,{kind:'CREATED',summary:' start '},10);
  assert.equal(task.headCheckpointId,null);
  assert.equal(checkpoint.parentId,null);
  assert.equal(checkpoint.summary,'start');
  assert.equal(checkpoint.taskId,'t1');
  assert.equal(next.headCheckpointId,checkpoint.id);
  assert.equal(next.updatedAt,10);
});

test('checkpoint chain uses current head as parent deterministically',()=>{
  const first=createCheckpoint(baseTask(),{kind:'PROGRESS',summary:'one',workerId:'w1'},10);
  const second=createCheckpoint(first.task,{kind:'PROGRESS',summary:'two',workerId:'w1'},20);
  assert.equal(second.checkpoint.parentId,first.checkpoint.id);
  assert.equal(first.checkpoint.summary,'one');
});

test('handoff checkpoint preserves context and artifact references',()=>{
  const {checkpoint}=createCheckpoint(baseTask(),{
    kind:'HANDOFF',summary:'move conversation',workerId:'w1',
    contextRef:{tabId:7,conversationId:'c-old'},artifactIds:['a1','a1','a2'],
    metadata:{toWorkerId:'w2',toConversationId:'c-new'}
  },30);
  assert.deepEqual(checkpoint.contextRef,{tabId:7,conversationId:'c-old'});
  assert.deepEqual(checkpoint.artifactIds,['a1','a2']);
  assert.deepEqual(checkpoint.metadata,{toWorkerId:'w2',toConversationId:'c-new'});
});

test('unsupported checkpoint kind is rejected',()=>{
  assert.throws(()=>createCheckpoint(baseTask(),{kind:'MAGIC',summary:'x'},10),(e)=>e?.code==='INVALID_TASK_STATE');
});
