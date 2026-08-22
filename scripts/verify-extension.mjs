import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath,pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message) => { throw new Error(message); };
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const manifest = JSON.parse(read('manifest.json'));
const packageJson = JSON.parse(read('package.json'));
const nativeHost = read('native-host/vigilume_bridge.mjs');

if (manifest.manifest_version !== 3) fail('manifest_version phải là 3');
if (Number(manifest.minimum_chrome_version || 0) < 120) fail('minimum_chrome_version phải >= 120');
if (manifest.version !== packageJson.version) fail('Version manifest/package.json không đồng bộ');
if (manifest.short_name !== 'Vigilume') fail('Product short_name phải là Vigilume');
if (packageJson.name !== 'vigilume-browser-runtime') fail('Package identity phải là vigilume-browser-runtime');
if (packageJson.repository?.url !== 'git+https://github.com/Nolane-x/gptweb.git') fail('Repository metadata phải trỏ tới Nolane-x/gptweb');
if (!nativeHost.includes(`const VERSION='${manifest.version}'`)) fail('Version native bridge không đồng bộ với extension');
if (!nativeHost.includes("SERVER_INFO={name:'vigilume-bridge',version:VERSION}")) fail('Native bridge phải dùng Vigilume server identity');
if (!nativeHost.includes("name:'vigilume-bridge',version:VERSION,protocol:PROTOCOL")) fail('Native bridge health endpoint phải dùng Vigilume identity + VERSION chung');
if (manifest.default_locale !== 'vi') fail('default_locale phải là vi');
if (manifest.name !== '__MSG_appName__' || manifest.description !== '__MSG_appDescription__') fail('Manifest phải dùng localized name/description');
for (const permission of ['tabs','storage','debugger','downloads','sidePanel','nativeMessaging','alarms']) if (!manifest.permissions?.includes(permission)) fail(`Thiếu permission bắt buộc: ${permission}`);
if (!manifest.host_permissions?.includes('https://chatgpt.com/*')) fail('Thiếu host permission chatgpt.com');
if ((manifest.host_permissions || []).some((x) => x === '<all_urls>' || x === '*://*/*')) fail('Không được xin host permission toàn bộ web');
if (manifest.background?.type !== 'module') fail('Service worker phải là module');
if ((manifest.content_scripts || []).some((entry) => entry.all_frames === true)) fail('Observer không được inject vào mọi frame');

const referenced = [manifest.background?.service_worker,manifest.side_panel?.default_path,...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),'_locales/vi/messages.json','_locales/en/messages.json','native-host/vigilume_bridge.mjs'].filter(Boolean);
for (const file of referenced) if (!exists(file)) fail(`Manifest/runtime tham chiếu file không tồn tại: ${file}`);
for (const locale of ['vi','en']) {
  const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
  if (!messages.appName?.message || !messages.appDescription?.message) fail(`Locale ${locale} thiếu appName/appDescription`);
  if (messages.appName.message !== 'Vigilume — ChatGPT Web') fail(`Locale ${locale} phải dùng Vigilume product name`);
}

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

const protocolModule=await import(pathToFileURL(path.join(root,'src/core/protocol.js')).href);
const toolNames=protocolModule.MCP_TOOLS.map((tool)=>tool.name);
const requiredBaseTools=['chatgpt_list_tabs','chatgpt_observe','chatgpt_diagnose','chatgpt_wait_until','chatgpt_open','chatgpt_compose','chatgpt_send','chatgpt_queue_send','chatgpt_list_queue','chatgpt_cancel_queued','chatgpt_stop','chatgpt_retry','chatgpt_continue_new_chat','chatgpt_list_artifacts','chatgpt_download_artifact','chatgpt_download_all_artifacts','chatgpt_get_download','chatgpt_get_context','chatgpt_delete_context','automation_list','automation_set_enabled','automation_save','automation_delete'];
const requiredTaskTools=['task_create','task_list','task_get','task_update','task_bind_worker','task_detach_worker','task_acquire_lease','task_heartbeat_lease','task_release_lease','task_acquire_best_worker','task_send','task_queue_send','task_wait','task_checkpoint','task_list_artifacts','task_recovery_plan'];
if(toolNames.length!==39)fail(`MCP tool count phải là 39, hiện tại ${toolNames.length}`);
for(const tool of [...requiredBaseTools,...requiredTaskTools])if(!toolNames.includes(tool))fail(`MCP protocol thiếu tool: ${tool}`);
const protocol=read('src/core/protocol.js'),taskProtocol=read('src/core/task-protocol.js');
for(const tool of requiredBaseTools)if(!protocol.includes(`'${tool}'`)||!nativeHost.includes(`'${tool}'`))fail(`Base MCP tool không đồng bộ: ${tool}`);
for(const tool of requiredTaskTools)if(!taskProtocol.includes(`'${tool}'`))fail(`Task MCP registry thiếu: ${tool}`);
for(const scope of ['task_read','task_write','task_lease'])if(!taskProtocol.includes(`'${scope}'`))fail(`Thiếu task capability scope: ${scope}`);
if(!nativeHost.includes("TASK_MCP_TOOLS,TASK_TOOL_ACTION")||!nativeHost.includes('...TASK_TOOL_ACTION')||!nativeHost.includes('.concat(TASK_MCP_TOOLS)'))fail('Native Bridge phải dùng shared task protocol registry');
if(taskProtocol.includes('task_human_takeover')||toolNames.some((name)=>name.includes('human_takeover')))fail('Human takeover không được xuất hiện trong agent MCP protocol');
if (!nativeHost.includes("const PROTOCOL='2026-07-28'")) fail('Native bridge phải pin MCP 2026-07-28');
if (!nativeHost.includes("const HOST='127.0.0.1'")) fail('Native bridge chỉ được bind loopback');
if (nativeHost.includes("u.protocol==='chrome-extension:'")) fail('HTTP bridge không được trust mọi chrome-extension origin');
for (const installer of ['native-host/install_host.sh','native-host/uninstall_host.sh','native-host/install_host.bat','native-host/uninstall_host.bat','native-host/vigilume-native-host','native-host/vigilume-native-host.bat','native-host/vigilume_bridge.mjs','native-host/com.vigilume.bridge.example.json']) if (!exists(installer)) fail(`Thiếu Vigilume native installer/runtime: ${installer}`);
for (const obsolete of ['native-host/nolane_bridge.mjs','native-host/nolane-sentinel-native-host','native-host/nolane-sentinel-native-host.bat','native-host/com.nolane.sentinel_bridge.example.json']) if (exists(obsolete)) fail(`Legacy branded runtime file phải được loại khỏi current package: ${obsolete}`);
const nativeClient=read('src/bridge/native-client.js');
if(!nativeClient.includes("PRIMARY_HOST='com.vigilume.bridge'")||!nativeClient.includes("LEGACY_HOST='com.nolane.sentinel_bridge'"))fail('Native client phải dùng Vigilume primary host và explicit legacy fallback');
const packageRelease=read('scripts/package-release.mjs');
if(!packageRelease.includes("'src/core/task-protocol.js'"))fail('Native Bridge release ZIP phải chứa shared task protocol registry');
if(!/const nativeFiles=\[[^\n]*'package\.json'/.test(packageRelease))fail('Native Bridge release ZIP phải chứa package.json để Node 20 giữ ESM semantics');
if(!packageRelease.includes("'DISCLAIMER.md'"))fail('Release packages phải chứa DISCLAIMER.md');
for(const artifact of ['vigilume-v${version}-extension.zip','vigilume-v${version}-native-bridge.zip','vigilume-v${version}-source.zip'])if(!packageRelease.includes(artifact))fail(`Packager thiếu Vigilume artifact: ${artifact}`);

const worker = read('src/background/service-worker.js');
if (!worker.includes("bootstrapLifecycle")) fail('Service worker entrypoint phải bootstrap lifecycle module');
const backgroundDir = path.join(root,'src/background');
const backgroundRuntime = fs.readdirSync(backgroundDir)
  .filter((name)=>name.endsWith('.js'))
  .map((name)=>fs.readFileSync(path.join(backgroundDir,name),'utf8'))
  .join('\n');
for (const marker of ['domHealth:s.domHealth||{}','domHealth:saved.domHealth||{}',"chrome.alarms.create('sentinel:watchdog'",'queueSend','waitUntil','downloadAllArtifacts','initializeNativeBridge','installSchedulerHooks','createSingleFlightGuard','missing_durable_action','orchestratorSync','initializeOrchestratorRuntime','handleOrchestratorCommand','detachOrchestratorTab','taskDashboard']) {
  if (!backgroundRuntime.includes(marker)) fail(`Thiếu runtime release marker: ${marker}`);
}
for (const requiredModule of ['runtime-state.js','session-runtime.js','action-controller.js','scheduler.js','control-plane.js','lifecycle.js','orchestrator-runtime.js','service-worker.js']) if (!exists(`src/background/${requiredModule}`)) fail(`Thiếu background module: ${requiredModule}`);
if (!exists('src/core/single-flight.js')) fail('Thiếu single-flight guard module');

const orchestratorModules=['domain.js','leases.js','selection.js','recovery.js','checkpoints.js','artifacts.js','store-codec.js','store.js','index.js','service.js','commands.js'];
for(const module of orchestratorModules)if(!exists(`src/orchestrator/${module}`))fail(`Thiếu Task Orchestrator module: ${module}`);
const orchestratorRuntime=orchestratorModules.map((module)=>read(`src/orchestrator/${module}`)).join('\n');
for(const marker of ['LEASE_CONFLICT','NO_ELIGIBLE_WORKER','DOM_DRIFT','nolane-sentinel-orchestrator-v1','checkpoint_','sessionArtifactId','openOrchestratorStore','assertWorkerLease','createOrchestratorService','createTaskCommandRouter','WORKER_ALREADY_BOUND','TASK_NOT_ACTIVE'])if(!orchestratorRuntime.includes(marker))fail(`Thiếu Task Orchestrator marker: ${marker}`);
const orchestratorFacade=read('src/orchestrator/index.js');
for(const exported of ['createTask','acquireLease','selectWorker','createCheckpoint','recommendWorkerRecovery','mergeTaskArtifacts','loadOrchestratorSnapshot','createOrchestratorService'])if(!orchestratorFacade.includes(exported))fail(`Task Orchestrator facade thiếu export: ${exported}`);

const sidepanelModules=['task-model.js','task-views.js','task-actions.js','bridge-view.js','mission-control.css'];
for(const module of sidepanelModules)if(!exists(`src/sidepanel/${module}`))fail(`Thiếu Mission Control module: ${module}`);
const sidepanelHtml=read('src/sidepanel/index.html'),sidepanelViews=read('src/sidepanel/views.js'),sidepanelActions=read('src/sidepanel/actions.js'),taskModel=read('src/sidepanel/task-model.js'),taskActions=read('src/sidepanel/task-actions.js'),taskViews=read('src/sidepanel/task-views.js'),bridgeView=read('src/sidepanel/bridge-view.js'),missionCss=read('src/sidepanel/mission-control.css');
for(const marker of ['mission-control.css','data-view="tasks"','id="taskBadge"'])if(!sidepanelHtml.includes(marker))fail(`Mission Control navigation thiếu marker: ${marker}`);
if(!sidepanelHtml.includes('<title>Vigilume</title>')||!sidepanelHtml.includes('>VIGILUME</div>'))fail('Side Panel phải dùng Vigilume branding');
for(const marker of ['taskListHtml','taskDetailHtml','bridgeHtml'])if(!sidepanelViews.includes(marker))fail(`Mission Control router thiếu marker: ${marker}`);
for(const marker of ['createTaskActionController','refreshTaskData'])if(!sidepanelActions.includes(marker))fail(`Mission Control action wiring thiếu marker: ${marker}`);
for(const marker of ['revokedAt==null','lease.status==null'])if(!taskModel.includes(marker)||!taskActions.includes(marker))fail(`Mission Control lease semantics thiếu marker: ${marker}`);
if(!bridgeView.includes('AGENT_SCOPES'))fail('AI Port phải render canonical AGENT_SCOPES');
if(!missionCss.includes('grid-template-columns:repeat(6,1fr)')||!missionCss.includes('.lease-chip')||!missionCss.includes('.worker-pool'))fail('Mission Control visual system chưa được nối đầy đủ');

const checkpointRuntime=read('src/orchestrator/checkpoints.js');
for(const kind of ['DECISION','FAILURE']){
  if(!checkpointRuntime.includes(`'${kind}'`))fail(`Task checkpoint core thiếu kind: ${kind}`);
  if(!taskViews.includes(`<option>${kind}</option>`))fail(`Mission Control checkpoint UI thiếu kind: ${kind}`);
}

const readme=read('README.md'),protocolDoc=read('docs/protocol.md'),disclaimer=read('DISCLAIMER.md'),security=read('SECURITY.md'),nativeReadme=read('native-host/README.md');
const protocolLabel=manifest.version.split('.').slice(0,2).join('.');
if(!readme.includes(`**Phiên bản:** \`${manifest.version}\``))fail('README version không khớp manifest');
if(!readme.includes('39 MCP tools'))fail('README phải ghi rõ 39 MCP tools');
if(!readme.includes('https://github.com/Nolane-x/gptweb'))fail('README phải trỏ đúng repo gptweb');
if(!readme.includes('DISCLAIMER.md'))fail('README phải link disclaimer');
if(!protocolDoc.startsWith(`# Vigilume Agent Protocol v${protocolLabel}`))fail('Protocol document version/branding không khớp extension major/minor');
if(!protocolDoc.includes('- `DECISION`')||!protocolDoc.includes('- `FAILURE`'))fail('Protocol document thiếu checkpoint DECISION/FAILURE');
if(!exists(`RELEASE_NOTES_v${manifest.version}.md`))fail(`Thiếu release notes cho v${manifest.version}`);
const currentUserFacing=[readme,disclaimer,security,nativeReadme,sidepanelHtml,read('_locales/vi/messages.json'),read('_locales/en/messages.json')].join('\n');
if(/Nolane Sentinel|NOLANE SENTINEL/.test(currentUserFacing))fail('Current user-facing surface còn legacy product branding');
if(!currentUserFacing.includes('Vigilume'))fail('Current user-facing surface thiếu Vigilume branding');

const releaseWorkflow=read('.github/workflows/release.yml');
if(!releaseWorkflow.includes('Vigilume $TAG'))fail('Release workflow phải publish Vigilume title/tag');
for(const artifact of ['vigilume-v${VERSION}-extension.zip','vigilume-v${VERSION}-native-bridge.zip','vigilume-v${VERSION}-source.zip'])if(!releaseWorkflow.includes(artifact))fail(`Release workflow thiếu Vigilume asset: ${artifact}`);

const zipLib = read('scripts/zip-lib.mjs');
if (!zipLib.includes('DOS_DATE') || !zipLib.includes('createDeterministicZip')) fail('Release ZIP phải dùng deterministic builder nội bộ');
console.log(`verify-extension: PASS (${sourceFiles.length} source files scanned, ${toolNames.length} MCP tools checked, ${orchestratorModules.length} orchestrator modules, ${sidepanelModules.length} Mission Control modules, Vigilume branding locked)`);
