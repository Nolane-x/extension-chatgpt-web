import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message) => { throw new Error(message); };
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const manifest = JSON.parse(read('manifest.json'));
const packageJson = JSON.parse(read('package.json'));
const nativeHost = read('native-host/nolane_bridge.mjs');

if (manifest.manifest_version !== 3) fail('manifest_version phải là 3');
if (Number(manifest.minimum_chrome_version || 0) < 120) fail('minimum_chrome_version phải >= 120');
if (manifest.version !== packageJson.version) fail('Version manifest/package.json không đồng bộ');
if (!nativeHost.includes(`const VERSION='${manifest.version}'`)) fail('Version native bridge không đồng bộ với extension');
if (!nativeHost.includes("SERVER_INFO={name:'nolane-sentinel-bridge',version:VERSION}")) fail('Native bridge phải dùng VERSION chung cho server info');
if (!nativeHost.includes("version:VERSION,protocol:PROTOCOL")) fail('Native bridge health endpoint phải dùng VERSION chung');
if (manifest.default_locale !== 'vi') fail('default_locale phải là vi');
if (manifest.name !== '__MSG_appName__' || manifest.description !== '__MSG_appDescription__') fail('Manifest phải dùng localized name/description');
for (const permission of ['tabs','storage','debugger','downloads','sidePanel','nativeMessaging','alarms']) if (!manifest.permissions?.includes(permission)) fail(`Thiếu permission bắt buộc: ${permission}`);
if (!manifest.host_permissions?.includes('https://chatgpt.com/*')) fail('Thiếu host permission chatgpt.com');
if ((manifest.host_permissions || []).some((x) => x === '<all_urls>' || x === '*://*/*')) fail('Không được xin host permission toàn bộ web');
if (manifest.background?.type !== 'module') fail('Service worker phải là module');
if ((manifest.content_scripts || []).some((entry) => entry.all_frames === true)) fail('Observer không được inject vào mọi frame');

const referenced = [manifest.background?.service_worker,manifest.side_panel?.default_path,...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),'_locales/vi/messages.json','_locales/en/messages.json','native-host/nolane_bridge.mjs'].filter(Boolean);
for (const file of referenced) if (!exists(file)) fail(`Manifest/runtime tham chiếu file không tồn tại: ${file}`);
for (const locale of ['vi','en']) { const messages = JSON.parse(read(`_locales/${locale}/messages.json`)); if (!messages.appName?.message || !messages.appDescription?.message) fail(`Locale ${locale} thiếu appName/appDescription`); }

const sourceFiles = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes:true })) { if (['.git','node_modules','dist','release','bootstrap'].includes(entry.name)) continue; const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else sourceFiles.push(full); } }
walk(root);
for (const full of sourceFiles.filter((file) => /\.(?:js|mjs)$/.test(file))) execFileSync(process.execPath, ['--check', full], { stdio:'pipe' });
for (const full of sourceFiles.filter((file) => /\.(?:js|mjs)$/.test(file))) {
  const text = fs.readFileSync(full, 'utf8');
  for (const match of text.matchAll(/\b(?:import|export)\s+(?:[^'\"]*?\sfrom\s*)?['\"](\.{1,2}\/[^'\"]+)['\"]/g)) { const target = path.resolve(path.dirname(full), match[1]); if (!fs.existsSync(target)) fail(`Relative import không tồn tại: ${path.relative(root, full)} -> ${match[1]}`); }
}
for (const full of sourceFiles.filter((file) => /\.(?:html|js|mjs)$/.test(file))) {
  const text = fs.readFileSync(full, 'utf8'), relative = path.relative(root, full);
  if (/<script\b[^>]*\bsrc\s*=\s*[\"']https?:\/\//i.test(text)) fail(`Remote script bị cấm trong ${relative}`);
  if (/\bimport\s*(?:\(|[^;]*?\bfrom\s*)[\"']https?:\/\//i.test(text)) fail(`Remote JS import bị cấm trong ${relative}`);
  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(text)) fail(`Dynamic code execution bị cấm trong ${relative}`);
}

const protocol = read('src/core/protocol.js');
const requiredTools = ['chatgpt_list_tabs','chatgpt_observe','chatgpt_diagnose','chatgpt_wait_until','chatgpt_open','chatgpt_compose','chatgpt_send','chatgpt_queue_send','chatgpt_list_queue','chatgpt_cancel_queued','chatgpt_stop','chatgpt_retry','chatgpt_continue_new_chat','chatgpt_list_artifacts','chatgpt_download_artifact','chatgpt_download_all_artifacts','chatgpt_get_download','chatgpt_get_context','chatgpt_delete_context','automation_list','automation_set_enabled','automation_save','automation_delete'];
for (const tool of requiredTools) if (!protocol.includes(`'${tool}'`) || !nativeHost.includes(`'${tool}'`)) fail(`MCP tool không đồng bộ: ${tool}`);
if (!nativeHost.includes("const PROTOCOL='2026-07-28'")) fail('Native bridge phải pin MCP 2026-07-28');
if (!nativeHost.includes("const HOST='127.0.0.1'")) fail('Native bridge chỉ được bind loopback');
if (nativeHost.includes("u.protocol==='chrome-extension:'")) fail('HTTP bridge không được trust mọi chrome-extension origin');
for (const installer of ['native-host/install_host.sh','native-host/uninstall_host.sh','native-host/install_host.bat','native-host/uninstall_host.bat','native-host/nolane-sentinel-native-host','native-host/nolane-sentinel-native-host.bat']) if (!exists(installer)) fail(`Thiếu native installer/runtime: ${installer}`);

const worker = read('src/background/service-worker.js');
if (!worker.includes("bootstrapLifecycle")) fail('Service worker entrypoint phải bootstrap lifecycle module');
const backgroundDir = path.join(root,'src/background');
const backgroundRuntime = fs.readdirSync(backgroundDir)
  .filter((name)=>name.endsWith('.js'))
  .map((name)=>fs.readFileSync(path.join(backgroundDir,name),'utf8'))
  .join('\n');
for (const marker of ['domHealth:s.domHealth||{}','domHealth:saved.domHealth||{}',"chrome.alarms.create('sentinel:watchdog'",'queueSend','waitUntil','downloadAllArtifacts','initializeNativeBridge','installSchedulerHooks','createSingleFlightGuard','missing_durable_action']) {
  if (!backgroundRuntime.includes(marker)) fail(`Thiếu runtime release marker: ${marker}`);
}
for (const requiredModule of ['runtime-state.js','session-runtime.js','action-controller.js','scheduler.js','control-plane.js','lifecycle.js','service-worker.js']) if (!exists(`src/background/${requiredModule}`)) fail(`Thiếu background module: ${requiredModule}`);
if (!exists('src/core/single-flight.js')) fail('Thiếu single-flight guard module');

const orchestratorModules=['domain.js','leases.js','selection.js','recovery.js','checkpoints.js','artifacts.js','store-codec.js','store.js'];
for(const module of orchestratorModules)if(!exists(`src/orchestrator/${module}`))fail(`Thiếu Task Orchestrator module: ${module}`);
const orchestratorRuntime=orchestratorModules.map((module)=>read(`src/orchestrator/${module}`)).join('\n');
for(const marker of ['LEASE_CONFLICT','NO_ELIGIBLE_WORKER','DOM_DRIFT','nolane-sentinel-orchestrator-v1','checkpoint_','sessionArtifactId'])if(!orchestratorRuntime.includes(marker))fail(`Thiếu Task Orchestrator marker: ${marker}`);

const zipLib = read('scripts/zip-lib.mjs');
if (!zipLib.includes('DOS_DATE') || !zipLib.includes('createDeterministicZip')) fail('Release ZIP phải dùng deterministic builder nội bộ');
console.log(`verify-extension: PASS (${sourceFiles.length} source files scanned, ${requiredTools.length} MCP tools checked, ${orchestratorModules.length} orchestrator modules)`);
