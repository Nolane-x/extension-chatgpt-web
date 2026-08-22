export const HUMAN_OWNER_ID='human-ui';
const HUMAN_LEASE_TTL_MS=600_000;

export function findHumanLease(bundle,workerId,now=Date.now()){
  const id=String(workerId||'');
  return (bundle?.leases||[]).filter((lease)=>lease.workerId===id&&lease.ownerId===HUMAN_OWNER_ID&&lease.ownerType==='human'&&lease.revokedAt==null&&(lease.status==null||lease.status==='ACTIVE')&&Number(lease.expiresAt)>Number(now)).sort((a,b)=>Number(b.expiresAt||0)-Number(a.expiresAt||0))[0]||null;
}

export function leasesNeedingHeartbeat(bundle,now=Date.now(),thresholdMs=120_000){
  const at=Number(now),threshold=Math.max(0,Number(thresholdMs)||0),workers=new Map((bundle?.workers||[]).map((worker)=>[worker.id,worker]));
  return (bundle?.leases||[]).filter((lease)=>lease.ownerId===HUMAN_OWNER_ID&&lease.ownerType==='human'&&lease.revokedAt==null&&(lease.status==null||lease.status==='ACTIVE')&&Number(lease.expiresAt)>at&&Number(lease.expiresAt)-at<=threshold&&workers.get(lease.workerId)?.detachedAt==null).map((lease)=>({worker:workers.get(lease.workerId),lease}));
}

export function buildTaskSendParams(bundle,workerId,text,now=Date.now()){
  const prompt=String(text||'').trim();if(!prompt)throw new Error('Prompt task đang trống.');
  const taskId=String(bundle?.task?.id||'');if(!taskId)throw new Error('Task không hợp lệ.');
  const worker=(bundle?.workers||[]).find((item)=>item.id===String(workerId||'')&&item.detachedAt==null);if(!worker)throw new Error('Worker không tồn tại hoặc đã tách.');
  const lease=findHumanLease(bundle,worker.id,now);if(!lease)throw new Error('Không có human lease hợp lệ cho worker này.');
  return {taskId,workerId:worker.id,leaseId:lease.id,ownerId:HUMAN_OWNER_ID,text:prompt};
}

export function createTaskActionController({ui,command,toast,now=()=>Date.now()}={}){
  if(!ui||typeof command!=='function')throw new TypeError('ui and command are required');
  const notify=typeof toast==='function'?toast:()=>{};
  async function refreshTaskData({detail=true}={}){
    ui.dashboard.tasks=await command('taskDashboard');
    if(detail&&ui.selectedTaskId){
      try{ui.taskDetail=await command('taskGet',{taskId:ui.selectedTaskId,includeCheckpoints:true});}
      catch(error){ui.selectedTaskId=null;ui.taskDetail=null;ui.taskRecovery=null;ui.view='tasks';throw error;}
      const renew=leasesNeedingHeartbeat(ui.taskDetail,now(),120_000);
      for(const item of renew)await command('taskHeartbeatLease',{taskId:ui.selectedTaskId,workerId:item.worker.id,leaseId:item.lease.id,ownerId:HUMAN_OWNER_ID,ttlMs:HUMAN_LEASE_TTL_MS}).catch(()=>{});
      if(renew.length){
        try{ui.taskDetail=await command('taskGet',{taskId:ui.selectedTaskId,includeCheckpoints:true});}
        catch(error){ui.selectedTaskId=null;ui.taskDetail=null;ui.taskRecovery=null;ui.view='tasks';throw error;}
      }
    }
    return ui.dashboard.tasks;
  }
  async function openTask(taskId){
    ui.selectedTaskId=String(taskId||'');if(!ui.selectedTaskId)throw new Error('Task ID trống.');
    ui.taskDetail=await command('taskGet',{taskId:ui.selectedTaskId,includeCheckpoints:true});ui.taskRecovery=null;ui.view='task-detail';return ui.taskDetail;
  }
  async function handle(target){
    const action=target?.dataset?.action;if(!String(action||'').startsWith('task-'))return false;
    const taskId=ui.selectedTaskId;
    if(action==='task-create'){
      const title=document.getElementById('taskTitle')?.value?.trim(),goal=document.getElementById('taskGoal')?.value?.trim();if(!title||!goal)throw new Error('Cần tiêu đề và mục tiêu task.');
      const task=await command('taskCreate',{title,goal});await refreshTaskData({detail:false});await openTask(task.id);notify('Đã tạo task.');return true;
    }
    if(action==='task-open'){await openTask(target.dataset.task);return true;}
    if(action==='task-back'){ui.view='tasks';ui.selectedTaskId=null;ui.taskDetail=null;ui.taskRecovery=null;return true;}
    if(!taskId)throw new Error('Chưa chọn task.');
    if(action==='task-bind-worker'){
      const tabId=Number(document.getElementById('taskBindTab')?.value),role=document.getElementById('taskBindRole')?.value?.trim()||'worker';if(!Number.isInteger(tabId)||tabId<=0)throw new Error('Hãy chọn một ChatGPT tab.');await command('taskBindWorker',{taskId,tabId,role});notify('Đã gắn ChatGPT worker.');
    }else if(action==='task-acquire-lease'){
      await command('taskAcquireLease',{taskId,workerId:target.dataset.worker,ownerId:HUMAN_OWNER_ID,ownerType:'human',ttlMs:HUMAN_LEASE_TTL_MS});notify('Bạn đã nhận quyền worker.');
    }else if(action==='task-human-takeover'){
      await command('taskHumanTakeover',{taskId,workerId:target.dataset.worker,ownerId:HUMAN_OWNER_ID,ttlMs:HUMAN_LEASE_TTL_MS});notify('Đã thu hồi lease agent và chuyển quyền cho bạn.');
    }else if(action==='task-release-lease'){
      await command('taskReleaseLease',{taskId,workerId:target.dataset.worker,leaseId:target.dataset.lease,ownerId:HUMAN_OWNER_ID,reason:'human_release'});notify('Đã nhả quyền worker.');
    }else if(action==='task-acquire-best'){
      const result=await command('taskAcquireBestWorker',{taskId,ownerId:HUMAN_OWNER_ID,ownerType:'human',ttlMs:HUMAN_LEASE_TTL_MS,intent:'send'});notify(`Đã chọn ${result.worker?.role||result.worker?.id||'worker'} (${Math.round(Number(result.score||0))}).`);
    }else if(action==='task-send'||action==='task-queue-send'){
      const workerId=document.getElementById('taskWorkerSelect')?.value,text=document.getElementById('taskPrompt')?.value,bundle=ui.taskDetail,params=buildTaskSendParams(bundle,workerId,text,now());
      if(action==='task-send')await command('taskSend',params);else await command('taskQueueSend',{...params,handoffOnLimit:true,expiresInMs:86_400_000});
      const input=document.getElementById('taskPrompt');if(input)input.value='';notify(action==='task-send'?'Đã gửi qua worker có lease.':'Đã xếp prompt vào Safe Queue.');
    }else if(action==='task-recovery-plan'){
      ui.taskRecovery=await command('taskRecoveryPlan',{taskId});notify('Đã đánh giá recovery cho worker pool.');
    }else if(action==='task-checkpoint'){
      const summary=document.getElementById('taskCheckpointSummary')?.value?.trim(),kind=document.getElementById('taskCheckpointKind')?.value||'PROGRESS';if(!summary)throw new Error('Tóm tắt checkpoint đang trống.');await command('taskCheckpoint',{taskId,kind,summary});const input=document.getElementById('taskCheckpointSummary');if(input)input.value='';notify('Đã lưu checkpoint.');
    }else if(action==='task-status'){
      await command('taskUpdate',{taskId,patch:{status:target.dataset.status}});notify(`Task → ${target.dataset.status}.`);
    }else if(action==='task-download-artifact'){
      await command('downloadArtifact',{tabId:Number(target.dataset.tab),artifactId:target.dataset.artifact});notify('Đã gửi yêu cầu tải artifact.');
    }else return false;
    await refreshTaskData({detail:true});return true;
  }
  return {refreshTaskData,openTask,handle};
}
