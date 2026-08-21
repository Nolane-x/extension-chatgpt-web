function compactText(text, max) {
  const value = String(text || '').replace(/\u0000/g, '').trim();
  if (value.length <= max) return value;
  const head = Math.floor(max * 0.62), tail = max - head - 32;
  return `${value.slice(0, head)}\n…[đã rút gọn]…\n${value.slice(-tail)}`;
}

export function buildContextHandoff(context = {}, options = {}) {
  const maxChars = Math.max(2_000, options.maxChars || 60_000);
  const recentTurns = Math.max(1, options.recentTurns || 12);
  const turns = (context.turns || []).slice(-recentTurns).map((turn) => ({
    role: turn.role === 'assistant' ? 'assistant' : 'user', text: compactText(turn.text, options.maxPerTurn || 8_000)
  }));
  const artifacts = (context.artifacts || []).slice(-24).map((x) => ({ name: x.name, href: x.href, kind: x.kind, github: x.github }));
  const header = [
    'Đây là gói bàn giao ngữ cảnh từ một cuộc trò chuyện ChatGPT trước đã đạt giới hạn hoặc cần chuyển phiên.',
    'Hãy tiếp tục công việc dựa trên thông tin nhìn thấy bên dưới; không giả định có ngữ cảnh ẩn nào khác.',
    context.goal ? `Mục tiêu hiện tại: ${compactText(context.goal, 4_000)}` : null,
    context.title ? `Cuộc trò chuyện trước: ${compactText(context.title, 500)}` : null,
    ''
  ].filter((x) => x !== null).join('\n');
  const payload = JSON.stringify({ version: 1, sourceUrl: context.url || null, conversationId: context.conversationId || null, turns, artifacts }, null, 2);
  const suffix = '\n\n--- HẾT GÓI BÀN GIAO ---\n';
  const available = maxChars - header.length - suffix.length;
  const bounded = compactText(payload, Math.max(1_000, available));
  return `${header}${bounded}${suffix}`.slice(0, maxChars);
}
