import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTaskArtifacts } from '../src/orchestrator/artifacts.js';

const artifact=(extra={})=>({
  id:'ta1',taskId:'t1',workerId:'w1',sessionArtifactId:'sa1',tabId:7,conversationId:'c1',
  name:'bundle.zip',kind:'file',href:'https://chatgpt.com/file/a',downloadId:null,downloadState:null,
  detectedAt:100,provenance:{source:'dom',checkpointId:null},...extra
});

test('task artifacts dedupe by worker and session artifact id',()=>{
  const merged=mergeTaskArtifacts([artifact()],[artifact({id:'different',downloadId:9,downloadState:'in_progress',detectedAt:200})]);
  assert.equal(merged.length,1);
  assert.equal(merged[0].id,'ta1');
  assert.equal(merged[0].downloadId,9);
  assert.equal(merged[0].downloadState,'in_progress');
  assert.equal(merged[0].detectedAt,100);
  assert.equal(merged[0].provenance.source,'dom');
});

test('same session artifact from different workers remains distinct provenance',()=>{
  const merged=mergeTaskArtifacts([], [artifact(),artifact({id:'ta2',workerId:'w2',tabId:8})]);
  assert.equal(merged.length,2);
  assert.deepEqual(merged.map(x=>x.workerId),['w1','w2']);
});

test('later updates may fill checkpoint provenance without replacing original source',()=>{
  const merged=mergeTaskArtifacts([artifact()],[artifact({provenance:{source:'cdp-network',checkpointId:'cp1'},downloadId:12})]);
  assert.deepEqual(merged[0].provenance,{source:'dom',checkpointId:'cp1'});
  assert.equal(merged[0].downloadId,12);
});

test('artifact order is deterministic by detection time then id',()=>{
  const merged=mergeTaskArtifacts([], [artifact({id:'z',sessionArtifactId:'s3',detectedAt:200}),artifact({id:'b',sessionArtifactId:'s2',detectedAt:100}),artifact({id:'a',sessionArtifactId:'s1',detectedAt:100})]);
  assert.deepEqual(merged.map(x=>x.id),['a','b','z']);
});
