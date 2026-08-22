import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrchestratorSnapshot, serializeOrchestratorSnapshot, deserializeOrchestratorSnapshot } from '../src/orchestrator/store-codec.js';

const snapshot={
  tasks:[{id:'t1',title:'Task',goal:'Goal',status:'ACTIVE',createdAt:1,updatedAt:9,workerIds:['w1'],headCheckpointId:'cp2',metadata:{priority:1}}],
  workers:[{id:'w1',taskId:'t1',tabId:7,conversationId:'c1',role:'coding',attachedAt:2,detachedAt:8,leaseId:null,lastKnownState:'COMPLETED',lastSeenAt:8}],
  leases:[
    {id:'l-expired',workerId:'w1',ownerId:'a',ownerType:'agent',issuedAt:2,heartbeatAt:2,expiresAt:3,revokedAt:null,reason:null},
    {id:'l-revoked',workerId:'w1',ownerId:'human',ownerType:'human',issuedAt:4,heartbeatAt:4,expiresAt:10,revokedAt:5,reason:'released'}
  ],
  checkpoints:[
    {id:'cp1',taskId:'t1',parentId:null,kind:'CREATED',createdAt:1,summary:'start',workerId:null,contextRef:null,artifactIds:[],metadata:{}},
    {id:'cp2',taskId:'t1',parentId:'cp1',kind:'ARTIFACT',createdAt:6,summary:'zip',workerId:'w1',contextRef:{tabId:7,conversationId:'c1'},artifactIds:['ta1'],metadata:{}}
  ],
  artifacts:[{id:'ta1',taskId:'t1',workerId:'w1',sessionArtifactId:'sa1',tabId:7,conversationId:'c1',name:'bundle.zip',kind:'file',href:'https://chatgpt.com/f',downloadId:4,downloadState:'complete',detectedAt:6,provenance:{source:'dom',checkpointId:'cp2'}}]
};

test('snapshot codec round-trips the complete task graph including stale leases',()=>{
  const text=serializeOrchestratorSnapshot(snapshot);
  const restored=deserializeOrchestratorSnapshot(text);
  assert.deepEqual(restored,normalizeOrchestratorSnapshot(snapshot));
  assert.equal(restored.leases.length,2);
  assert.equal(restored.leases[0].id,'l-expired');
  assert.equal(restored.leases[1].revokedAt,5);
  assert.equal(restored.tasks[0].headCheckpointId,'cp2');
  assert.equal(restored.artifacts[0].provenance.checkpointId,'cp2');
});

test('normalization drops duplicate ids deterministically and clones input',()=>{
  const input={...snapshot,tasks:[snapshot.tasks[0],{...snapshot.tasks[0],title:'duplicate'}]};
  const normalized=normalizeOrchestratorSnapshot(input);
  assert.equal(normalized.tasks.length,1);
  assert.equal(normalized.tasks[0].title,'Task');
  normalized.tasks[0].title='changed';
  assert.equal(snapshot.tasks[0].title,'Task');
});

test('invalid serialized payload fails closed',()=>{
  assert.throws(()=>deserializeOrchestratorSnapshot('{bad json'),/orchestrator snapshot/i);
});
