export function createTaskCommandRouter(service,options={}){
  if(!service||typeof service!=='object')throw new TypeError('orchestrator service is required');
  const getRecoveryPolicy=typeof options.getRecoveryPolicy==='function'?options.getRecoveryPolicy:()=>({});
  return async function routeTaskCommand(action,params={},context={source:'ui'}){
    const source=context?.source||'ui';
    if(action==='taskCreate')return service.createTask({title:params.title,goal:params.goal,metadata:params.metadata});
    if(action==='taskList')return {tasks:service.listTasks({status:params.status})};
    if(action==='taskGet')return service.getTask(params.taskId,{includeCheckpoints:params.includeCheckpoints!==false});
    if(action==='taskUpdate')return service.updateTask(params.taskId,params.patch||{});
    if(action==='taskBindWorker')return service.bindWorker(params.taskId,Number(params.tabId),params.role||'worker');
    if(action==='taskDetachWorker')return service.detachWorker(params.taskId,params.workerId);
    if(action==='taskAcquireLease')return service.acquireLease(params.taskId,params.workerId,{ownerId:params.ownerId,ownerType:source==='agent'?'agent':(params.ownerType||'human'),ttlMs:params.ttlMs,takeover:false});
    if(action==='taskHumanTakeover'){
      if(source==='agent')throw new Error('taskHumanTakeover không được phép từ agent API.');
      return service.acquireLease(params.taskId,params.workerId,{ownerId:params.ownerId||'human-ui',ownerType:'human',ttlMs:params.ttlMs,takeover:true});
    }
    if(action==='taskHeartbeatLease')return service.heartbeatLease(params.taskId,params.workerId,{leaseId:params.leaseId,ownerId:params.ownerId,ttlMs:params.ttlMs});
    if(action==='taskReleaseLease')return service.releaseLease(params.taskId,params.workerId,{leaseId:params.leaseId,ownerId:params.ownerId,reason:params.reason});
    if(action==='taskAcquireBestWorker')return service.acquireBestWorker(params.taskId,{ownerId:params.ownerId,ownerType:source==='agent'?'agent':(params.ownerType||'human'),ttlMs:params.ttlMs,intent:params.intent||'send',preferredConversationId:params.preferredConversationId});
    if(action==='taskSend')return service.taskSend(params);
    if(action==='taskQueueSend')return service.taskQueueSend(params);
    if(action==='taskWait')return service.taskWait(params);
    if(action==='taskCheckpoint')return service.checkpoint(params.taskId,{kind:params.kind,summary:params.summary,workerId:params.workerId,artifactIds:params.artifactIds,contextRef:params.contextRef,metadata:params.metadata});
    if(action==='taskListCheckpoints')return {checkpoints:service.listCheckpoints(params.taskId)};
    if(action==='taskListArtifacts')return {artifacts:service.listArtifacts(params.taskId)};
    if(action==='taskRecoveryPlan')return service.recoveryPlan(params.taskId,getRecoveryPolicy(params.taskId));
    throw new Error(`Task command không hỗ trợ: ${action}`);
  };
}
