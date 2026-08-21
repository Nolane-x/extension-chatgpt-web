export function createNativeBridge({ handleRequest, onStatus = () => {}, onEvent = () => {} }) {
  let port=null, enabled=false, reconnectTimer=null;
  const host='com.nolane.sentinel_bridge';
  const send=(message)=>{try{port?.postMessage(message);return true;}catch{return false;}};
  const connect=()=>{
    if(!enabled || port) return;
    try {
      port=chrome.runtime.connectNative(host); onStatus({enabled:true,connected:true});
      port.onMessage.addListener(async(message)=>{
        if(message?.kind==='agent.request') {
          try { const result=await handleRequest(message.payload||{}, {source:'native-bridge'}); send({kind:'agent.response',requestId:message.requestId,result}); }
          catch(error){ send({kind:'agent.response',requestId:message.requestId,error:{message:error instanceof Error?error.message:String(error)}}); }
        }
      });
      port.onDisconnect.addListener(()=>{port=null;onStatus({enabled:true,connected:false,error:chrome.runtime.lastError?.message||null});if(enabled){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,3000);}});
    } catch(error){ port=null;onStatus({enabled:true,connected:false,error:error.message}); }
  };
  return {
    setEnabled(value){enabled=Boolean(value); if(enabled) connect(); else {clearTimeout(reconnectTimer);port?.disconnect();port=null;onStatus({enabled:false,connected:false});}},
    emit(event){onEvent(event);send({kind:'event',event});},
    status(){return {enabled,connected:Boolean(port)};}
  };
}
