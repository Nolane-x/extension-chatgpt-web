const OWNER_TYPES=new Set(['human','agent','system']);
const MIN_TTL_MS=5_000,MAX_TTL_MS=600_000;

function fail(code,message){const error=new Error(`${code}: ${message}`);error.code=code;throw error;}
function nowValue(now){const value=Number(now);if(!Number.isFinite(value))fail('INVALID_INPUT','now must be finite');return value;}
function ttlValue(ttlMs){const value=Number(ttlMs);if(!Number.isFinite(value))return MIN_TTL_MS;return Math.max(MIN_TTL_MS,Math.min(MAX_TTL_MS,Math.trunc(value)));}
function leases(state){if(!Array.isArray(state?.leases))state.leases=[];return state.leases;}
function workers(state){if(!Array.isArray(state?.workers))state.workers=[];return state.workers;}
function workerFor(state,workerId){const worker=workers(state).find((item)=>item.id===workerId);if(!worker)fail('WORKER_NOT_FOUND',`worker ${workerId} not found`);if(worker.detachedAt!=null)fail('WORKER_DETACHED',`worker ${workerId} is detached`);return worker;}
function leaseFor(state,leaseId){const lease=leases(state).find((item)=>item.id===leaseId);if(!lease)fail('LEASE_EXPIRED',`lease ${leaseId} is not active`);return lease;}
function liveLeaseForWorker(state,workerId,now){return leases(state).find((lease)=>lease.workerId===workerId&&isLeaseValid(lease,now))||null;}
function owner(input){const ownerId=String(input.ownerId||'').trim(),ownerType=String(input.ownerType||'').trim();if(!ownerId)fail('INVALID_INPUT','ownerId is required');if(!OWNER_TYPES.has(ownerType))fail('INVALID_INPUT','ownerType is invalid');return {ownerId,ownerType};}

export function isLeaseValid(lease,now=Date.now()){
  const at=Number(now);
  return Boolean(lease?.id&&lease.revokedAt==null&&Number.isFinite(at)&&at<Number(lease.expiresAt));
}

export function acquireLease(state,input={},now=Date.now()){
  const at=nowValue(now),worker=workerFor(state,String(input.workerId||'')),identity=owner(input),ttl=ttlValue(input.ttlMs);
  const current=liveLeaseForWorker(state,worker.id,at);
  if(current){
    if(current.ownerId===identity.ownerId&&current.ownerType===identity.ownerType){
      current.heartbeatAt=at;current.expiresAt=at+ttl;worker.leaseId=current.id;return structuredClone(current);
    }
    if(!(input.takeover===true&&identity.ownerType==='human'))fail('LEASE_CONFLICT',`worker ${worker.id} is leased by another owner`);
    current.revokedAt=at;current.reason='human_takeover';
  }
  const lease={id:`lease_${crypto.randomUUID()}`,workerId:worker.id,ownerId:identity.ownerId,ownerType:identity.ownerType,issuedAt:at,heartbeatAt:at,expiresAt:at+ttl,revokedAt:null,reason:null};
  leases(state).push(lease);worker.leaseId=lease.id;return structuredClone(lease);
}

export function heartbeatLease(state,input={},now=Date.now()){
  const at=nowValue(now),worker=workerFor(state,String(input.workerId||'')),lease=leaseFor(state,String(input.leaseId||''));
  if(lease.workerId!==worker.id)fail('LEASE_OWNER_MISMATCH','lease does not belong to worker');
  if(lease.ownerId!==String(input.ownerId||''))fail('LEASE_OWNER_MISMATCH','lease owner mismatch');
  if(lease.revokedAt!=null)fail('LEASE_REVOKED','lease was revoked');
  if(at>=Number(lease.expiresAt))fail('LEASE_EXPIRED','lease expired');
  lease.heartbeatAt=at;lease.expiresAt=at+ttlValue(input.ttlMs);worker.leaseId=lease.id;return structuredClone(lease);
}

export function releaseLease(state,input={},now=Date.now()){
  const at=nowValue(now),lease=leaseFor(state,String(input.leaseId||'')),worker=workers(state).find((item)=>item.id===String(input.workerId||''));
  if(lease.workerId!==String(input.workerId||''))fail('LEASE_OWNER_MISMATCH','lease does not belong to worker');
  if(lease.ownerId!==String(input.ownerId||''))fail('LEASE_OWNER_MISMATCH','lease owner mismatch');
  if(lease.revokedAt==null){lease.revokedAt=at;lease.reason=String(input.reason||'released').slice(0,200);}
  if(worker?.leaseId===lease.id)worker.leaseId=null;
  return structuredClone(lease);
}

export function assertWorkerLease(state,input={},now=Date.now()){
  const at=nowValue(now),worker=workerFor(state,String(input.workerId||'')),lease=leaseFor(state,String(input.leaseId||''));
  if(lease.workerId!==worker.id)fail('LEASE_OWNER_MISMATCH','lease does not belong to worker');
  if(lease.ownerId!==String(input.ownerId||''))fail('LEASE_OWNER_MISMATCH','lease owner mismatch');
  if(lease.revokedAt!=null)fail('LEASE_REVOKED','lease was revoked');
  if(worker.leaseId!==lease.id)fail('LEASE_OWNER_MISMATCH','worker lease pointer mismatch');
  if(at>=Number(lease.expiresAt))fail('LEASE_EXPIRED','lease expired');
  return structuredClone(lease);
}

export { MIN_TTL_MS,MAX_TTL_MS };
