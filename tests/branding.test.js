import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');
const manifest=JSON.parse(read('manifest.json'));
const vi=JSON.parse(read('_locales/vi/messages.json'));
const en=JSON.parse(read('_locales/en/messages.json'));
const pkg=JSON.parse(read('package.json'));

const userFacing=[
  'README.md','DISCLAIMER.md','SECURITY.md','src/sidepanel/index.html',
  '_locales/vi/messages.json','_locales/en/messages.json','native-host/README.md'
].map(read).join('\n');

test('Vigilume is the canonical product brand while repository remains gptweb',()=>{
  assert.equal(manifest.short_name,'Vigilume');
  assert.equal(vi.appName.message,'Vigilume — ChatGPT Web');
  assert.equal(en.appName.message,'Vigilume — ChatGPT Web');
  assert.equal(pkg.name,'vigilume-browser-runtime');
  assert.equal(pkg.repository.url,'git+https://github.com/Nolane-x/gptweb.git');
  assert.match(userFacing,/Vigilume/);
  assert.doesNotMatch(userFacing,/Nolane Sentinel|NOLANE SENTINEL/);
});

test('new native bridge identity is Vigilume with an explicit legacy fallback only',()=>{
  const client=read('src/bridge/native-client.js');
  const installer=read('native-host/install_host.sh')+read('native-host/install_host.bat');
  assert.match(client,/com\.vigilume\.bridge/);
  assert.match(client,/com\.nolane\.sentinel_bridge/);
  assert.match(installer,/com\.vigilume\.bridge/);
  assert.doesNotMatch(installer,/description[^\n]*Nolane Sentinel/i);
  assert.ok(fs.existsSync('native-host/vigilume-native-host'));
  assert.ok(fs.existsSync('native-host/vigilume-native-host.bat'));
  assert.ok(fs.existsSync('native-host/vigilume_bridge.mjs'));
});

test('future release artifact names use Vigilume branding',()=>{
  const packager=read('scripts/package-release.mjs');
  const workflow=read('.github/workflows/release.yml');
  for(const name of ['vigilume-v${version}-extension.zip','vigilume-v${version}-native-bridge.zip','vigilume-v${version}-source.zip']) assert.ok(packager.includes(name));
  assert.match(workflow,/vigilume-v\$\{VERSION\}-extension\.zip/);
  assert.match(workflow,/Vigilume \$TAG/);
});
