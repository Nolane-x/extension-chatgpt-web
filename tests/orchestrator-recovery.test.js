import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendWorkerRecovery } from '../src/orchestrator/recovery.js';

const worker={id:'w1',tabId:1,detachedAt:null};
const policy={recoveryEnabled:true,hasCheckpoint:true,retryDelayMs:8000,replaceAfterMs:120000};

test('active long-running states recommend WAIT, never retry',()=>{
  for(const state of ['THINKING','DEEP_THINKING','STREAMING','TOOL_RUNNING','COMPLETING']){
    const result=recommendWorkerRecovery(worker,{state,lastActivityAt:9000,health:{level:'healthy'}},policy,10000);
    assert.equal(result.action,'WAIT',state);
    assert.ok(result.notBefore>10000);
  }
});

test('recoverable connection failures recommend bounded RETRY when enabled',()=>{
  for(const state of ['CONNECTION_LOST','FAILED','STALLED']){
    const result=recommendWorkerRecovery(worker,{state,health:{level:'degraded'}},policy,10000);
    assert.equal(result.action,'RETRY',state);
    assert.equal(result.notBefore,18000);
  }
});

test('conversation limit recommends HANDOFF only with resumable context',()=>{
  assert.equal(recommendWorkerRecovery(worker,{state:'CONVERSATION_LIMIT'},policy,10000).action,'HANDOFF');
  assert.equal(recommendWorkerRecovery(worker,{state:'CONVERSATION_LIMIT'},{...policy,hasCheckpoint:false},10000).action,'HUMAN_REVIEW');
});

test('DOM drift always requires human review',()=>{
  const result=recommendWorkerRecovery(worker,{state:'DOM_DRIFT',confidence:.4},policy,10000);
  assert.equal(result.action,'HUMAN_REVIEW');
  assert.equal(result.confidence,1);
});

test('missing or detached worker session recommends replacement',()=>{
  assert.equal(recommendWorkerRecovery(worker,null,policy,10000).action,'REPLACE');
  assert.equal(recommendWorkerRecovery({...worker,detachedAt:9000},{state:'IDLE'},policy,10000).action,'REPLACE');
});

test('healthy idle/completed workers require no recovery',()=>{
  assert.equal(recommendWorkerRecovery(worker,{state:'IDLE',health:{level:'healthy'}},policy,10000).action,'NONE');
  assert.equal(recommendWorkerRecovery(worker,{state:'COMPLETED',health:{level:'healthy'}},policy,10000).action,'NONE');
});
