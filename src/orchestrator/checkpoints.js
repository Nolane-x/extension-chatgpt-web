const KINDS=new Set(['CREATED','PROGRESS','HANDOFF','RECOVERY','ARTIFACT','DECISION','FAILURE','COMPLETED','MANUAL']);

function fail(code,message){const error=new Error(`${code}: ${message}`);error.code=code;throw error;}
function clampText(value,limit=4000){return String(value??'').replace(/\u0000/g,'').trim().slice(0,limit);}
function cloneObject(value){return value&&typeof value==='object'&&!Array.isArray(value)?structuredClone(value):{};}
function normalizeContext(ref){if(!ref)return null;const tabId=Number(ref.tabId);if(!Number.isInteger(tabId)||tabId<=0)fail('INVALID_INPUT','contextRef.tabId must be positive');return {tabId,conversationId:ref.conversationId==null?null:clampText(ref.conversationId,500)};}

export function createCheckpoint(task,input={},now=Date.now()){
  if(!task?.id)fail('TASK_NOT_FOUND','task is missing');
  const createdAt=Number(now);if(!Number.isFinite(createdAt))fail('INVALID_INPUT','now must be finite');
  const kind=String(input.kind||'').toUpperCase();if(!KINDS.has(kind))fail('INVALID_TASK_STATE',`unsupported checkpoint kind ${kind}`);
  const summary=clampText(input.summary,8000);if(!summary)fail('INVALID_INPUT','checkpoint summary is required');
  const artifactIds=[...new Set((Array.isArray(input.artifactIds)?input.artifactIds:[]).map(x=>clampText(x,300)).filter(Boolean))];
  const checkpoint={
    id:`checkpoint_${crypto.randomUUID()}`,taskId:task.id,parentId:task.headCheckpointId||null,kind,createdAt,summary,
    workerId:input.workerId==null?null:clampText(input.workerId,300),contextRef:normalizeContext(input.contextRef),artifactIds,
    metadata:cloneObject(input.metadata)
  };
  const nextTask={...task,workerIds:[...(task.workerIds||[])],metadata:cloneObject(task.metadata),headCheckpointId:checkpoint.id,updatedAt:createdAt};
  return {task:nextTask,checkpoint};
}

export { KINDS as CHECKPOINT_KINDS };
