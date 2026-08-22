const COLLECTIONS=['tasks','workers','leases','checkpoints','artifacts'];

function clone(value){return structuredClone(value);}
function list(value){return Array.isArray(value)?value:[];}
function dedupeById(values){
  const seen=new Set(),out=[];
  for(const raw of list(values)){
    if(!raw||typeof raw!=='object')continue;
    const id=String(raw.id||'').trim();if(!id||seen.has(id))continue;
    seen.add(id);out.push(clone({...raw,id}));
  }
  return out;
}
function sortById(values){return values.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));}

export function normalizeOrchestratorSnapshot(snapshot={}){
  return {
    tasks:sortById(dedupeById(snapshot.tasks)),
    workers:sortById(dedupeById(snapshot.workers)),
    leases:sortById(dedupeById(snapshot.leases)),
    checkpoints:dedupeById(snapshot.checkpoints).sort((a,b)=>(Number(a.createdAt)||0)-(Number(b.createdAt)||0)||String(a.id).localeCompare(String(b.id),'en')),
    artifacts:dedupeById(snapshot.artifacts).sort((a,b)=>(Number(a.detectedAt)||0)-(Number(b.detectedAt)||0)||String(a.id).localeCompare(String(b.id),'en'))
  };
}

export function serializeOrchestratorSnapshot(snapshot={}){
  return JSON.stringify(normalizeOrchestratorSnapshot(snapshot));
}

export function deserializeOrchestratorSnapshot(text){
  try{
    const parsed=JSON.parse(String(text));
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('root must be object');
    return normalizeOrchestratorSnapshot(parsed);
  }catch(error){
    const wrapped=new Error(`Invalid orchestrator snapshot: ${error instanceof Error?error.message:String(error)}`);
    wrapped.code='INVALID_ORCHESTRATOR_SNAPSHOT';throw wrapped;
  }
}

export { COLLECTIONS as ORCHESTRATOR_COLLECTIONS };
