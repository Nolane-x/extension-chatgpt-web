const CRITICAL_STATES=new Set(['DOM_DRIFT','CONNECTION_LOST','FAILED','STALLED','RATE_LIMITED','CONVERSATION_LIMIT']);
const WORKING_STATES=new Set(['SUBMITTED','QUEUED','THINKING','DEEP_THINKING','STREAMING','TOOL_RUNNING','COMPLETING','WAITING_USER']);

export function leaseTimeLeftMs(lease,now=Date.now()){
  return Math.max(0,Number(lease?.expiresAt||0)-Number(now));
}

export function isLiveLease(lease,now=Date.now()){
  return Boolean(lease&&lease.revokedAt==null&&(lease.status==null||lease.status==='ACTIVE')&&leaseTimeLeftMs(lease,now)>0);
}

export function canHumanTakeover(worker,lease,now=Date.now()){
  return Boolean(worker&&worker.detachedAt==null&&isLiveLease(lease,now)&&lease.ownerType==='agent');
}

export function taskAttentionLevel(bundle,now=Date.now()){
  const task=bundle?.task||{};
  const workers=(bundle?.workers||[]).filter((worker)=>worker.detachedAt==null);
  if(workers.some((worker)=>CRITICAL_STATES.has(String(worker.lastKnownState||''))))return 'critical';
  if(String(task.status||'').toUpperCase()==='COMPLETED')return 'complete';
  if(workers.length&&workers.every((worker)=>String(worker.lastKnownState||'')==='COMPLETED'))return 'complete';
  if(workers.some((worker)=>WORKING_STATES.has(String(worker.lastKnownState||''))))return 'working';
  return 'working';
}

function currentLeaseFor(workerId,leases,now){
  const candidates=(leases||[]).filter((lease)=>lease.workerId===workerId&&isLiveLease(lease,now));
  candidates.sort((a,b)=>Number(b.expiresAt||0)-Number(a.expiresAt||0));
  return candidates[0]||null;
}

export function buildTaskCardModel(bundle,now=Date.now()){
  const task=bundle?.task||{};
  const workers=(bundle?.workers||[]).filter((worker)=>worker.taskId===task.id);
  const activeWorkers=workers.filter((worker)=>worker.detachedAt==null);
  const activeLeases=activeWorkers.map((worker)=>currentLeaseFor(worker.id,bundle?.leases||[],now)).filter(Boolean);
  return {
    ...task,
    workerCount:workers.length,
    activeWorkerCount:activeWorkers.length,
    leasedWorkerCount:activeLeases.length,
    checkpointCount:(bundle?.checkpoints||[]).filter((item)=>item.taskId===task.id).length,
    artifactCount:(bundle?.artifacts||[]).filter((item)=>item.taskId===task.id).length,
    attention:taskAttentionLevel(bundle,now)
  };
}

export function buildTaskDetailModel(bundle,now=Date.now()){
  const task=bundle?.task||{};
  const leases=bundle?.leases||[];
  const workers=(bundle?.workers||[]).filter((worker)=>worker.taskId===task.id).map((worker)=>{
    const lease=currentLeaseFor(worker.id,leases,now);
    return {...worker,lease:lease?{...lease,timeLeftMs:leaseTimeLeftMs(lease,now)}:null,canHumanTakeover:canHumanTakeover(worker,lease,now)};
  });
  workers.sort((a,b)=>Number(a.detachedAt!=null)-Number(b.detachedAt!=null)||Number(b.lastSeenAt||0)-Number(a.lastSeenAt||0)||String(a.id).localeCompare(String(b.id),'en'));
  const checkpoints=(bundle?.checkpoints||[]).filter((item)=>item.taskId===task.id).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)||String(b.id).localeCompare(String(a.id),'en'));
  const artifacts=(bundle?.artifacts||[]).filter((item)=>item.taskId===task.id).sort((a,b)=>Number(b.detectedAt||0)-Number(a.detectedAt||0)||String(a.id).localeCompare(String(b.id),'en'));
  return {task:{...task},workers,checkpoints,artifacts,attention:taskAttentionLevel(bundle,now)};
}
