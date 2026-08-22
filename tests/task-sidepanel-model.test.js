import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaskCardModel, buildTaskDetailModel, leaseTimeLeftMs,
  canHumanTakeover, taskAttentionLevel
} from '../src/sidepanel/task-model.js';

const NOW=1_800_000_000_000;
const task={id:'task_1',title:'Build release',goal:'Ship safely',status:'ACTIVE',workerIds:['w1','w2'],headCheckpointId:'cp2',updatedAt:NOW-5000};
const workers=[
  {id:'w1',taskId:'task_1',tabId:11,role:'worker',lastKnownState:'DEEP_THINKING',lastSeenAt:NOW-1000,detachedAt:null},
  {id:'w2',taskId:'task_1',tabId:12,role:'worker',lastKnownState:'COMPLETED',lastSeenAt:NOW-2000,detachedAt:null}
];
const leases=[{id:'lease_1',workerId:'w1',ownerId:'agent-a',ownerType:'agent',status:'ACTIVE',expiresAt:NOW+30000}];
const checkpoints=[{id:'cp1',taskId:'task_1',kind:'PROGRESS',createdAt:NOW-10000},{id:'cp2',taskId:'task_1',kind:'HANDOFF',createdAt:NOW-3000}];
const artifacts=[{id:'a1',taskId:'task_1',workerId:'w2',name:'build.zip',kind:'file',downloadState:'complete'}];

test('leaseTimeLeftMs clamps expired lease to zero',()=>{
  assert.equal(leaseTimeLeftMs({expiresAt:NOW+1200},NOW),1200);
  assert.equal(leaseTimeLeftMs({expiresAt:NOW-1},NOW),0);
});

test('task card reports worker, lease, checkpoint and artifact counts',()=>{
  const model=buildTaskCardModel({task,workers,leases,checkpoints,artifacts},NOW);
  assert.equal(model.workerCount,2);
  assert.equal(model.activeWorkerCount,2);
  assert.equal(model.leasedWorkerCount,1);
  assert.equal(model.artifactCount,1);
  assert.equal(model.checkpointCount,2);
  assert.equal(model.attention,'working');
});

test('DOM_DRIFT dominates task attention and detached workers are ignored',()=>{
  const model=buildTaskCardModel({task,workers:[...workers,{id:'w3',taskId:'task_1',tabId:13,lastKnownState:'DOM_DRIFT',detachedAt:null}],leases,checkpoints,artifacts},NOW);
  assert.equal(model.attention,'critical');
  assert.equal(taskAttentionLevel({task,workers:[{...workers[0],detachedAt:NOW-1}],leases:[],checkpoints:[],artifacts:[]},NOW),'working');
});

test('human takeover is offered only for a live active agent lease',()=>{
  assert.equal(canHumanTakeover(workers[0],leases[0],NOW),true);
  assert.equal(canHumanTakeover(workers[0],{...leases[0],ownerType:'human'},NOW),false);
  assert.equal(canHumanTakeover(workers[0],{...leases[0],expiresAt:NOW-1},NOW),false);
  assert.equal(canHumanTakeover({...workers[0],detachedAt:NOW-1},leases[0],NOW),false);
});

test('detail model joins current lease to each worker and sorts checkpoints newest first',()=>{
  const model=buildTaskDetailModel({task,workers,leases,checkpoints,artifacts},NOW);
  assert.equal(model.workers[0].id,'w1');
  assert.equal(model.workers[0].lease.ownerId,'agent-a');
  assert.equal(model.workers[0].lease.timeLeftMs,30000);
  assert.equal(model.workers[1].lease,null);
  assert.deepEqual(model.checkpoints.map(x=>x.id),['cp2','cp1']);
  assert.equal(model.artifacts[0].name,'build.zip');
});
