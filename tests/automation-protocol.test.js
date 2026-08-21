import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAutomationRules, nextRetryDelay } from '../src/core/automation.js';
import { MCP_TOOLS, validateAgentRequest } from '../src/core/protocol.js';
import { splitComposerText } from '../src/core/composer.js';

test('automation respects state, cooldown, and max runs', () => {
  const session={tabId:4,state:'COMPLETED',confidence:.99};
  const rules=[
    {id:'a',enabled:true,trigger:'state',whenState:'COMPLETED',action:{type:'send',text:'Tiếp tục'},maxRuns:2,runCount:1,cooldownMs:1000,lastRunAt:0},
    {id:'b',enabled:true,trigger:'state',whenState:'FAILED',action:{type:'send',text:'x'}}
  ];
  const actions=evaluateAutomationRules(session,rules,5000);
  assert.deepEqual(actions.map(x=>x.ruleId),['a']);
});

test('retry delay is bounded exponential', () => {
  assert.equal(nextRetryDelay(0,{baseMs:8000,maxMs:30000,jitter:0}),8000);
  assert.equal(nextRetryDelay(3,{baseMs:8000,maxMs:30000,jitter:0}),30000);
});

test('agent request enforces capability scope', () => {
  assert.throws(()=>validateAgentRequest({action:'send',params:{}},['observe']),/Thiếu quyền/);
  const parsed=validateAgentRequest({action:'send',params:{tabId:1,text:'x'}},['send']);
  assert.equal(parsed.action,'send');
});

test('MCP exposes deep-control and artifact tools', () => {
  const names=new Set(MCP_TOOLS.map(x=>x.name));
  for (const name of ['chatgpt_list_tabs','chatgpt_compose','chatgpt_send','chatgpt_retry','chatgpt_continue_new_chat','chatgpt_download_artifact','chatgpt_get_download','automation_save','automation_delete']) assert.ok(names.has(name));
});

test('composer chunks preserve unicode without splitting surrogate pairs', () => {
  const input='a'.repeat(7)+'😀'+'b'.repeat(9);
  const chunks=splitComposerText(input,8);
  assert.equal(chunks.join(''),input);
  assert.ok(chunks.every(x=>x.length<=8));
  assert.ok(chunks.every(x=>!/[\uD800-\uDBFF]$/.test(x)));
});

test('MCP exposes queue, wait, diagnose, and bulk artifact tools with existing scopes', () => {
  const names=new Set(MCP_TOOLS.map(x=>x.name));
  for (const name of ['chatgpt_queue_send','chatgpt_list_queue','chatgpt_cancel_queued','chatgpt_wait_until','chatgpt_diagnose','chatgpt_download_all_artifacts']) assert.ok(names.has(name));
  assert.equal(validateAgentRequest({action:'queue_send',params:{tabId:1,text:'x'}},['send']).action,'queueSend');
  assert.equal(validateAgentRequest({action:'diagnose',params:{tabId:1}},['observe']).action,'diagnose');
});
