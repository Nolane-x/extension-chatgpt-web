export function createCompletionSettler({settleMs=2000,setTimer=setTimeout,clearTimer=clearTimeout,onDue}={}){
  if(typeof onDue!=='function')throw new TypeError('onDue is required');
  const entries=new Map();
  const cancel=(tabId)=>{
    const current=entries.get(tabId);
    if(!current)return false;
    clearTimer(current.timer);entries.delete(tabId);return true;
  };
  const reconcile=(tabId,stateInfo={},now=Date.now())=>{
    const candidate=stateInfo?.completionCandidate;
    if(stateInfo?.state!=='COMPLETING'||!candidate?.signature||!Number.isFinite(candidate.since)){
      cancel(tabId);return null;
    }
    const dueAt=candidate.since+Math.max(0,Number(settleMs)||0);
    const key=`${candidate.since}:${candidate.signature}`;
    const current=entries.get(tabId);
    if(current?.key===key)return current.dueAt;
    if(current)cancel(tabId);
    const delay=Math.max(0,dueAt-now);
    const timer=setTimer(()=>{
      const latest=entries.get(tabId);
      if(!latest||latest.key!==key)return;
      entries.delete(tabId);
      Promise.resolve(onDue(tabId,{key,dueAt})).catch(()=>{});
    },delay);
    entries.set(tabId,{key,dueAt,timer});
    return dueAt;
  };
  return {reconcile,cancel,size:()=>entries.size};
}
