const ACTIVE = new Set(['SUBMITTED','QUEUED','THINKING','DEEP_THINKING','STREAMING','TOOL_RUNNING','COMPLETING']);

export function assessSessionHealth(session = {}, telemetry = {}, now = Date.now(), thresholds = {}) {
  const staleMs = Math.max(10_000, Number(thresholds.staleMs || 120_000));
  const flags = [];
  if (session.state === 'DOM_DRIFT') flags.push('dom_drift');
  if (telemetry.debuggerDetached || session.deep?.error) flags.push('deep_detached');
  if (ACTIVE.has(session.state) && now - Number(session.lastSeenAt || 0) > staleMs) flags.push('observer_stale');
  if (session.state === 'DISCONNECTED') flags.push('surface_disconnected');
  if (session.state === 'FAILED') flags.push('turn_failed');
  let level = 'healthy';
  if (flags.some((x) => ['dom_drift','surface_disconnected'].includes(x))) level = 'critical';
  else if (flags.length) level = 'degraded';
  return {
    level,
    flags,
    deepAttached: Boolean(session.deep?.attached && telemetry.debuggerAttached !== false),
    lastSeenAgeMs: Math.max(0, now - Number(session.lastSeenAt || now)),
    lastProgressAgeMs: session.lastProgressAt ? Math.max(0, now - Number(session.lastProgressAt)) : null
  };
}

export function shouldAttemptDeepAttach(session = {}, now = Date.now(), cooldownMs = 30_000) {
  if (session.deep?.attached) return false;
  const last = Number(session.deep?.lastAttachAttemptAt || 0);
  return !last || now - last >= Math.max(5_000, cooldownMs);
}
