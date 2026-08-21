export const AGENT_SCOPES = Object.freeze([
  'observe','open','compose','send','stop','retry','download','context_read','context_delete','automation_write'
]);

export const ACTION_SCOPE = Object.freeze({
  listTabs:'observe', observe:'observe', diagnose:'observe', waitUntil:'observe', focusTab:'observe',
  openChat:'open', compose:'compose', send:'send', queueSend:'send', cancelQueued:'send', listQueue:'observe',
  stop:'stop', retry:'retry', continueNewChat:'send', listArtifacts:'observe', downloadArtifact:'download',
  downloadAllArtifacts:'download', getDownload:'download', getContext:'context_read', deleteContext:'context_delete',
  listAutomations:'observe', setAutomationEnabled:'automation_write', saveAutomation:'automation_write', deleteAutomation:'automation_write'
});

const ALIASES = Object.freeze({
  list_tabs:'listTabs', observe:'observe', diagnose:'diagnose', wait_until:'waitUntil', open:'openChat', focus:'focusTab',
  compose:'compose', send:'send', queue_send:'queueSend', list_queue:'listQueue', cancel_queued:'cancelQueued',
  stop:'stop', retry:'retry', continue_new_chat:'continueNewChat', list_artifacts:'listArtifacts',
  download_artifact:'downloadArtifact', download_all_artifacts:'downloadAllArtifacts', get_download:'getDownload',
  get_context:'getContext', delete_context:'deleteContext',
  'automation.list':'listAutomations', 'automation.set_enabled':'setAutomationEnabled', 'automation.save':'saveAutomation', 'automation.delete':'deleteAutomation'
});

export function validateAgentRequest(request, grantedScopes = []) {
  if (!request || typeof request !== 'object') throw new Error('Yêu cầu agent phải là object.');
  if (request.jsonrpc && request.jsonrpc !== '2.0') throw new Error('Chỉ hỗ trợ JSON-RPC 2.0.');
  const action = String(request.action || request.method || '').trim();
  const normalized = action.startsWith('chatgpt.') ? action.slice(8) : action.startsWith('automation.') ? action : action;
  const alias = ALIASES[normalized] || normalized;
  const requiredScope = ACTION_SCOPE[alias];
  if (!requiredScope) throw new Error(`Action không được hỗ trợ: ${action}`);
  if (!grantedScopes.includes(requiredScope)) throw new Error(`Thiếu quyền agent: ${requiredScope}`);
  return { action:alias, params:request.params || request.arguments || {}, requiredScope, id:request.id ?? null };
}

export const MCP_TOOLS = Object.freeze([
  ['chatgpt_list_tabs','Liệt kê mọi tab ChatGPT và trạng thái hợp nhất.',{},[]],
  ['chatgpt_observe','Đọc snapshot/timeline của một tab ChatGPT.',{tabId:{type:'integer'},includeContext:{type:'boolean'}},['tabId']],
  ['chatgpt_diagnose','Đọc chẩn đoán DOM/CDP/Network/Performance đã giới hạn, phục vụ phát hiện UI drift.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_wait_until','Chờ một tab đạt một trong các state mục tiêu (tối đa 25 giây mỗi call).',{tabId:{type:'integer'},states:{type:'array',items:{type:'string'}},timeoutMs:{type:'integer',minimum:0,maximum:25000}},['tabId','states']],
  ['chatgpt_open','Mở một ChatGPT Web mới.',{url:{type:'string'},active:{type:'boolean'}},[]],
  ['chatgpt_compose','Điền composer nhưng chưa gửi.',{tabId:{type:'integer'},text:{type:'string'},replace:{type:'boolean'}},['tabId','text']],
  ['chatgpt_send','Gửi văn bản vào ChatGPT sau khi state guard cho phép.',{tabId:{type:'integer'},text:{type:'string'},replace:{type:'boolean'}},['tabId','text']],
  ['chatgpt_queue_send','Xếp prompt bền vững; chỉ gửi khi phiên ở state an toàn, hoặc handoff khi chạm giới hạn chat.',{tabId:{type:'integer'},text:{type:'string'},expiresInMs:{type:'integer'},handoffOnLimit:{type:'boolean'}},['tabId','text']],
  ['chatgpt_list_queue','Liệt kê prompt đang chờ, có thể lọc theo tab.',{tabId:{type:'integer'}},[]],
  ['chatgpt_cancel_queued','Hủy một prompt đang chờ.',{queueId:{type:'string'}},['queueId']],
  ['chatgpt_stop','Dừng turn đang chạy.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_retry','Retry có guard/backoff cho turn lỗi.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_continue_new_chat','Mở chat mới, mang context đã lưu và tiếp tục.',{tabId:{type:'integer'},continuation:{type:'string'}},['tabId']],
  ['chatgpt_list_artifacts','Liệt kê file/GitHub artifact thật đã phát hiện.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_download_artifact','Tải artifact thật qua Chrome Downloads hoặc click fallback.',{tabId:{type:'integer'},artifactId:{type:'string'}},['tabId','artifactId']],
  ['chatgpt_download_all_artifacts','Tải tất cả file artifact có thể tải trong một phiên.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_get_download','Đọc trạng thái và đường dẫn cục bộ của download theo ID.',{downloadId:{type:'integer'}},['downloadId']],
  ['chatgpt_get_context','Đọc Context Vault của phiên.',{tabId:{type:'integer'}},['tabId']],
  ['chatgpt_delete_context','Xóa Context Vault theo phạm vi.',{tabId:{type:'integer'}},['tabId']],
  ['automation_list','Liệt kê automation rules.',{},[]],
  ['automation_set_enabled','Bật/tắt một automation rule.',{ruleId:{type:'string'},enabled:{type:'boolean'}},['ruleId','enabled']],
  ['automation_save','Tạo/cập nhật automation rule.',{rule:{type:'object'}},['rule']],
  ['automation_delete','Xóa automation rule.',{ruleId:{type:'string'}},['ruleId']]
].map(([name,description,properties,required]) => ({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}})));
