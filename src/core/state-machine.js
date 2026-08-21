import { DEFAULT_THRESHOLDS, SESSION_STATE } from './constants.js';

const clean = (value) => typeof value === 'string' ? value.trim() : '';
const newest = (...values) => Math.max(0, ...values.filter(Number.isFinite));

function nextDomHealth(snapshot, previous = {}, now = Date.now()) {
  const prior = previous.domHealth || {};
  const sawResponse = Boolean(prior.sawResponse || snapshot.responsePresent);
  const missingResponseSince = sawResponse && !snapshot.responsePresent
    ? (prior.missingResponseSince || now)
    : undefined;
  const emptyCompletion = Boolean(snapshot.responsePresent && !snapshot.generationRunning && !snapshot.stopVisible && !clean(snapshot.assistantText) && snapshot.completionActionVisible);
  const emptyCompletionSince = emptyCompletion ? (prior.emptyCompletionSince || now) : undefined;
  const missingCompletionAction = Boolean(snapshot.responsePresent && !snapshot.generationRunning && !snapshot.stopVisible && clean(snapshot.assistantText) && !snapshot.completionActionVisible);
  const missingCompletionText = missingCompletionAction ? clean(snapshot.assistantText) : undefined;
  const sameMissingText = prior.missingCompletionText === missingCompletionText;
  const missingCompletionActionSince = missingCompletionAction
    ? (sameMissingText ? (prior.missingCompletionActionSince || now) : now)
    : undefined;
  return { sawResponse, missingResponseSince, emptyCompletionSince, missingCompletionActionSince, missingCompletionText };
}

export function deriveSessionState(snapshot = {}, telemetry = {}, previous = {}, now = Date.now(), thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const text = clean(snapshot.assistantText);
  const priorText = clean(previous.lastAssistantText);
  const textChanged = text !== priorText;
  const textGrew = text.length > priorText.length && text.startsWith(priorText);
  const priorWasActive = [
    SESSION_STATE.SUBMITTED, SESSION_STATE.QUEUED, SESSION_STATE.THINKING, SESSION_STATE.DEEP_THINKING,
    SESSION_STATE.STREAMING, SESSION_STATE.TOOL_RUNNING, SESSION_STATE.COMPLETING
  ].includes(previous.state);
  const networkRelevant = Boolean(telemetry.submittedAt || priorWasActive);
  const progressAt = newest(
    snapshot.lastAssistantMutationAt,
    snapshot.lastStatusMutationAt,
    networkRelevant ? telemetry.lastNetworkActivityAt : 0,
    textChanged ? now : 0,
    previous.lastProgressAt
  );
  const activityAt = newest(snapshot.lastDomMutationAt, progressAt, telemetry.lastRuntimeActivityAt, previous.lastActivityAt);
  const evidence = [];
  const domHealth = nextDomHealth(snapshot, previous, now);
  const result = (state, confidence, reason, extra = {}) => ({
    state, confidence, reason, evidence,
    lastActivityAt: activityAt || previous.lastActivityAt || now,
    lastProgressAt: progressAt || previous.lastProgressAt || 0,
    lastAssistantText: text,
    phaseStartedAt: previous.state === state ? previous.phaseStartedAt ?? now : now,
    completionCandidate: undefined,
    domHealth,
    ...extra
  });

  if (telemetry.debuggerDetached && !snapshot.composerPresent) {
    evidence.push('debugger_detached', 'composer_absent');
    return result(SESSION_STATE.DISCONNECTED, 0.96, 'Mất kết nối với bề mặt ChatGPT.');
  }
  if (snapshot.conversationLimit) {
    evidence.push('conversation_limit_ui');
    return result(SESSION_STATE.CONVERSATION_LIMIT, 0.99, 'ChatGPT báo giới hạn cuộc trò chuyện/ngữ cảnh.');
  }
  if (snapshot.rateLimited) {
    evidence.push('rate_limit_ui');
    return result(SESSION_STATE.RATE_LIMITED, 0.99, 'ChatGPT báo giới hạn tốc độ/sử dụng.');
  }
  if (snapshot.connectionLost) {
    evidence.push('connection_error_ui');
    return result(SESSION_STATE.CONNECTION_LOST, 0.98, 'ChatGPT hiển thị lỗi kết nối hoặc yêu cầu thử lại.');
  }
  if (snapshot.terminalError) {
    evidence.push('terminal_error_ui');
    return result(SESSION_STATE.FAILED, 0.98, 'Turn kết thúc bằng lỗi giao diện.');
  }
  if (snapshot.waitingUser) {
    evidence.push('approval_or_user_input_required');
    return result(SESSION_STATE.WAITING_USER, 0.97, 'ChatGPT đang chờ con người xác nhận hoặc cung cấp đầu vào.');
  }

  const networkSupportsActiveTurn = telemetry.activeRequests > 0 && networkRelevant;
  const running = Boolean(snapshot.generationRunning || snapshot.stopVisible || networkSupportsActiveTurn);
  const hasTool = Array.isArray(snapshot.toolActivities) && snapshot.toolActivities.some((item) => item?.active !== false);
  if (hasTool && running) {
    evidence.push('visible_tool_activity');
    if (snapshot.stopVisible) evidence.push('stop_control_visible');
    return result(SESSION_STATE.TOOL_RUNNING, 0.96, 'Có hoạt động công cụ nhìn thấy trong turn đang chạy.');
  }

  if (domHealth.missingResponseSince && now - domHealth.missingResponseSince >= t.responseDomGraceMs) {
    evidence.push('response_dom_disappeared');
    return result(SESSION_STATE.DOM_DRIFT, 0.94, 'Response DOM đã từng tồn tại nhưng biến mất quá thời gian grace; có thể ChatGPT đã đổi UI.');
  }
  if (domHealth.emptyCompletionSince && now - domHealth.emptyCompletionSince >= t.emptyCompletionGraceMs) {
    evidence.push('empty_completion_surface');
    return result(SESSION_STATE.DOM_DRIFT, 0.92, 'Bề mặt hoàn thành xuất hiện nhưng không có nội dung assistant; DOM có thể đã thay đổi.');
  }
  if (domHealth.missingCompletionActionSince && now - domHealth.missingCompletionActionSince >= t.completionActionGraceMs) {
    evidence.push('completion_action_missing');
    return result(SESSION_STATE.DOM_DRIFT, 0.9, 'Generation đã dừng và có đáp án nhưng completion action không xuất hiện trong grace period.');
  }

  const completionReady = Boolean(snapshot.responsePresent && !running && text && snapshot.completionActionVisible);
  if (completionReady) {
    evidence.push('response_present', 'generation_not_running', 'non_empty_answer', 'completion_action_visible');
    const signature = `${text}\0${snapshot.responseHtml || text}`;
    const candidate = previous.completionCandidate?.signature === signature
      ? previous.completionCandidate
      : { signature, since: now };
    if (now - candidate.since >= t.completionSettleMs) {
      evidence.push('completion_stable');
      return result(SESSION_STATE.COMPLETED, 0.995, 'Đáp án hoàn chỉnh và ổn định.', { completionCandidate: candidate });
    }
    return result(SESSION_STATE.COMPLETING, 0.91, 'Đang chờ đáp án ổn định trước khi xác nhận hoàn thành.', { completionCandidate: candidate });
  }

  const freshNetwork = networkRelevant && now - (telemetry.lastNetworkActivityAt || 0) <= t.networkFreshMs;
  const freshStatus = now - (snapshot.lastStatusMutationAt || 0) <= t.statusFreshMs;
  const freshText = textChanged || now - (snapshot.lastAssistantMutationAt || 0) <= t.streamingFreshMs;

  if (running) {
    if (snapshot.stopVisible) evidence.push('stop_control_visible');
    if (freshNetwork) evidence.push('fresh_network_pulse');
    if (freshStatus) evidence.push('fresh_status_pulse');
    if (freshText) evidence.push('fresh_answer_pulse');
    if (textGrew || (text && freshText)) return result(SESSION_STATE.STREAMING, 0.95, 'Nội dung assistant đang tăng/đổi.');
    const quietFor = Math.max(0, now - (progressAt || telemetry.submittedAt || previous.lastProgressAt || previous.lastActivityAt || activityAt));
    const freshProgress = freshNetwork || freshStatus || freshText;
    if (snapshot.stopVisible && !freshProgress && quietFor >= t.deepThinkingMs) {
      evidence.push('long_quiet_with_stop_control');
      return result(SESSION_STATE.DEEP_THINKING, 0.9, 'Im lặng kéo dài nhưng vẫn còn control của generation; không được retry.');
    }
    if (snapshot.stopVisible || freshProgress) return result(SESSION_STATE.THINKING, 0.94, 'Turn còn bằng chứng sống dù chưa có thêm nội dung.');
    if (quietFor >= t.stallMs) {
      evidence.push('liveness_timeout');
      return result(SESSION_STATE.STALLED, 0.82, 'Không còn bằng chứng tiến triển trong ngưỡng stall.');
    }
    return result(SESSION_STATE.THINKING, 0.82, 'Turn đang chạy, chưa đủ bằng chứng để coi là stall.');
  }

  if (telemetry.submittedAt && !snapshot.responsePresent) {
    evidence.push('submission_recorded');
    const quietFor = now - telemetry.submittedAt;
    if (quietFor >= t.stallMs) return result(SESSION_STATE.STALLED, 0.78, 'Đã gửi nhưng không xuất hiện response trong ngưỡng stall.');
    return result(SESSION_STATE.QUEUED, 0.8, 'Đã gửi và đang chờ response bắt đầu.');
  }
  if (snapshot.composerText?.trim()) {
    evidence.push('composer_has_text');
    return result(SESSION_STATE.COMPOSING, 0.97, 'Composer đang có nội dung chưa gửi.');
  }
  if (snapshot.composerPresent) {
    evidence.push('composer_visible');
    return result(SESSION_STATE.IDLE, 0.96, 'ChatGPT sẵn sàng nhận lệnh mới.');
  }
  evidence.push('surface_incomplete');
  return result(SESSION_STATE.DISCOVERED, 0.55, 'Đã phát hiện tab nhưng bề mặt ChatGPT chưa ổn định.');
}

export function mayRetrySession(session) {
  return [SESSION_STATE.CONNECTION_LOST, SESSION_STATE.FAILED, SESSION_STATE.STALLED].includes(session?.state)
    && !session?.evidence?.some((entry) => ['stop_control_visible','fresh_network_pulse','fresh_status_pulse','fresh_answer_pulse'].includes(entry));
}
