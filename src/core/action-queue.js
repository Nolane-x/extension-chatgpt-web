const SAFE_SEND_STATES = new Set(['IDLE','COMPLETED']);

export function normalizeQueuedAction(value = {}, now = Date.now()) {
  const createdAt = Number(value.createdAt) || now;
  const expiresAt = Number(value.expiresAt) || (createdAt + 24 * 60 * 60 * 1000);
  return {
    id: String(value.id || ''),
    tabId: Number(value.tabId),
    type: value.type === 'send' ? 'send' : 'send',
    text: String(value.text || '').trim(),
    createdAt,
    expiresAt,
    status: value.status === 'scheduled' ? 'scheduled' : 'queued',
    source: String(value.source || 'user'),
    handoffOnLimit: value.handoffOnLimit !== false
  };
}

export function evaluateQueuedActions(session = {}, actions = [], now = Date.now(), options = {}) {
  const ready = [], deferred = [], expired = [], handoff = [];
  for (const raw of actions) {
    const action = normalizeQueuedAction(raw, now);
    if (!action.id || !Number.isInteger(action.tabId) || !action.text) continue;
    if (action.tabId !== session.tabId) { deferred.push(action); continue; }
    if (action.expiresAt <= now) { expired.push(action); continue; }
    if (action.status === 'scheduled') { deferred.push(action); continue; }
    if (SAFE_SEND_STATES.has(session.state)) { ready.push(action); continue; }
    if (session.state === 'CONVERSATION_LIMIT' && options.handoffEnabled && action.handoffOnLimit) { handoff.push(action); continue; }
    deferred.push(action);
  }
  return { ready, deferred, expired, handoff };
}

export const QUEUE_SAFE_STATES = Object.freeze([...SAFE_SEND_STATES]);
