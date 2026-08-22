import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFormState, restoreFormState } from '../src/sidepanel/form-state.js';

function makeRoot(nodes){return {querySelectorAll:()=>nodes};}
function node(id,value,{active=false,start=0,end=start}={}){return {id,value,selectionStart:start,selectionEnd:end,dataset:{},focus(){this.focused=true;},__active:active};}

test('form state preserves prompt text across whole-view rerender',()=>{
  const before=node('microscopeQueue','Tiếp tục hoàn thành đi nhé',{active:true,start:8,end:8});
  const snap=captureFormState(makeRoot([before]),before);
  const after=node('microscopeQueue','');
  restoreFormState(makeRoot([after]),snap);
  assert.equal(after.value,'Tiếp tục hoàn thành đi nhé');
  assert.equal(after.focused,true);
  assert.equal(after.selectionStart,8);
  assert.equal(after.selectionEnd,8);
});

test('form state preserves multiple automation fields by id',()=>{
  const snap=captureFormState(makeRoot([node('rulePrompt','abc'),node('ruleRunAt','2026-08-22T11:00'),node('ruleTab','123')]));
  const next=[node('rulePrompt',''),node('ruleRunAt',''),node('ruleTab','')];
  restoreFormState(makeRoot(next),snap);
  assert.deepEqual(next.map(x=>x.value),['abc','2026-08-22T11:00','123']);
});
