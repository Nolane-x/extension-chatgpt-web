#!/usr/bin/env node
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const HOST='127.0.0.1';
const PORT=Number(process.env.NOLANE_SENTINEL_PORT||17892);
const PROTOCOL='2026-07-28';
const VERSION='0.2.1';
const SERVER_INFO={name:'nolane-sentinel-bridge',version:VERSION};
const CONFIG_DIR=path.join(os.homedir(),'.nolane-sentinel');
const TOKEN_PATH=path.join(CONFIG_DIR,'bridge-token.json');
const MAX_NATIVE_OUT=900_000;
const pending=new Map();
const sseClients=new Set();
let inputBuffer=Buffer.alloc(0);

const tools=[
  ['chatgpt_list_tabs','Liệt kê mọi tab ChatGPT và trạng thái hợp nhất.',{},[]],
  ['chatgpt_observe','Đọc state/timeline của một tab.',{tabId:{type:'integer'},includeContext:{type:'boolean'}},['tabId']],
  ['chatgpt_diagnose','Đọc chẩn đoán DOM/CDP/Network/Performance.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_wait_until','Chờ state mục tiêu tối đa 25 giây.',{tabId:{type:'integer'},states:{type:'array',items:{type:'string'}},timeoutMs:{type:'integer'}},['tabId','states']],
  ['chatgpt_open','Mở ChatGPT mới.',{url:{type:'string'},active:{type:'boolean'}},[]],
  ['chatgpt_compose','Điền composer nhưng chưa gửi.',{tabId:{type:'integer'},text:{type:'string'},replace:{type:'boolean'}},['tabId','text']],
  ['chatgpt_send','Gửi prompt vào ChatGPT.',{tabId:{type:'integer'},text:{type:'string'},replace:{type:'boolean'}},['tabId','text']],
  ['chatgpt_queue_send','Xếp prompt và chỉ gửi khi state an toàn.',{tabId:{type:'integer'},text:{type:'string'},expiresInMs:{type:'integer'},handoffOnLimit:{type:'boolean'}},['tabId','text']],
  ['chatgpt_list_queue','Liệt kê prompt đang chờ.',{tabId:{type:'integer'}},[]],
  ['chatgpt_cancel_queued','Hủy prompt đang chờ.',{queueId:{type:'string'}},['queueId']],
  ['chatgpt_stop','Dừng turn.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_retry','Lên lịch retry có guard.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_continue_new_chat','Chuyển chat và mang Context Vault.',{tabId:{type:'integer'},continuation:{type:'string'}},['tabId']],
  ['chatgpt_list_artifacts','Liệt kê file/GitHub artifact.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_download_artifact','Tải artifact về máy.',{tabId:{type:'integer'},artifactId:{type:'string'}},['tabId','artifactId']],
  ['chatgpt_download_all_artifacts','Tải tất cả file artifact có thể tải.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_get_download','Đọc trạng thái/đường dẫn download.',{downloadId:{type:'integer'}},['downloadId']],
  ['chatgpt_get_context','Đọc Context Vault.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_delete_context','Xóa Context Vault.',{tabId:{type:'integer'}},['tabId']],
  ['automation_list','Liệt kê automation.',{},[]],
  ['automation_set_enabled','Bật/tắt automation.',{ruleId:{type:'string'},enabled:{type:'boolean'}},['ruleId','enabled']],
  ['automation_save','Tạo/cập nhật automation.',{rule:{type:'object'}},['rule']],
  ['automation_delete','Xóa automation.',{ruleId:{type:'string'}},['ruleId']]
].map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}}));

const toolAction={
  chatgpt_list_tabs:'listTabs',chatgpt_observe:'observe',chatgpt_diagnose:'diagnose',chatgpt_wait_until:'waitUntil',chatgpt_open:'openChat',chatgpt_compose:'compose',chatgpt_send:'send',
  chatgpt_queue_send:'queueSend',chatgpt_list_queue:'listQueue',chatgpt_cancel_queued:'cancelQueued',chatgpt_stop:'stop',chatgpt_retry:'retry',chatgpt_continue_new_chat:'continueNewChat',
  chatgpt_list_artifacts:'listArtifacts',chatgpt_download_artifact:'downloadArtifact',chatgpt_download_all_artifacts:'downloadAllArtifacts',chatgpt_get_download:'getDownload',chatgpt_get_context:'getContext',
  chatgpt_delete_context:'deleteContext',automation_list:'listAutomations',automation_set_enabled:'setAutomationEnabled',automation_save:'saveAutomation',automation_delete:'deleteAutomation'
};

function ensureToken(){
  fs.mkdirSync(CONFIG_DIR,{recursive:true,mode:0o700});
  try{fs.chmodSync(CONFIG_DIR,0o700);}catch{}
  let token;
  try{token=JSON.parse(fs.readFileSync(TOKEN_PATH,'utf8')).token;}catch{}
  if(!token||typeof token!=='string'||token.length<32){token=crypto.randomBytes(32).toString('base64url');fs.writeFileSync(TOKEN_PATH,JSON.stringify({version:1,token,port:PORT},null,2)+'\n',{mode:0o600});}
  try{fs.chmodSync(TOKEN_PATH,0o600);}catch{}
  return token;
}
const TOKEN=ensureToken();

function nativeWrite(message){
  let payload=Buffer.from(JSON.stringify(message),'utf8');
  if(payload.length>MAX_NATIVE_OUT) payload=Buffer.from(JSON.stringify({kind:'bridge.error',error:{message:'Native message vượt giới hạn an toàn 900KB.'}}));
  const head=Buffer.alloc(4);head.writeUInt32LE(payload.length,0);process.stdout.write(Buffer.concat([head,payload]));
}

function handleNative(message){
  if(message?.kind==='agent.response'&&message.requestId){const entry=pending.get(message.requestId);if(entry){pending.delete(message.requestId);clearTimeout(entry.timer);message.error?entry.reject(new Error(message.error.message||'Extension error')):entry.resolve(message.result);}}
  if(message?.kind==='event'&&message.event)broadcastEvent(message.event);
}

process.stdin.on('data',(chunk)=>{
  inputBuffer=Buffer.concat([inputBuffer,chunk]);
  while(inputBuffer.length>=4){const length=inputBuffer.readUInt32LE(0);if(length>64*1024*1024){console.error('Native input frame too large');process.exit(2);}if(inputBuffer.length<4+length)break;const body=inputBuffer.subarray(4,4+length);inputBuffer=inputBuffer.subarray(4+length);try{handleNative(JSON.parse(body.toString('utf8')));}catch(e){console.error('Invalid native message:',e.message);}}
});
process.stdin.on('end',()=>{for(const {reject} of pending.values())reject(new Error('Extension disconnected'));pending.clear();server.close();});

function callExtension(payload,timeoutMs=30_000){
  const requestId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Extension response timeout'));},timeoutMs);pending.set(requestId,{resolve,reject,timer});nativeWrite({kind:'agent.request',requestId,payload});});
}
function broadcastEvent(event){const data=`event: sentinel\ndata: ${JSON.stringify(event)}\n\n`;for(const res of [...sseClients]){try{res.write(data);}catch{sseClients.delete(res);}}}
function json(res,status,body,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(body));}
function authorized(req){const value=req.headers.authorization||'';return value===`Bearer ${TOKEN}`;}
function originAllowed(req){const origin=req.headers.origin;if(!origin)return true;try{const u=new URL(origin);return u.protocol==='http:'&&(u.hostname==='127.0.0.1'||u.hostname==='localhost');}catch{return false;}}
async function readJson(req,max=1_000_000){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max)throw new Error('Request body too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}

function validateMcpHeaders(req,body){
  const version=req.headers['mcp-protocol-version'];const method=req.headers['mcp-method'];const name=req.headers['mcp-name'];
  const envelope=body?.params?._meta||{};const metaVersion=envelope['io.modelcontextprotocol/protocolVersion'];
  if(version!==PROTOCOL)throw Object.assign(new Error(`MCP-Protocol-Version phải là ${PROTOCOL}`),{status:400,code:-32022});
  if(metaVersion!==PROTOCOL)throw Object.assign(new Error('params._meta protocolVersion thiếu hoặc không khớp.'),{status:400,code:-32020});
  if(method!==body.method)throw Object.assign(new Error('Mcp-Method không khớp JSON-RPC method.'),{status:400,code:-32020});
  if(body.method==='tools/call'&&name!==body.params?.name)throw Object.assign(new Error('Mcp-Name không khớp tools/call params.name.'),{status:400,code:-32020});
}
function resultMeta(){return {'io.modelcontextprotocol/serverInfo':SERVER_INFO};}
function rpcError(id,code,message){return {jsonrpc:'2.0',id:id??null,error:{code,message,data:{_meta:resultMeta()}}};}
function rpcResult(id,result){return {jsonrpc:'2.0',id,result:{...result,_meta:{...(result?._meta||{}),...resultMeta()}}};}
function completeText(result){return {resultType:'complete',content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};}
async function handleMcp(body){
  const id=body.id??null;
  if(body.jsonrpc!=='2.0'||typeof body.method!=='string')return rpcError(id,-32600,'Invalid Request');
  if(body.method==='server/discover')return rpcResult(id,{resultType:'complete',supportedVersions:[PROTOCOL],capabilities:{tools:{}},ttlMs:5_000,cacheScope:'private',instructions:'Quan sát và điều khiển ChatGPT Web qua Nolane Sentinel. Các action bị giới hạn bởi capability scopes trong extension.'});
  if(body.method==='tools/list')return rpcResult(id,{resultType:'complete',tools,ttlMs:5_000,cacheScope:'private'});
  if(body.method==='tools/call'){
    const name=body.params?.name,action=toolAction[name];if(!action)return rpcError(id,-32602,`Unknown tool: ${name}`);
    try{const result=await callExtension({action,params:body.params?.arguments||{}});return rpcResult(id,completeText(result));}
    catch(e){return rpcResult(id,{resultType:'complete',content:[{type:'text',text:e.message}],isError:true});}
  }
  return rpcError(id,-32601,'Method not found');
}

const server=http.createServer(async(req,res)=>{
  try{
    if(!originAllowed(req)){json(res,403,{error:'Origin not allowed'});return;}
    if(req.url==='/health'&&req.method==='GET'){json(res,200,{ok:true,name:'nolane-sentinel-bridge',version:VERSION,protocol:PROTOCOL});return;}
    if(!authorized(req)){json(res,401,{error:'Unauthorized'},{'www-authenticate':'Bearer'});return;}
    if(req.url==='/events'&&req.method==='GET'){
      res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-store','connection':'keep-alive','x-accel-buffering':'no'});res.write(`event: ready\ndata: ${JSON.stringify({protocol:PROTOCOL})}\n\n`);sseClients.add(res);req.on('close',()=>sseClients.delete(res));return;
    }
    if(req.url==='/rpc'&&req.method==='POST'){
      const body=await readJson(req);const payload=body.action?body:{action:body.method,params:body.params||{},id:body.id};const result=await callExtension(payload);json(res,200,body.jsonrpc?{jsonrpc:'2.0',id:body.id??null,result}:result);return;
    }
    if(req.url==='/mcp'&&req.method==='POST'){
      const body=await readJson(req);validateMcpHeaders(req,body);const reply=await handleMcp(body);json(res,reply.error?400:200,reply,{'MCP-Protocol-Version':PROTOCOL});return;
    }
    json(res,404,{error:'Not found'});
  }catch(e){json(res,e.status||500,rpcError(null,e.code||-32603,e.message||'Internal error'));}
});
server.listen(PORT,HOST,()=>console.error(`[nolane-sentinel] bridge listening on http://${HOST}:${PORT}; token: ${TOKEN_PATH}`));
server.on('error',(e)=>{console.error('[nolane-sentinel] bridge server error:',e.message);process.exitCode=1;});
