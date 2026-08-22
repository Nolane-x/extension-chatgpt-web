import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

async function freePort() {
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}

async function waitForListening(child, timeoutMs=5000) {
  let buffer='';
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`native host did not listen: ${buffer}`)),timeoutMs);
    child.stderr.on('data',chunk=>{buffer+=chunk.toString();if(buffer.includes('bridge listening')){clearTimeout(timer);resolve();}});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`native host exited early: ${code}; ${buffer}`));});
  });
}

test('Vigilume native bridge starts on loopback and serves MCP 2026-07-28 discovery', async () => {
  const home=await mkdtemp(path.join(os.tmpdir(),'vigilume-test-'));
  const port=await freePort();
  const child=spawn(process.execPath,['native-host/vigilume_bridge.mjs'],{ cwd:process.cwd(),env:{...process.env,HOME:home,USERPROFILE:home,VIGILUME_PORT:String(port)},stdio:['pipe','pipe','pipe'] });
  try {
    await waitForListening(child);
    const tokenData=JSON.parse(await readFile(path.join(home,'.vigilume','bridge-token.json'),'utf8'));
    const health=await fetch(`http://127.0.0.1:${port}/health`).then(r=>r.json());
    assert.equal(health.ok,true);
    assert.equal(health.name,'vigilume-bridge');
    assert.equal(health.version,'0.3.1');
    assert.equal(health.protocol,'2026-07-28');

    const body={jsonrpc:'2.0',id:'discover',method:'server/discover',params:{_meta:{ 'io.modelcontextprotocol/protocolVersion':'2026-07-28', 'io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0.0'}, 'io.modelcontextprotocol/clientCapabilities':{} }}};
    const response=await fetch(`http://127.0.0.1:${port}/mcp`,{ method:'POST',headers:{authorization:`Bearer ${tokenData.token}`,'content-type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'server/discover'},body:JSON.stringify(body) });
    assert.equal(response.status,200);
    const rpc=await response.json();
    assert.equal(rpc.result.resultType,'complete');
    assert.deepEqual(rpc.result.supportedVersions,['2026-07-28']);
    assert.equal(rpc.result._meta['io.modelcontextprotocol/serverInfo'].name,'vigilume-bridge');

    const toolsBody={jsonrpc:'2.0',id:'tools',method:'tools/list',params:{_meta:{ 'io.modelcontextprotocol/protocolVersion':'2026-07-28', 'io.modelcontextprotocol/clientInfo':{name:'test-client',version:'1.0.0'}, 'io.modelcontextprotocol/clientCapabilities':{} }}};
    const toolsResponse=await fetch(`http://127.0.0.1:${port}/mcp`,{ method:'POST',headers:{authorization:`Bearer ${tokenData.token}`,'content-type':'application/json','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/list'},body:JSON.stringify(toolsBody) });
    assert.equal(toolsResponse.status,200);
    const toolsRpc=await toolsResponse.json();
    const names=new Set(toolsRpc.result.tools.map(x=>x.name));
    assert.equal(toolsRpc.result.tools.length,39);
    for(const name of ['chatgpt_queue_send','chatgpt_wait_until','chatgpt_diagnose','chatgpt_download_all_artifacts','task_create','task_acquire_best_worker','task_send','task_queue_send','task_recovery_plan']) assert.ok(names.has(name),name);
    assert.ok(!names.has('task_human_takeover'));
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve=>child.once('exit',resolve));
    await rm(home,{recursive:true,force:true});
  }
});
