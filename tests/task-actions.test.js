import test from 'node:test';
import assert from 'node:assert/strict';
import { findHumanLease,buildTaskSendParams } from '../src/sidepanel/task-actions.js';
const now=1_800_000_000_000;
const bundle={task:{id:'task_1'},workers:[{id:'w1',taskId:'task_1'}],leases:[
 {id:'agent',workerId:'w1',ownerId:'agent-a',ownerType:'agent',status:'ACTIVE',expiresAt:now+50000},
 {id:'expired-human',workerId:'w1',ownerId:'human-ui',ownerType:'human',status:'ACTIVE',expiresAt:now-1},
 {id:'human',workerId:'w1',ownerId:'human-ui',ownerType:'human',status:'ACTIVE',expiresAt:now+80000}
]};

test('findHumanLease returns only live human-ui lease',()=>{
 assert.equal(findHumanLease(bundle,'w1',now)?.id,'human');
 assert.equal(findHumanLease(bundle,'missing',now),null);
});

test('buildTaskSendParams binds action to task worker lease and owner',()=>{
 assert.deepEqual(buildTaskSendParams(bundle,'w1','Do work',now),{taskId:'task_1',workerId:'w1',leaseId:'human',ownerId:'human-ui',text:'Do work'});
});

test('buildTaskSendParams rejects empty prompt or missing lease',()=>{
 assert.throws(()=>buildTaskSendParams(bundle,'w1','   ',now),/Prompt/);
 assert.throws(()=>buildTaskSendParams({...bundle,leases:[]},'w1','x',now),/lease/);
});
