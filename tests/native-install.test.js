import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const nativeDir=path.join(root,'native-host');
const extensionId='abcdefghijklmnopabcdefghijklmnop';

test('POSIX native-host installer registers a user-scoped manifest with exact extension origin', () => {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'nolane-native-home-'));
  const env={...process.env,HOME:home,NOLANE_CHROME_FLAVOR:'chromium'};
  const install=spawnSync('sh',[path.join(nativeDir,'install_host.sh'),extensionId],{env,encoding:'utf8'});
  assert.equal(install.status,0,install.stderr||install.stdout);
  const manifestPath=path.join(home,'.config','chromium','NativeMessagingHosts','com.nolane.sentinel_bridge.json');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.name,'com.nolane.sentinel_bridge');
  assert.equal(manifest.type,'stdio');
  assert.deepEqual(manifest.allowed_origins,[`chrome-extension://${extensionId}/`]);
  assert.equal(manifest.path,path.join(nativeDir,'nolane-sentinel-native-host'));
  assert.ok((fs.statSync(manifestPath).mode & 0o077) === 0,'manifest must not be group/world readable');
  const uninstall=spawnSync('sh',[path.join(nativeDir,'uninstall_host.sh')],{env,encoding:'utf8'});
  assert.equal(uninstall.status,0,uninstall.stderr||uninstall.stdout);
  assert.equal(fs.existsSync(manifestPath),false);
  fs.rmSync(home,{recursive:true,force:true});
});

test('Windows installer uses HKCU and a relative batch host path', () => {
  const install=fs.readFileSync(path.join(nativeDir,'install_host.bat'),'utf8');
  assert.match(install,/HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts/);
  assert.match(install,/"path": "nolane-sentinel-native-host\.bat"/);
  assert.match(install,/chrome-extension:\/\/%EXTENSION_ID%\//);
  assert.doesNotMatch(install,/allowed_origins[^\n]*\*/);
});
