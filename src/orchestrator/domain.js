const TASK_STATUSES=new Set(['ACTIVE','PAUSED','COMPLETED','FAILED','CANCELLED']);
const TEXT_LIMITS={title:180,goal:20000,role:120,conversationId:500};

function makeError(code,message){const error=new Error(`${code}: ${message}`);error.code=code;return error;}
function text(value,limit,{required=false,label='text'}={}){const out=String(value??'').replace(/\u0000/g,'').trim().slice(0,limit);if(required&&!out)throw makeError('INVALID_INPUT',`${label} is required`);return out;}
function plainObject(value){return value&&typeof value==='object'&&!Array.isArray(value)?structuredClone(value):{};}
function id(prefix){return `${prefix}_${crypto.randomUUID()}`;}

export function createTask(input={},now=Date.now()){
  const createdAt=Number(now);
  if(!Number.isFinite(createdAt))throw makeError('INVALID_INPUT','now must be finite');
  return {
    id:id('task'),
    title:text(input.title,TEXT_LIMITS.title,{required:true,label:'title'}),
    goal:text(input.goal,TEXT_LIMITS.goal,{required:true,label:'goal'}),
    status:'ACTIVE',createdAt,updatedAt:createdAt,workerIds:[],headCheckpointId:null,
    metadata:plainObject(input.metadata)
  };
}

export function updateTask(task,patch={},now=Date.now()){
  if(!task?.id)throw makeError('TASK_NOT_FOUND','task is missing');
  const updatedAt=Number(now);if(!Number.isFinite(updatedAt))throw makeError('INVALID_INPUT','now must be finite');
  const next={...task,workerIds:[...(task.workerIds||[])],metadata:plainObject(task.metadata),updatedAt};
  if(Object.hasOwn(patch,'title'))next.title=text(patch.title,TEXT_LIMITS.title,{required:true,label:'title'});
  if(Object.hasOwn(patch,'goal'))next.goal=text(patch.goal,TEXT_LIMITS.goal,{required:true,label:'goal'});
  if(Object.hasOwn(patch,'status')){const status=String(patch.status||'').toUpperCase();if(!TASK_STATUSES.has(status))throw makeError('INVALID_TASK_STATE',`unsupported status ${status}`);next.status=status;}
  if(Object.hasOwn(patch,'metadata'))next.metadata=plainObject(patch.metadata);
  return next;
}

export function createWorkerBinding(input={},now=Date.now()){
  const taskId=text(input.taskId,200,{required:true,label:'taskId'}),tabId=Number(input.tabId),attachedAt=Number(now);
  if(!Number.isInteger(tabId)||tabId<=0)throw makeError('INVALID_INPUT','tabId must be a positive integer');
  if(!Number.isFinite(attachedAt))throw makeError('INVALID_INPUT','now must be finite');
  return {
    id:id('worker'),taskId,tabId,
    conversationId:input.conversationId==null?null:text(input.conversationId,TEXT_LIMITS.conversationId),
    role:text(input.role||'worker',TEXT_LIMITS.role)||'worker',
    attachedAt,detachedAt:null,leaseId:null,lastKnownState:'DISCOVERED',lastSeenAt:attachedAt
  };
}

export function detachWorker(worker,now=Date.now()){
  if(!worker?.id)throw makeError('WORKER_NOT_FOUND','worker is missing');
  if(worker.detachedAt!=null)return {...worker};
  const detachedAt=Number(now);if(!Number.isFinite(detachedAt))throw makeError('INVALID_INPUT','now must be finite');
  return {...worker,detachedAt,leaseId:null,lastSeenAt:Math.max(Number(worker.lastSeenAt)||0,detachedAt)};
}

export { TASK_STATUSES };
