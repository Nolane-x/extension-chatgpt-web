import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeterministicZip, crc32 } from '../scripts/zip-lib.mjs';

test('deterministic zip bytes do not depend on input order', () => {
  const a = createDeterministicZip([{ name:'b.txt', data:Buffer.from('beta') },{ name:'a.txt', data:Buffer.from('alpha') }]);
  const b = createDeterministicZip([{ name:'a.txt', data:Buffer.from('alpha') },{ name:'b.txt', data:Buffer.from('beta') }]);
  assert.deepEqual(a, b);
  assert.equal(a.readUInt32LE(0), 0x04034b50);
  assert.equal(a.readUInt32LE(a.length - 22), 0x06054b50);
  assert.ok(a.includes(Buffer.from('a.txt')));
  assert.ok(a.includes(Buffer.from('b.txt')));
});

test('zip builder rejects traversal and duplicate paths', () => {
  assert.throws(() => createDeterministicZip([{ name:'../escape.txt', data:'x' }]), /không an toàn/);
  assert.throws(() => createDeterministicZip([{ name:'same.txt', data:'a' },{ name:'same.txt', data:'b' }]), /bị trùng/);
});

test('crc32 matches the ZIP reference vector', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});
