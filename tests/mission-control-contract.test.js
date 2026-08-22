import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('Mission Control is wired from navigation through views and actions',()=>{
  const html=read('src/sidepanel/index.html');
  const views=read('src/sidepanel/views.js');
  const actions=read('src/sidepanel/actions.js');
  const model=read('src/sidepanel/model.js');
  assert.match(html,/mission-control\.css/);
  assert.match(html,/data-view="tasks"/);
  assert.match(html,/id="taskBadge"/);
  assert.match(views,/taskListHtml/);
  assert.match(views,/taskDetailHtml/);
  assert.match(actions,/createTaskActionController/);
  assert.match(actions,/refreshTaskData/);
  assert.match(model,/selectedTaskId/);
  assert.match(model,/taskRecovery/);
});

test('Mission Control runtime uses an internal dashboard command without adding an MCP tool',()=>{
  const runtime=read('src/background/orchestrator-runtime.js');
  const taskProtocol=read('src/core/task-protocol.js');
  assert.match(runtime,/action==='taskDashboard'/);
  assert.doesNotMatch(taskProtocol,/task_dashboard/i);
});

test('AI Port renders capability scopes from the canonical protocol registry',()=>{
  const bridge=read('src/sidepanel/bridge-view.js');
  assert.match(bridge,/AGENT_SCOPES/);
  assert.doesNotMatch(bridge,/const\s+all\s*=\s*\[/);
});

test('Mission Control visual system defines six-column navigation and lease authority surfaces',()=>{
  const css=read('src/sidepanel/mission-control.css');
  assert.match(css,/grid-template-columns:repeat\(6,1fr\)/);
  for(const marker of ['.task-card','.worker-pool','.lease-chip','.task-control-card','.recovery-row','.task-artifact-list'])assert.match(css,new RegExp(marker.replaceAll('.','\\.')));
});

test('human takeover stays internal and task work guard is fail-closed',()=>{
  const commands=read('src/orchestrator/commands.js');
  const protocol=read('src/core/task-protocol.js');
  assert.match(commands,/taskHumanTakeover/);
  assert.match(commands,/TASK_NOT_ACTIVE/);
  assert.doesNotMatch(protocol,/task_human_takeover/);
});
