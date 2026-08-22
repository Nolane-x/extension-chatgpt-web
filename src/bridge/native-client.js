const PRIMARY_HOST='com.vigilume.bridge';
const LEGACY_HOST='com.nolane.sentinel_bridge';

export function createNativeBridge({ handleRequest, onStatus = () => {}, onEvent = () => {} }) {
  let port=null, enabled=false, reconnectTimer=null, activeHost=null;
  const send=(message)=>{try{port?.postMessage(message);return true;}catch{return false;}};

  const scheduleReconnect=()=>{
    if(!enabled)return;
    clearTimeout(reconnectTimer);
    reconnectTimer=setTimeout(()=>connect(PRIMARY_HOST),3000);
  };

  const connect=(host=PRIMARY_HOST)=>{
    if(!enabled || port) return;
    try {
      const candidate=chrome.runtime.connectNative(host);
      port=candidate;activeHost=host;
      onStatus({enabled:true,connected:true,host,legacy:host===LEGACY_HOST});
      candidate.onMessage.addListener(async(message)=>{
        if(message?.kind==='agent.request') {
          try { const result=await handleRequest(message.payload||{}, {source:'native-bridge'}); send({kind:'agent.response',requestId:message.requestId,result}); }
          catch(error){ send({kind:'agent.response',requestId:message.requestId,error:{message:error instanceof Error?error.message:String(error)}}); }
        }
      });
      candidate.onDisconnect.addListener(()=>{
        const error=chrome.runtime.lastError?.message||null;
        const failedHost=activeHost;
        port=null;activeHost=null;
        onStatus({enabled:true,connected:false,error,host:failedHost,legacy:failedHost===LEGACY_HOST});
        if(!enabled)return;
        if(failedHost===PRIMARY_HOST) connect(LEGACY_HOST);
        else scheduleReconnect();
      });
    } catch(error){
      port=null;activeHost=null;
      onStatus({enabled:true,connected:false,error:error.message,host,legacy:host===LEGACY_HOST});
      if(host===PRIMARY_HOST) connect(LEGACY_HOST); else scheduleReconnect();
    }
  };

  return {
    setEnabled(value){
      enabled=Boolean(value);
      if(enabled) connect(PRIMARY_HOST);
      else {clearTimeout(reconnectTimer);reconnectTimer=null;port?.disconnect();port=null;activeHost=null;onStatus({enabled:false,connected:false});}
    },
    emit(event){onEvent(event);send({kind:'event',event});},
    status(){return {enabled,connected:Boolean(port),host:activeHost,legacy:activeHost===LEGACY_HOST};}
  };
}
