import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireLease, heartbeatLease, releaseLease, assertWorkerLease, isLeaseValid } from '../src/orchestrator/leases.js';

function state(){return {leases:[],workers:[{id:'w1',tabId:10,detachedAt:null,leaseId:null}]};}

test('lease is exclusive across owners while valid',()=>{
  const s=state();
  const lease=acquireLease(s,{workerId:'w1',ownerId:'agent-a',ownerType:'agent',ttlMs:5000},1000);
  assert.equal(s.workers[0].leaseId,lease.id);
  assert.throws(()=>acquireLease(s,{workerId:'w1',ownerId:'agent-b',ownerType:'agent',ttlMs:5000},1200),(e)=>e?.code==='LEASE_CONFLICT');
  assert.doesNotThrow(()=>assertWorkerLease(s,{workerId:'w1',leaseId:lease.id,ownerId:'agent-a'},2000));
});

test('same owner renews the existing lease instead of creating another',()=>{
  const s=state();
  const a=acquireLease(s,{workerId:'w1',ownerId:'agent-a',ownerType:'agent',ttlMs:5000},1000);
  const b=acquireLease(s,{workerId:'w1',ownerId:'agent-a',ownerType:'agent',ttlMs:9000},2000);
  assert.equal(a.id,b.id);
  assert.equal(s.leases.length,1);
  assert.equal(b.expiresAt,11000);
  assert.equal(b.heartbeatAt,2000);
});

test('expired lease cannot be resurrected by stale heartbeat',()=>{
  const s=state();
  const lease=acquireLease(s,{workerId:'w1',ownerId:'agent-a',ownerType:'agent',ttlMs:5000},1000);
  assert.equal(isLeaseValid(lease,5999),true);
  assert.equal(isLeaseValid(lease,6000),false);
  assert.throws(()=>heartbeatLease(s,{workerId:'w1',leaseId:lease.id,ownerId:'agent-a',ttlMs:5000},6000),(e)=>e?.code==='LEASE_EXPIRED');
});

test('human takeover revokes an agent lease and receives a new lease',()=>{
  const s=state();
  const agent=acquireLease(s,{workerId:'w1',ownerId:'agent-a',ownerType:'agent',ttlMs:60000},1000);
  const human=acquireLease(s,{workerId:'w1',ownerId:'human-ui',ownerType:'human',ttlMs:60000,takeover:true},2000);
  assert.notEqual(human.id,agent.id);
  assert.equal(s.leases.find(x=>x.id===agent.id).revokedAt,2000);
  assert.equal(s.workers[0].leaseId,human.id);
});

test('agent cannot takeover another valid agent lease',()=>{
  const s=state();
  acquireLease(s,{workerId:'w1',ownerId:'agent-a',ownerType:'agent',ttlMs:60000},1000);
  assert.throws(()=>acquireLease(s,{workerId:'w1',ownerId:'agent-b',ownerType:'agent',ttlMs:60000,takeover:true},2000),(e)=>e?.code==='LEASE_CONFLICT');
});

test('release is idempotent and revoked lease fails the action guard',()=>{
  const s=state();
  const lease=acquireLease(s,{workerId:'w1',ownerId:'agent-a',ownerType:'agent',ttlMs:60000},1000);
  const first=releaseLease(s,{workerId:'w1',leaseId:lease.id,ownerId:'agent-a',reason:'done'},2000);
  const second=releaseLease(s,{workerId:'w1',leaseId:lease.id,ownerId:'agent-a'},3000);
  assert.equal(first.revokedAt,2000);
  assert.equal(second.revokedAt,2000);
  assert.equal(s.workers[0].leaseId,null);
  assert.throws(()=>assertWorkerLease(s,{workerId:'w1',leaseId:lease.id,ownerId:'agent-a'},3000),(e)=>e?.code==='LEASE_REVOKED');
});

test('detached worker cannot receive or use a lease',()=>{
  const s=state();s.workers[0].detachedAt=999;
  assert.throws(()=>acquireLease(s,{workerId:'w1',ownerId:'agent-a',ownerType:'agent',ttlMs:5000},1000),(e)=>e?.code==='WORKER_DETACHED');
});
