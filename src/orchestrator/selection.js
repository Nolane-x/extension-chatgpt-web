const BUSY_SEND_STATES=new Set(['SUBMITTED','QUEUED','THINKING','DEEP_THINKING','STREAMING','TOOL_RUNNING','COMPLETING']);
const RECOVERING_STATES=new Set(['CONNECTION_LOST','FAILED','STALLED']);
const STATE_SCORE={IDLE:100,COMPLETED:95,WAITING_USER:70};
const HEALTH_SCORE={healthy:15,degraded:5,critical:-30,unknown:0};

function fail(code,message){const error=new Error(`${code}: ${message}`);error.code=code;throw error;}
function sessionFor(index,tabId){if(index instanceof Map)return index.get(tabId)||null;return index?.[tabId]||null;}
function validLease(lease,now){return Boolean(lease?.id&&lease.revokedAt==null&&Number(now)<Number(lease.expiresAt));}

export function selectWorker(task,workers=[],sessionIndex,input={},now=Date.now()){
  if(!task?.id)fail('TASK_NOT_FOUND','task is missing');
  if(task.status!=='ACTIVE')fail('INVALID_TASK_STATE',`task is ${task.status||'unknown'}`);
  const ownerId=String(input.ownerId||'').trim();
  const leases=Array.isArray(input.leases)?input.leases:[];
  const allowRecovering=input.allowRecovering===true;
  const intent=input.intent||'send';
  const candidates=[];
  for(const worker of workers){
    if(!worker||worker.taskId!==task.id||worker.detachedAt!=null)continue;
    const session=sessionFor(sessionIndex,worker.tabId);if(!session)continue;
    const state=String(session.state||'UNKNOWN').toUpperCase();
    if(state==='DOM_DRIFT')continue;
    if(intent==='send'&&BUSY_SEND_STATES.has(state))continue;
    if(!allowRecovering&&RECOVERING_STATES.has(state))continue;
    const lease=leases.find((item)=>item.id===worker.leaseId&&item.workerId===worker.id&&validLease(item,now));
    if(lease&&lease.ownerId!==ownerId)continue;
    let score=STATE_SCORE[state]??20;
    const reasons=[`state:${state}`];
    const health=String(session.health?.level||'unknown').toLowerCase();score+=HEALTH_SCORE[health]??0;reasons.push(`health:${health}`);
    const queue=Math.max(0,Number(session.queueCount)||0);score-=Math.min(queue,20)*2;if(queue)reasons.push(`queue:-${Math.min(queue,20)*2}`);
    if(input.preferredConversationId&&session.conversationId===input.preferredConversationId){score+=12;reasons.push('continuity:+12');}
    if(lease&&lease.ownerId===ownerId){score+=6;reasons.push('lease_reuse:+6');}
    candidates.push({worker,score,reasons,attachedAt:Number(worker.attachedAt)||0});
  }
  if(!candidates.length)fail('NO_ELIGIBLE_WORKER','no eligible worker for task');
  candidates.sort((a,b)=>b.score-a.score||a.attachedAt-b.attachedAt||String(a.worker.id).localeCompare(String(b.worker.id),'en'));
  const best=candidates[0];return {worker:structuredClone(best.worker),score:best.score,reasons:[...best.reasons]};
}

export { BUSY_SEND_STATES,RECOVERING_STATES };
