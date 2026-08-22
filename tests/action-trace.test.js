import test from 'node:test';
import assert from 'node:assert/strict';
import { appendActionTrace } from '../src/core/action-trace.js';

test('action trace is bounded and does not store prompt body',()=>{
  let trace=[];
  trace=appendActionTrace(trace,{stage:'SEND_PRECHECK',action:'send',text:'secret prompt',textChars:13,timestamp:1},3);
  trace=appendActionTrace(trace,{stage:'SEND_COMPOSING',action:'send',timestamp:2},3);
  trace=appendActionTrace(trace,{stage:'SEND_DISPATCHED',action:'send',timestamp:3},3);
  trace=appendActionTrace(trace,{stage:'SEND_ACCEPTED',action:'send',state:'SUBMITTED',timestamp:4},3);
  assert.equal(trace.length,3);
  assert.deepEqual(trace.map(x=>x.stage),['SEND_COMPOSING','SEND_DISPATCHED','SEND_ACCEPTED']);
  assert.ok(trace.every(x=>!Object.hasOwn(x,'text')));
});
