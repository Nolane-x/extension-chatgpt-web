const SAFE_KEYS=new Set(['stage','action','source','timestamp','state','queueId','ruleId','textChars','error','detail']);

export function appendActionTrace(trace=[],entry={},limit=32){
  const item={};
  for(const [key,value] of Object.entries(entry||{})){
    if(!SAFE_KEYS.has(key)||value==null)continue;
    if(key==='text')continue;
    item[key]=typeof value==='string'?value.slice(0,key==='error'?600:240):value;
  }
  item.timestamp=Number(item.timestamp)||Date.now();
  item.stage=String(item.stage||'ACTION').slice(0,120);
  return [...(Array.isArray(trace)?trace:[]),item].slice(-Math.max(1,Number(limit)||32));
}
