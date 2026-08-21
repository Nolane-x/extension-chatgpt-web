import { SESSION_STATE } from './constants.js';

export function summarizeEvidence(session) {
  const state = session?.state || SESSION_STATE.DISCOVERED;
  const labels = {
    stop_control_visible: 'Nút dừng còn hiện', fresh_network_pulse: 'Mạng còn dữ liệu',
    fresh_status_pulse: 'Trạng thái còn đổi', fresh_answer_pulse: 'Nội dung còn đổi',
    completion_stable: 'Đáp án đã ổn định', connection_error_ui: 'Lỗi kết nối hiển thị',
    conversation_limit_ui: 'Giới hạn cuộc trò chuyện', visible_tool_activity: 'Công cụ đang hoạt động'
  };
  return {
    state,
    confidence: Math.max(0, Math.min(1, Number(session?.confidence ?? 0))),
    items: (session?.evidence || []).map((key) => ({ key, label: labels[key] || key })),
    retrySafe: ![SESSION_STATE.THINKING, SESSION_STATE.DEEP_THINKING, SESSION_STATE.STREAMING, SESSION_STATE.TOOL_RUNNING].includes(state)
  };
}
