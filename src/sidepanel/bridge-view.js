import { ui,esc,tr } from './model.js';
import { AGENT_SCOPES } from '../core/protocol.js';

export function bridgeHtml(){
  const bridge=ui.dashboard.bridge||{},scopes=ui.dashboard.settings?.agentScopes||[];
  return `<section class="bridge-card"><div class="setting-row"><div class="setting-copy"><strong>${esc(tr('bridge'))}</strong><span>${bridge.connected?esc(tr('connected')):esc(tr('disconnected'))}</span></div><button class="switch ${ui.dashboard.settings?.bridgeEnabled?'on':''}" data-action="toggle-bridge"></button></div><div class="bridge-endpoint">Native Messaging: com.nolane.sentinel_bridge<br>HTTP/MCP: 127.0.0.1:17892</div><div class="warning-note">Bridge mặc định tắt. Companion chỉ bind loopback và yêu cầu bearer token.</div></section><div class="section-head"><div><h2>Agent capability scopes</h2><p>Cấp quyền theo hành động, không có quyền tổng quát.</p></div></div><section class="bridge-card"><div class="scope-grid">${AGENT_SCOPES.map((scope)=>`<label class="scope"><input type="checkbox" data-scope="${esc(scope)}" ${scopes.includes(scope)?'checked':''}>${esc(scope)}</label>`).join('')}</div></section>`;
}
