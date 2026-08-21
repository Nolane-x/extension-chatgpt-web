import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateQueuedActions, normalizeQueuedAction } from '../src/core/action-queue.js';

test('queued send becomes ready only in safe state', () => {
  const action = normalizeQueuedAction({ id:'q1', tabId:7, text:'Tiếp tục', createdAt:1000, expiresAt:100000 });
  assert.equal(evaluateQueuedActions({tabId:7,state:'DEEP_THINKING'}, [action], 2000).ready.length, 0);
  assert.equal(evaluateQueuedActions({tabId:7,state:'COMPLETED'}, [action], 2000).ready[0].id, 'q1');
});

test('expired queue entries are separated and never executed', () => {
  const action = normalizeQueuedAction({ id:'q2', tabId:7, text:'x', createdAt:1000, expiresAt:1500 });
  const result = evaluateQueuedActions({tabId:7,state:'IDLE'}, [action], 2000);
  assert.equal(result.ready.length, 0);
  assert.equal(result.expired[0].id, 'q2');
});

test('conversation limit can route queued send through handoff when enabled', () => {
  const action = normalizeQueuedAction({ id:'q3', tabId:7, text:'bước kế tiếp', createdAt:1000, expiresAt:100000 });
  const result = evaluateQueuedActions({tabId:7,state:'CONVERSATION_LIMIT'}, [action], 2000, {handoffEnabled:true});
  assert.equal(result.handoff[0].id, 'q3');
  assert.equal(result.ready.length, 0);
});
