import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_SCOPES,MCP_TOOLS,validateAgentRequest } from '../src/core/protocol.js';

test('task capability scopes exist but are not implicit',()=>{
  for(const scope of ['task_read','task_write','task_lease'])assert.ok(AGENT_SCOPES.includes(scope));
  assert.throws(()=>validateAgentRequest({action:'task_list'},['observe']),/task_read/);
  assert.equal(validateAgentRequest({action:'task_list'},['task_read']).action,'taskList');
});

test('task send still requires send scope rather than task_write',()=>{
  assert.throws(()=>validateAgentRequest({action:'task_send'},['task_write']),/send/);
  assert.equal(validateAgentRequest({action:'task_send'},['send']).action,'taskSend');
});

test('MCP exposes exactly 39 tools including 16 task tools',()=>{
  const names=MCP_TOOLS.map(x=>x.name),taskNames=names.filter(x=>x.startsWith('task_'));
  assert.equal(MCP_TOOLS.length,39);
  assert.equal(taskNames.length,16);
  for(const name of ['task_create','task_list','task_get','task_update','task_bind_worker','task_detach_worker','task_acquire_lease','task_heartbeat_lease','task_release_lease','task_acquire_best_worker','task_send','task_queue_send','task_wait','task_checkpoint','task_list_artifacts','task_recovery_plan'])assert.ok(names.includes(name),name);
});

test('agent protocol never exposes human takeover action',()=>{
  assert.throws(()=>validateAgentRequest({action:'task_human_takeover'},['task_lease']),/không được hỗ trợ/);
  assert.ok(!MCP_TOOLS.some(x=>x.name.includes('human_takeover')));
});
