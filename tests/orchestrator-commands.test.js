import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskCommandRouter } from '../src/orchestrator/commands.js';

function fakeService(){
  const calls=[];
  const service={
    calls,
    createTask:async(...a)=>{calls.push(['createTask',...a]);return {id:'t'};},listTasks:(...a)=>{calls.push(['listTasks',...a]);return [{id:'t'}];},getTask:(...a)=>{calls.push(['getTask',...a]);return {task:{id:'t'}};},updateTask:async(...a)=>{calls.push(['updateTask',...a]);return {id:'t'};},bindWorker:async(...a)=>{calls.push(['bindWorker',...a]);return {id:'w'};},detachWorker:async(...a)=>{calls.push(['detachWorker',...a]);return {id:'w'};},
    acquireLease:async(...a)=>{calls.push(['acquireLease',...a]);return {id:'l'};},heartbeatLease:async(...a)=>{calls.push(['heartbeatLease',...a]);return {id:'l'};},releaseLease:async(...a)=>{calls.push(['releaseLease',...a]);return {id:'l'};},acquireBestWorker:async(...a)=>{calls.push(['acquireBestWorker',...a]);return {worker:{id:'w'},lease:{id:'l'}};},
    taskSend:async(...a)=>{calls.push(['taskSend',...a]);return {ok:true};},taskQueueSend:async(...a)=>{calls.push(['taskQueueSend',...a]);return {ok:true};},taskWait:async(...a)=>{calls.push(['taskWait',...a]);return {ok:true};},checkpoint:async(...a)=>{calls.push(['checkpoint',...a]);return {checkpoint:{id:'c'}};},listCheckpoints:(...a)=>{calls.push(['listCheckpoints',...a]);return [];},listArtifacts:(...a)=>{calls.push(['listArtifacts',...a]);return [];},recoveryPlan:(...a)=>{calls.push(['recoveryPlan',...a]);return {recommendations:[]};}
  };return service;
}

test('agent lease acquisition is forced to agent ownerType and cannot request takeover',async()=>{
  const service=fakeService(),route=createTaskCommandRouter(service);
  await route('taskAcquireLease',{taskId:'t',workerId:'w',ownerId:'agent-1',ttlMs:9000,ownerType:'human',takeover:true},{source:'agent'});
  const call=service.calls.at(-1);assert.equal(call[0],'acquireLease');assert.equal(call[3].ownerType,'agent');assert.equal(call[3].takeover,false);
});

test('human takeover is internal UI-only',async()=>{
  const service=fakeService(),route=createTaskCommandRouter(service);
  await assert.rejects(()=>route('taskHumanTakeover',{taskId:'t',workerId:'w',ownerId:'human-ui'},{source:'agent'}),/không được phép/);
  await route('taskHumanTakeover',{taskId:'t',workerId:'w',ownerId:'human-ui',ttlMs:10000},{source:'ui'});
  const call=service.calls.at(-1);assert.equal(call[0],'acquireLease');assert.equal(call[3].ownerType,'human');assert.equal(call[3].takeover,true);
});

test('task send and queue commands delegate without changing lease identity',async()=>{
  const service=fakeService(),route=createTaskCommandRouter(service),params={taskId:'t',workerId:'w',leaseId:'l',ownerId:'a',text:'go'};
  await route('taskSend',params,{source:'agent'});assert.deepEqual(service.calls.at(-1),['taskSend',params]);
  await route('taskQueueSend',params,{source:'agent'});assert.deepEqual(service.calls.at(-1),['taskQueueSend',params]);
});

test('recovery command injects policy supplied by runtime',async()=>{
  const service=fakeService(),route=createTaskCommandRouter(service,{getRecoveryPolicy:()=>({recoveryEnabled:true,retryDelayMs:1234})});
  await route('taskRecoveryPlan',{taskId:'t'});const call=service.calls.at(-1);assert.equal(call[0],'recoveryPlan');assert.equal(call[2].recoveryEnabled,true);
});

test('unknown task command fails closed',async()=>{
  const service=fakeService(),route=createTaskCommandRouter(service);
  await assert.rejects(()=>route('taskMagic',{}),/Task command không hỗ trợ/);
});
