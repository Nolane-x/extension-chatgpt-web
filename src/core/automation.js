export function nextRetryDelay(attempt, options = {}) {
  const baseMs = Math.max(1_000, options.baseMs || 8_000);
  const maxMs = Math.max(baseMs, options.maxMs || 120_000);
  const jitter = Math.max(0, Math.min(0.5, options.jitter ?? 0));
  const raw = Math.min(maxMs, baseMs * (2 ** Math.max(0, attempt)));
  return Math.round(raw * (1 + jitter));
}

export function automationDueAt(rule={},now=Date.now()) {
  if(!rule?.enabled||rule.trigger!=='time'||!rule.id||!rule.action?.type)return null;
  const runAt=Number(rule.runAt);if(!Number.isFinite(runAt)||runAt<=0)return null;
  const runCount=Number(rule.runCount||0);
  if(Number.isFinite(rule.maxRuns)&&runCount>=Number(rule.maxRuns))return null;
  if(Number(rule.lastRunAt||0)>=runAt)return null;
  if(rule.action.type==='send'&&!String(rule.action.text||'').trim())return null;
  if(!Number.isInteger(Number(rule.tabId))||Number(rule.tabId)<=0)return null;
  return runAt<=now?now+50:runAt;
}

export function evaluateAutomationRules(session, rules = [], now = Date.now()) {
  const actions = [];
  for (const rule of rules) {
    if (!rule?.enabled || !rule.id || !rule.action?.type) continue;
    if (rule.trigger !== 'state') continue;
    if (rule.whenState !== session.state) continue;
    if (rule.tabId != null && rule.tabId !== session.tabId) continue;
    if (rule.conversationId && rule.conversationId !== session.conversationId) continue;
    const runCount = Number(rule.runCount || 0);
    if (Number.isFinite(rule.maxRuns) && runCount >= rule.maxRuns) continue;
    const cooldownMs = Math.max(0, Number(rule.cooldownMs || 0));
    if (rule.lastRunAt && now - rule.lastRunAt < cooldownMs) continue;
    if (rule.requireConfidence && Number(session.confidence || 0) < Number(rule.requireConfidence)) continue;
    if (rule.action.type === 'send' && !String(rule.action.text || '').trim()) continue;
    actions.push({ ruleId: rule.id, tabId: session.tabId, action: rule.action, scheduledAt: now + Math.max(0, Number(rule.delayMs || 0)) });
  }
  return actions;
}
