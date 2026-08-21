import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSessionState, mayRetrySession } from '../src/core/state-machine.js';

const base = { composerPresent:true, responsePresent:false, assistantText:'', completionActionVisible:false, toolActivities:[] };

test('visible stop control protects deep thinking from false stall', () => {
  const now = 200_000;
  const state = deriveSessionState({ ...base, generationRunning:true, stopVisible:true, lastDomMutationAt:1 }, { activeRequests:0 }, { lastActivityAt:100_000, lastAssistantText:'' }, now, { deepThinkingMs:45_000, stallMs:90_000 });
  assert.equal(state.state, 'DEEP_THINKING');
  assert.equal(mayRetrySession(state), false);
});

test('completion requires a stable signature', () => {
  const snap = { ...base, responsePresent:true, assistantText:'done', completionActionVisible:true };
  const first = deriveSessionState(snap, {}, {}, 10_000, { completionSettleMs:2_000 });
  assert.equal(first.state, 'COMPLETING');
  const second = deriveSessionState(snap, {}, first, 12_100, { completionSettleMs:2_000 });
  assert.equal(second.state, 'COMPLETED');
});

test('connection loss is explicit and retryable only without liveness', () => {
  const state = deriveSessionState({ ...base, connectionLost:true }, {}, {}, 1_000);
  assert.equal(state.state, 'CONNECTION_LOST');
  assert.equal(mayRetrySession(state), true);
});

test('conversation limit outranks ordinary completion signals', () => {
  const state = deriveSessionState({ ...base, conversationLimit:true, responsePresent:true, assistantText:'x', completionActionVisible:true }, {}, {}, 1_000);
  assert.equal(state.state, 'CONVERSATION_LIMIT');
});

test('tool activity outranks generic thinking', () => {
  const state = deriveSessionState({ ...base, generationRunning:true, stopVisible:true, toolActivities:[{name:'GitHub',active:true}] }, {}, {}, 1_000);
  assert.equal(state.state, 'TOOL_RUNNING');
});

test('background network alone cannot invent a running turn', () => {
  const state = deriveSessionState({ ...base, generationRunning:false, stopVisible:false }, { activeRequests:3, lastNetworkActivityAt:900 }, {}, 1_000);
  assert.equal(state.state, 'IDLE');
});

test('unrelated DOM churn does not hide a long deep-thinking phase', () => {
  const now = 300_000;
  const state = deriveSessionState({ ...base, generationRunning:true, stopVisible:true, lastDomMutationAt:299_500, lastAssistantMutationAt:200_000, lastStatusMutationAt:200_000 }, { activeRequests:0, lastNetworkActivityAt:200_000 }, { lastActivityAt:299_500, lastProgressAt:200_000, lastAssistantText:'' }, now, { deepThinkingMs:45_000, stallMs:90_000 });
  assert.equal(state.state, 'DEEP_THINKING');
  assert.equal(mayRetrySession(state), false);
});

test('response DOM disappearing after being seen becomes DOM_DRIFT after grace', () => {
  const now = 200_000;
  const previous = { state:'STREAMING',lastAssistantText:'đã có nội dung',lastProgressAt:now-70_000,lastActivityAt:now-70_000,domHealth:{sawResponse:true,missingResponseSince:now-61_000} };
  const state = deriveSessionState({ composerPresent:true, responsePresent:false }, { submittedAt:now-100_000, activeRequests:0 }, previous, now, { responseDomGraceMs:60_000 });
  assert.equal(state.state, 'DOM_DRIFT');
  assert.ok(state.evidence.includes('response_dom_disappeared'));
});

test('missing completion action only becomes DOM_DRIFT after stable grace', () => {
  const now = 300_000;
  const snapshot = { composerPresent:true,responsePresent:true,assistantText:'final answer',generationRunning:false,stopVisible:false,completionActionVisible:false };
  const first = deriveSessionState(snapshot, {}, { state:'STREAMING',lastAssistantText:'final answer' }, now, { completionActionGraceMs:60_000 });
  assert.notEqual(first.state, 'DOM_DRIFT');
  const second = deriveSessionState(snapshot, {}, first, now+60_001, { completionActionGraceMs:60_000 });
  assert.equal(second.state, 'DOM_DRIFT');
  assert.ok(second.evidence.includes('completion_action_missing'));
});

test('empty completed surface is treated as DOM_DRIFT after grace', () => {
  const now = 400_000;
  const snapshot = { composerPresent:true,responsePresent:true,assistantText:'',generationRunning:false,stopVisible:false,completionActionVisible:true };
  const first = deriveSessionState(snapshot, {}, { state:'STREAMING',lastAssistantText:'' }, now, { emptyCompletionGraceMs:10_000 });
  const second = deriveSessionState(snapshot, {}, first, now+10_001, { emptyCompletionGraceMs:10_000 });
  assert.equal(second.state, 'DOM_DRIFT');
  assert.ok(second.evidence.includes('empty_completion_surface'));
});
