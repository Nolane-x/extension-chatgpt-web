import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompletionSettler } from '../src/core/completion-settle.js';

test('completion settler forces exactly one poll after stable candidate grace',()=>{
  const scheduled=[];const cleared=[];const due=[];
  const settler=createCompletionSettler({
    settleMs:2000,
    setTimer:(fn,delay)=>{const token={fn,delay};scheduled.push(token);return token;},
    clearTimer:(token)=>cleared.push(token),
    onDue:(tabId)=>due.push(tabId)
  });
  const info={state:'COMPLETING',completionCandidate:{signature:'same',since:1000}};
  assert.equal(settler.reconcile(7,info,1500),3000);
  assert.equal(scheduled.length,1);
  assert.equal(scheduled[0].delay,1500);
  assert.equal(settler.reconcile(7,info,1600),3000);
  assert.equal(scheduled.length,1,'same completion candidate must not create duplicate timers');
  scheduled[0].fn();
  assert.deepEqual(due,[7]);
});

test('completion settler replaces changed candidate and cancels when state leaves COMPLETING',()=>{
  const scheduled=[];const cleared=[];
  const settler=createCompletionSettler({
    settleMs:2000,
    setTimer:(fn,delay)=>{const token={fn,delay};scheduled.push(token);return token;},
    clearTimer:(token)=>cleared.push(token),
    onDue:()=>{}
  });
  settler.reconcile(2,{state:'COMPLETING',completionCandidate:{signature:'a',since:100}},500);
  settler.reconcile(2,{state:'COMPLETING',completionCandidate:{signature:'b',since:600}},700);
  assert.equal(cleared.length,1);
  assert.equal(scheduled.length,2);
  settler.reconcile(2,{state:'COMPLETED'},800);
  assert.equal(cleared.length,2);
});
