import { classifyArtifactCandidate, mergeArtifacts } from '../core/artifacts.js';
import { splitComposerText } from '../core/composer.js';

const attached = new Set();
const telemetry = new Map();
const requests = new Map();
let eventListenerInstalled = false;
let onPulse = () => {};

function getTelemetry(tabId) {
  if (!telemetry.has(tabId)) telemetry.set(tabId, {
    debuggerAttached:false, debuggerDetached:false, activeRequests:0,
    lastNetworkActivityAt:0, lastRuntimeActivityAt:0, lastNavigationAt:0,
    networkArtifacts:[], detachReason:null
  });
  return telemetry.get(tabId);
}

async function command(tabId, method, params = {}) {
  return chrome.debugger.sendCommand({tabId}, method, params);
}

function maybeArtifactFromResponse(params) {
  const response = params?.response; if (!response?.url) return null;
  const headers = response.headers || {};
  const disposition = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-disposition')?.[1] || '';
  const filename = /filename\*?=(?:UTF-8''|"?)([^";]+)/i.exec(String(disposition))?.[1];
  return classifyArtifactCandidate({ href:response.url, filename, mime:response.mimeType, source:'cdp-network' });
}

export function initCdpEvents(callback) {
  onPulse = callback || (() => {});
  if (eventListenerInstalled) return;
  eventListenerInstalled = true;
  chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId; if (!Number.isInteger(tabId)) return;
    const t = getTelemetry(tabId), now = Date.now();
    if (method === 'Network.requestWillBeSent') {
      if (!requests.has(tabId)) requests.set(tabId, new Set());
      requests.get(tabId).add(params.requestId); t.activeRequests = requests.get(tabId).size; t.lastNetworkActivityAt = now;
    } else if (method === 'Network.dataReceived' || method === 'Network.webSocketFrameReceived') {
      t.lastNetworkActivityAt = now;
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      requests.get(tabId)?.delete(params.requestId); t.activeRequests = requests.get(tabId)?.size || 0; t.lastNetworkActivityAt = now;
    } else if (method === 'Network.responseReceived') {
      t.lastNetworkActivityAt = now;
      const artifact = maybeArtifactFromResponse(params);
      if (artifact) t.networkArtifacts = mergeArtifacts(t.networkArtifacts,[artifact]).slice(-64);
    } else if (method.startsWith('Runtime.')) t.lastRuntimeActivityAt = now;
    else if (method.startsWith('Page.')) t.lastNavigationAt = now;
    onPulse(tabId, method, structuredClone(t));
  });
  chrome.debugger.onDetach.addListener((source, reason) => {
    const tabId = source.tabId; if (!Number.isInteger(tabId)) return;
    attached.delete(tabId); const t = getTelemetry(tabId); t.debuggerAttached=false; t.debuggerDetached=true; t.detachReason=reason; t.activeRequests=0;
    onPulse(tabId, 'Debugger.detached', structuredClone(t));
  });
}

export async function attachDeepObserver(tabId) {
  if (attached.has(tabId)) return getTelemetry(tabId);
  const target = {tabId};
  await chrome.debugger.attach(target, '1.3');
  attached.add(tabId);
  const t=getTelemetry(tabId); t.debuggerAttached=true; t.debuggerDetached=false; t.detachReason=null;
  await Promise.all([
    command(tabId,'Network.enable',{maxTotalBufferSize:10_000_000,maxResourceBufferSize:2_000_000}),
    command(tabId,'Runtime.enable'), command(tabId,'Page.enable'), command(tabId,'Log.enable'), command(tabId,'Performance.enable')
  ]);
  await command(tabId,'Accessibility.enable').catch(()=>{});
  return structuredClone(t);
}

export async function detachDeepObserver(tabId) {
  if (!attached.has(tabId)) return;
  await chrome.debugger.detach({tabId}).catch(()=>{}); attached.delete(tabId);
}


export function markSubmission(tabId, at = Date.now()) { const t=getTelemetry(tabId); t.submittedAt=at; t.lastNetworkActivityAt=Math.max(t.lastNetworkActivityAt,at); }
export function clearSubmission(tabId) { const t=getTelemetry(tabId); t.submittedAt=0; }

export function readTelemetry(tabId) { return structuredClone(getTelemetry(tabId)); }
export function clearTelemetry(tabId) { attached.delete(tabId); telemetry.delete(tabId); requests.delete(tabId); }

async function focusComposer(tabId) {
  const expression = `(() => { const sels=['[data-testid="prompt-textarea"]','#prompt-textarea','[contenteditable="true"][data-lexical-editor="true"]']; const el=sels.map(s=>document.querySelector(s)).find(Boolean); if(!el) return false; el.focus(); if(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement){el.select();} else {const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);} return true; })()`;
  const result = await command(tabId,'Runtime.evaluate',{expression,returnByValue:true,userGesture:true});
  if (!result?.result?.value) throw new Error('Không thể focus composer ChatGPT.');
}

async function key(tabId, type, keyValue, code, modifiers = 0) {
  return command(tabId,'Input.dispatchKeyEvent',{type,key:keyValue,code,modifiers,windowsVirtualKeyCode:keyValue === 'Enter' ? 13 : undefined});
}

export async function deepCompose(tabId, text, {replace=true, submit=false} = {}) {
  await attachDeepObserver(tabId); await focusComposer(tabId);
  if (replace) {
    const isMac = /Mac/i.test(globalThis.navigator?.platform || '');
    const mod = isMac ? 4 : 2;
    await key(tabId,'rawKeyDown','a','KeyA',mod); await key(tabId,'keyUp','a','KeyA',mod);
    await key(tabId,'rawKeyDown','Backspace','Backspace'); await key(tabId,'keyUp','Backspace','Backspace');
  }
  for (const chunk of splitComposerText(String(text), 12_000)) await command(tabId,'Input.insertText',{text:chunk});
  if (submit) { await key(tabId,'rawKeyDown','Enter','Enter'); await key(tabId,'keyUp','Enter','Enter'); }
}

export async function deepClick(tabId, selectors, textPattern) {
  await attachDeepObserver(tabId);
  const selectorsJson = JSON.stringify(selectors || []), pattern = textPattern ? JSON.stringify(textPattern) : 'null';
  const expression = `(() => { const sels=${selectorsJson}; let el=sels.map(s=>document.querySelector(s)).find(e=>e); if(!el && ${pattern}) { const re=new RegExp(${pattern},'i'); el=[...document.querySelectorAll('button,[role="button"]')].find(e=>re.test((e.innerText||e.textContent||'').trim())); } if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}; })()`;
  const result=await command(tabId,'Runtime.evaluate',{expression,returnByValue:true,userGesture:true});
  const rect=result?.result?.value; if(!rect || rect.w<=0 || rect.h<=0) throw new Error('Không tìm thấy control ChatGPT để thao tác.');
  await command(tabId,'Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await command(tabId,'Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
}


export async function captureDeepDiagnostics(tabId) {
  await attachDeepObserver(tabId);
  const expression = `(() => {
    const visible = (el) => { if (!el || !el.isConnected) return false; const s=getComputedStyle(el); if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0') return false; const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
    const rows = (selector, limit=30) => [...document.querySelectorAll(selector)].filter(visible).slice(-limit).map(el => ({
      tag:el.tagName.toLowerCase(), role:el.getAttribute('role'), testId:el.getAttribute('data-testid'), ariaLabel:el.getAttribute('aria-label'),
      text:String(el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,220)
    }));
    const composerSelectors=['[data-testid="prompt-textarea"]','#prompt-textarea','[contenteditable="true"][data-lexical-editor="true"]'];
    const assistant='[data-testid^="conversation-turn-"][data-message-author-role="assistant"],[data-testid^="conversation-turn-"][data-turn="assistant"]';
    const composers=composerSelectors.flatMap(sel=>[...document.querySelectorAll(sel)]).filter(visible);
    const assistantTurns=[...document.querySelectorAll(assistant)].filter(visible);
    return {
      url:location.href,title:document.title,readyState:document.readyState,visibilityState:document.visibilityState,
      bodyTextChars:document.body?.innerText?.length||0,
      composer:{visibleCount:composers.length,textChars:composers.map(el=>String(el.textContent||'').length)},
      assistant:{visibleCount:assistantTurns.length,lastTextChars:assistantTurns.length?String(assistantTurns.at(-1).textContent||'').length:0},
      stopControls:rows('[data-testid="stop-button"],button[aria-label*="stop" i],button[data-testid*="stop" i]',8),
      completionControls:rows('button[data-testid="copy-turn-action-button"],button[aria-label*="copy" i]',12),
      status:rows('[role="status"],[data-testid*="thinking" i],[data-testid*="reasoning" i],[data-testid*="tool" i]',24),
      overlays:rows('[role="dialog"],[role="alert"]',16)
    };
  })()`;
  const [pageResult, metricsResult] = await Promise.all([
    command(tabId,'Runtime.evaluate',{expression,returnByValue:true,userGesture:false}),
    command(tabId,'Performance.getMetrics').catch(()=>({metrics:[]}))
  ]);
  const metrics = Object.fromEntries((metricsResult?.metrics || [])
    .filter((item) => ['Timestamp','Documents','Frames','JSEventListeners','Nodes','LayoutCount','RecalcStyleCount','TaskDuration','JSHeapUsedSize','JSHeapTotalSize'].includes(item.name))
    .map((item) => [item.name,item.value]));
  return { capturedAt:Date.now(), telemetry:readTelemetry(tabId), page:pageResult?.result?.value || null, metrics };
}
