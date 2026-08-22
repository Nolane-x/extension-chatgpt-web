import test from 'node:test';
import assert from 'node:assert/strict';
import { taskListHtml,taskDetailHtml } from '../src/sidepanel/task-views.js';
const now=1_800_000_000_000;
const bundle={
 task:{id:'task_1',title:'Build <script>x</script>',goal:'Ship safely',status:'ACTIVE',updatedAt:now-1000},
 workers:[{id:'w1',taskId:'task_1',tabId:11,role:'coder',lastKnownState:'COMPLETED',lastSeenAt:now-1000,detachedAt:null}],
 leases:[{id:'l1',workerId:'w1',ownerId:'agent-a',ownerType:'agent',expiresAt:now+60000,revokedAt:null}],
 checkpoints:[{id:'cp1',taskId:'task_1',kind:'PROGRESS',summary:'done',createdAt:now-3000}],
 artifacts:[{id:'a1',taskId:'task_1',workerId:'w1',sessionArtifactId:'s1',tabId:11,name:'build.zip',kind:'file',downloadState:'complete',detectedAt:now-2000,provenance:{source:'session'}}]
};

test('task list escapes task content and exposes open/create controls',()=>{
 const html=taskListHtml({taskBundles:[bundle],sessions:[{tabId:11}],now});
 assert.match(html,/data-action="task-create"/);
 assert.match(html,/data-action="task-open"/);
 assert.ok(!html.includes('<script>'));
 assert.match(html,/Build &lt;script&gt;x&lt;\/script&gt;/);
});

test('task detail exposes explicit agent takeover and worker controls',()=>{
 const html=taskDetailHtml({bundle,sessions:[{tabId:11,title:'Chat 11'}],recovery:{taskId:'task_1',recommendations:[]},now});
 assert.match(html,/data-action="task-human-takeover"/);
 assert.match(html,/agent-a/);
 assert.match(html,/data-action="task-bind-worker"/);
 assert.match(html,/data-action="task-detach-worker"/);
 assert.match(html,/data-action="task-acquire-best"/);
 assert.match(html,/data-action="task-checkpoint"/);
 assert.match(html,/build.zip/);
});

test('task detail hides send composer when human UI does not own a lease',()=>{
 const html=taskDetailHtml({bundle,sessions:[],recovery:null,now});
 assert.ok(!html.includes('data-action="task-send"'));
 assert.match(html,/Tiếp quản/);
});

test('task detail shows send and queue controls when human-ui owns a live lease',()=>{
 const human={...bundle,leases:[{...bundle.leases[0],ownerId:'human-ui',ownerType:'human'}]};
 const html=taskDetailHtml({bundle:human,sessions:[],recovery:null,now});
 assert.match(html,/data-action="task-send"/);
 assert.match(html,/data-action="task-queue-send"/);
 assert.match(html,/id="taskWorkerSelect"/);
});

test('non-active task does not render acquire-best or prompt composer even with a live human lease',()=>{
 const paused={...bundle,task:{...bundle.task,status:'PAUSED'},leases:[{...bundle.leases[0],ownerId:'human-ui',ownerType:'human'}]};
 const html=taskDetailHtml({bundle:paused,sessions:[],recovery:null,now});
 assert.ok(!html.includes('data-action="task-acquire-best"'));
 assert.ok(!html.includes('data-action="task-send"'));
 assert.ok(!html.includes('data-action="task-queue-send"'));
});
