const ACTIVE_STATES=new Set(['SUBMITTED','QUEUED','THINKING','DEEP_THINKING','STREAMING','TOOL_RUNNING','COMPLETING']);
const RETRY_STATES=new Set(['CONNECTION_LOST','FAILED','STALLED']);

function result(action,reason,confidence,notBefore){return {action,reason,confidence,notBefore};}

export function recommendWorkerRecovery(worker,session,policy={},now=Date.now()){
  const at=Number(now),delay=Math.max(1_000,Math.min(300_000,Number(policy.retryDelayMs)||8_000));
  if(!worker||worker.detachedAt!=null||!session)return result('REPLACE','worker_or_session_missing',.98,at);
  const state=String(session.state||'UNKNOWN').toUpperCase();
  if(state==='DOM_DRIFT')return result('HUMAN_REVIEW','dom_drift_fail_closed',1,at);
  if(ACTIVE_STATES.has(state))return result('WAIT',`active:${state}`,.99,at+Math.min(delay,5_000));
  if(state==='CONVERSATION_LIMIT'){
    if(policy.hasCheckpoint)return result('HANDOFF','conversation_limit_with_checkpoint',.98,at);
    return result('HUMAN_REVIEW','conversation_limit_without_checkpoint',1,at);
  }
  if(RETRY_STATES.has(state)){
    if(policy.recoveryEnabled===true)return result('RETRY',`recoverable:${state}`,.92,at+delay);
    return result('HUMAN_REVIEW','recovery_disabled',.95,at);
  }
  const level=String(session.health?.level||'unknown').toLowerCase(),lastSeen=Number(session.lastSeenAt||session.lastActivityAt||at),replaceAfter=Math.max(10_000,Number(policy.replaceAfterMs)||120_000);
  if(level==='critical'&&at-lastSeen>=replaceAfter)return result('REPLACE','critical_health_timeout',.9,at);
  if(state==='RATE_LIMITED')return result('WAIT','rate_limited',.98,at+Math.max(delay,30_000));
  if(state==='WAITING_USER')return result('WAIT','waiting_user_input',.99,at);
  return result('NONE',`stable:${state}`,1,at);
}

export { ACTIVE_STATES,RETRY_STATES };
