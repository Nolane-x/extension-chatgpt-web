import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/orchestrator/index.js';

const required=[
  'createTask','updateTask','createWorkerBinding','detachWorker',
  'acquireLease','heartbeatLease','releaseLease','assertWorkerLease',
  'selectWorker','createCheckpoint','recommendWorkerRecovery','mergeTaskArtifacts',
  'openOrchestratorStore','loadOrchestratorSnapshot','saveTask','saveWorker','saveLease','saveCheckpoint','saveArtifacts'
];

test('orchestrator public facade exposes all stable core contracts',()=>{
  for(const name of required)assert.equal(typeof api[name],'function',name);
});

test('facade does not expose internal scoring/state constants',()=>{
  assert.equal('BUSY_SEND_STATES' in api,false);
  assert.equal('TASK_STATUSES' in api,false);
  assert.equal('CHECKPOINT_KINDS' in api,false);
});
