import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));
const packager=fs.readFileSync('scripts/package-release.mjs','utf8');

test('native release keeps shared task protocol in an ESM package scope',()=>{
  assert.equal(packageJson.type,'module');
  assert.match(packager,/const nativeFiles=\['package\.json'/);
  assert.ok(packager.includes("'src/core/task-protocol.js'"));
});

test('native bridge imports the shared task registry instead of duplicating task schemas',()=>{
  const host=fs.readFileSync('native-host/nolane_bridge.mjs','utf8');
  assert.ok(host.includes("from '../src/core/task-protocol.js'"));
  assert.ok(host.includes('.concat(TASK_MCP_TOOLS)'));
  assert.ok(host.includes('...TASK_TOOL_ACTION'));
  assert.ok(!host.includes("['task_create'"));
});
