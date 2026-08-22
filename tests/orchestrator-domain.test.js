import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, updateTask, createWorkerBinding, detachWorker } from '../src/orchestrator/domain.js';

test('createTask normalizes text and initializes an ACTIVE task',()=>{
  const task=createTask({title:'  A  ',goal:' G ',metadata:{priority:'high'}},1000);
  assert.equal(task.status,'ACTIVE');
  assert.equal(task.title,'A');
  assert.equal(task.goal,'G');
  assert.equal(task.createdAt,1000);
  assert.equal(task.updatedAt,1000);
  assert.deepEqual(task.workerIds,[]);
  assert.equal(task.headCheckpointId,null);
  assert.deepEqual(task.metadata,{priority:'high'});
  assert.match(task.id,/^task_/);
});

test('updateTask rejects an unknown task status',()=>{
  const task=createTask({title:'A',goal:'G'},1);
  assert.throws(()=>updateTask(task,{status:'BOGUS'},2),(error)=>error?.code==='INVALID_TASK_STATE');
});

test('updateTask preserves identity and createdAt while updating allowed fields',()=>{
  const task=createTask({title:'A',goal:'G'},1);
  const next=updateTask(task,{title:' B ',status:'PAUSED',metadata:{lane:'review'}},5);
  assert.equal(next.id,task.id);
  assert.equal(next.createdAt,1);
  assert.equal(next.updatedAt,5);
  assert.equal(next.title,'B');
  assert.equal(next.status,'PAUSED');
  assert.deepEqual(next.metadata,{lane:'review'});
});

test('worker binding records task/tab identity and detach is idempotent',()=>{
  const worker=createWorkerBinding({taskId:'t1',tabId:7,conversationId:'c1',role:' research '},1);
  assert.equal(worker.taskId,'t1');
  assert.equal(worker.tabId,7);
  assert.equal(worker.role,'research');
  assert.equal(worker.detachedAt,null);
  assert.match(worker.id,/^worker_/);
  const first=detachWorker(worker,9),second=detachWorker(first,12);
  assert.equal(first.detachedAt,9);
  assert.equal(second.detachedAt,9);
});

test('worker binding rejects invalid tab ids',()=>{
  assert.throws(()=>createWorkerBinding({taskId:'t1',tabId:0},1),/tabId/);
});
