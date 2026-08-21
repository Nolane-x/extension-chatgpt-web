import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSessionHealth, shouldAttemptDeepAttach } from '../src/core/health.js';

test('deep attached recent active session is healthy', () => {
  const health = assessSessionHealth({state:'STREAMING',deep:{attached:true},lastSeenAt:100_000,lastProgressAt:99_000}, {debuggerAttached:true}, 100_000);
  assert.equal(health.level, 'healthy');
});

test('DOM drift is a critical health condition', () => {
  const health = assessSessionHealth({state:'DOM_DRIFT',deep:{attached:true},lastSeenAt:100_000}, {debuggerAttached:true}, 100_000);
  assert.equal(health.level, 'critical');
  assert.ok(health.flags.includes('dom_drift'));
});

test('reattach policy backs off after a failed attempt', () => {
  assert.equal(shouldAttemptDeepAttach({deep:{attached:false,lastAttachAttemptAt:90_000}}, 100_000, 30_000), false);
  assert.equal(shouldAttemptDeepAttach({deep:{attached:false,lastAttachAttemptAt:60_000}}, 100_000, 30_000), true);
});
