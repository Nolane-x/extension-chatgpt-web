import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleFlightGuard } from '../src/core/single-flight.js';

test('same execution key can only be claimed once until released',()=>{
  const guard=createSingleFlightGuard();
  assert.equal(guard.tryClaim('a'),true);
  assert.equal(guard.tryClaim('a'),false);
  assert.equal(guard.activeCount(),1);
});

test('release allows a later execution of the same key',()=>{
  const guard=createSingleFlightGuard();
  assert.equal(guard.tryClaim('a'),true);
  guard.release('a');
  assert.equal(guard.tryClaim('a'),true);
});

test('different scheduled actions can execute independently',()=>{
  const guard=createSingleFlightGuard();
  assert.equal(guard.tryClaim('a'),true);
  assert.equal(guard.tryClaim('b'),true);
  assert.equal(guard.activeCount(),2);
});
