export const TASK_AGENT_SCOPES=Object.freeze(['task_read','task_write','task_lease']);

export const TASK_ACTION_SCOPE=Object.freeze({
  taskCreate:'task_write',taskList:'task_read',taskGet:'task_read',taskUpdate:'task_write',
  taskBindWorker:'task_write',taskDetachWorker:'task_write',
  taskAcquireLease:'task_lease',taskHeartbeatLease:'task_lease',taskReleaseLease:'task_lease',taskAcquireBestWorker:'task_lease',
  taskSend:'send',taskQueueSend:'send',taskWait:'task_read',taskCheckpoint:'task_write',taskListArtifacts:'task_read',taskRecoveryPlan:'task_read'
});

export const TASK_ALIASES=Object.freeze({
  task_create:'taskCreate','task.create':'taskCreate',task_list:'taskList','task.list':'taskList',task_get:'taskGet','task.get':'taskGet',task_update:'taskUpdate','task.update':'taskUpdate',
  task_bind_worker:'taskBindWorker','task.bind_worker':'taskBindWorker',task_detach_worker:'taskDetachWorker','task.detach_worker':'taskDetachWorker',
  task_acquire_lease:'taskAcquireLease','task.acquire_lease':'taskAcquireLease',task_heartbeat_lease:'taskHeartbeatLease','task.heartbeat_lease':'taskHeartbeatLease',
  task_release_lease:'taskReleaseLease','task.release_lease':'taskReleaseLease',task_acquire_best_worker:'taskAcquireBestWorker','task.acquire_best_worker':'taskAcquireBestWorker',
  task_send:'taskSend','task.send':'taskSend',task_queue_send:'taskQueueSend','task.queue_send':'taskQueueSend',task_wait:'taskWait','task.wait':'taskWait',
  task_checkpoint:'taskCheckpoint','task.checkpoint':'taskCheckpoint',task_list_artifacts:'taskListArtifacts','task.list_artifacts':'taskListArtifacts',
  task_recovery_plan:'taskRecoveryPlan','task.recovery_plan':'taskRecoveryPlan'
});

const definitions=[
  ['task_create','Tạo một công việc nhiều ChatGPT.',{title:{type:'string'},goal:{type:'string'},metadata:{type:'object'}},['title','goal']],
  ['task_list','Liệt kê các task đã lưu.',{status:{type:'string'}},[]],
  ['task_get','Đọc task, worker, lease và checkpoint gần nhất.',{taskId:{type:'string'},includeCheckpoints:{type:'boolean'}},['taskId']],
  ['task_update','Cập nhật title/goal/status/metadata của task.',{taskId:{type:'string'},patch:{type:'object'}},['taskId','patch']],
  ['task_bind_worker','Bind một tab ChatGPT hiện có vào task.',{taskId:{type:'string'},tabId:{type:'integer'},role:{type:'string'}},['taskId','tabId']],
  ['task_detach_worker','Detach worker khỏi task nhưng giữ history.',{taskId:{type:'string'},workerId:{type:'string'}},['taskId','workerId']],
  ['task_acquire_lease','Agent acquire lease độc quyền trên worker.',{taskId:{type:'string'},workerId:{type:'string'},ownerId:{type:'string'},ttlMs:{type:'integer'}},['taskId','workerId','ownerId']],
  ['task_heartbeat_lease','Gia hạn lease đang giữ.',{taskId:{type:'string'},workerId:{type:'string'},leaseId:{type:'string'},ownerId:{type:'string'},ttlMs:{type:'integer'}},['taskId','workerId','leaseId','ownerId']],
  ['task_release_lease','Nhả lease worker.',{taskId:{type:'string'},workerId:{type:'string'},leaseId:{type:'string'},ownerId:{type:'string'},reason:{type:'string'}},['taskId','workerId','leaseId','ownerId']],
  ['task_acquire_best_worker','Chọn worker tốt nhất cho task và acquire lease.',{taskId:{type:'string'},ownerId:{type:'string'},ttlMs:{type:'integer'},intent:{type:'string'},preferredConversationId:{type:'string'}},['taskId','ownerId']],
  ['task_send','Gửi prompt qua worker có lease hợp lệ.',{taskId:{type:'string'},workerId:{type:'string'},leaseId:{type:'string'},ownerId:{type:'string'},text:{type:'string'},replace:{type:'boolean'}},['taskId','workerId','leaseId','ownerId','text']],
  ['task_queue_send','Xếp prompt qua worker có lease hợp lệ.',{taskId:{type:'string'},workerId:{type:'string'},leaseId:{type:'string'},ownerId:{type:'string'},text:{type:'string'},expiresInMs:{type:'integer'},handoffOnLimit:{type:'boolean'}},['taskId','workerId','leaseId','ownerId','text']],
  ['task_wait','Chờ worker của task đạt state mục tiêu.',{taskId:{type:'string'},workerId:{type:'string'},states:{type:'array',items:{type:'string'}},timeoutMs:{type:'integer',minimum:0,maximum:25000}},['taskId','workerId','states']],
  ['task_checkpoint','Tạo checkpoint append-only cho task.',{taskId:{type:'string'},kind:{type:'string'},summary:{type:'string'},workerId:{type:'string'},artifactIds:{type:'array',items:{type:'string'}},contextRef:{type:'object'},metadata:{type:'object'}},['taskId','kind','summary']],
  ['task_list_artifacts','Liệt kê artifact provenance của task.',{taskId:{type:'string'}},['taskId']],
  ['task_recovery_plan','Tạo recovery recommendation cho mọi worker trong task.',{taskId:{type:'string'}},['taskId']]
];

export const TASK_MCP_TOOLS=Object.freeze(definitions.map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}})));

export const TASK_TOOL_ACTION=Object.freeze({
  task_create:'taskCreate',task_list:'taskList',task_get:'taskGet',task_update:'taskUpdate',task_bind_worker:'taskBindWorker',task_detach_worker:'taskDetachWorker',
  task_acquire_lease:'taskAcquireLease',task_heartbeat_lease:'taskHeartbeatLease',task_release_lease:'taskReleaseLease',task_acquire_best_worker:'taskAcquireBestWorker',
  task_send:'taskSend',task_queue_send:'taskQueueSend',task_wait:'taskWait',task_checkpoint:'taskCheckpoint',task_list_artifacts:'taskListArtifacts',task_recovery_plan:'taskRecoveryPlan'
});
