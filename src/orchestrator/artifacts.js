function clone(value){return structuredClone(value);}
function keyOf(item){return `${String(item?.workerId||'')}\u0000${String(item?.sessionArtifactId||'')}`;}
function normalize(item){
  const out=clone(item||{});
  out.id=String(out.id||`taskArtifact_${out.workerId||'unknown'}_${out.sessionArtifactId||crypto.randomUUID()}`);
  out.taskId=String(out.taskId||'');out.workerId=String(out.workerId||'');out.sessionArtifactId=String(out.sessionArtifactId||'');
  out.tabId=Number(out.tabId)||0;out.conversationId=out.conversationId==null?null:String(out.conversationId);
  out.name=String(out.name||'artifact').slice(0,500);out.kind=String(out.kind||'unknown').slice(0,100);out.href=out.href==null?null:String(out.href).slice(0,5000);
  out.downloadId=Number.isInteger(Number(out.downloadId))?Number(out.downloadId):null;out.downloadState=out.downloadState==null?null:String(out.downloadState).slice(0,100);
  out.detectedAt=Number(out.detectedAt)||Date.now();
  out.provenance={source:String(out.provenance?.source||'session').slice(0,100),checkpointId:out.provenance?.checkpointId==null?null:String(out.provenance.checkpointId).slice(0,300)};
  return out;
}

export function mergeTaskArtifacts(existing=[],incoming=[]){
  const map=new Map();
  for(const raw of existing){const item=normalize(raw);if(!item.workerId||!item.sessionArtifactId)continue;map.set(keyOf(item),item);}
  for(const raw of incoming){
    const next=normalize(raw);if(!next.workerId||!next.sessionArtifactId)continue;const key=keyOf(next),prev=map.get(key);
    if(!prev){map.set(key,next);continue;}
    map.set(key,{
      ...prev,
      taskId:next.taskId||prev.taskId,tabId:next.tabId||prev.tabId,conversationId:next.conversationId??prev.conversationId,
      name:next.name||prev.name,kind:next.kind||prev.kind,href:next.href??prev.href,
      downloadId:next.downloadId??prev.downloadId,downloadState:next.downloadState??prev.downloadState,
      detectedAt:Math.min(Number(prev.detectedAt)||Infinity,Number(next.detectedAt)||Infinity),
      provenance:{source:prev.provenance?.source||next.provenance?.source||'session',checkpointId:prev.provenance?.checkpointId??next.provenance?.checkpointId??null}
    });
  }
  return [...map.values()].sort((a,b)=>a.detectedAt-b.detectedAt||String(a.id).localeCompare(String(b.id),'en'));
}
