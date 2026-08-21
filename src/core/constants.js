export const SESSION_STATE = Object.freeze({
  DISCOVERED: 'DISCOVERED', IDLE: 'IDLE', COMPOSING: 'COMPOSING', SUBMITTED: 'SUBMITTED',
  QUEUED: 'QUEUED', THINKING: 'THINKING', DEEP_THINKING: 'DEEP_THINKING', STREAMING: 'STREAMING',
  TOOL_RUNNING: 'TOOL_RUNNING', WAITING_USER: 'WAITING_USER', COMPLETING: 'COMPLETING',
  COMPLETED: 'COMPLETED', CONNECTION_LOST: 'CONNECTION_LOST', RETRY_WAIT: 'RETRY_WAIT',
  RATE_LIMITED: 'RATE_LIMITED', CONVERSATION_LIMIT: 'CONVERSATION_LIMIT', STALLED: 'STALLED',
  FAILED: 'FAILED', CANCELLED: 'CANCELLED', DOM_DRIFT: 'DOM_DRIFT', DISCONNECTED: 'DISCONNECTED'
});

export const DEFAULT_THRESHOLDS = Object.freeze({
  completionSettleMs: 2_000,
  streamingFreshMs: 4_000,
  networkFreshMs: 8_000,
  statusFreshMs: 12_000,
  deepThinkingMs: 45_000,
  stallMs: 90_000,
  connectionRetryQuietMs: 10_000,
  responseDomGraceMs: 60_000,
  emptyCompletionGraceMs: 10_000,
  completionActionGraceMs: 60_000
});

export const CHATGPT_ORIGINS = Object.freeze(['https://chatgpt.com']);

export const FILE_EXTENSIONS = Object.freeze([
  'zip','7z','rar','tar','gz','tgz','bz2','xz',
  'pdf','doc','docx','xls','xlsx','ppt','pptx','csv','tsv',
  'json','jsonl','yaml','yml','xml','md','txt','log','html','css',
  'js','mjs','cjs','ts','tsx','jsx','py','rs','go','java','kt','swift','c','h','cpp','hpp','cs','sh','ps1',
  'png','jpg','jpeg','gif','webp','svg','avif','mp3','wav','mp4','webm',
  'sqlite','db','bin','wasm'
]);
