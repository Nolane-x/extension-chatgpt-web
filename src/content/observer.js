(() => {
  const MAX_TURN_CHARS = 12_000;
  const MAX_TURNS = 16;
  const MAX_ARTIFACTS = 64;
  const COMPOSER_SELECTORS = ['[data-testid="prompt-textarea"]','#prompt-textarea','[contenteditable="true"][data-lexical-editor="true"]'];
  const ASSISTANT_SELECTORS = ['[data-testid^="conversation-turn-"][data-message-author-role="assistant"]','[data-testid^="conversation-turn-"][data-turn="assistant"]','[data-testid^="conversation-turn-"]:has([data-message-author-role="assistant"])'];
  const USER_SELECTORS = ['[data-testid^="conversation-turn-"][data-message-author-role="user"]','[data-testid^="conversation-turn-"][data-turn="user"]','[data-testid^="conversation-turn-"]:has([data-message-author-role="user"])'];
  const STATUS_SELECTOR = '[role="status"],[data-testid*="thinking" i],[data-testid*="reasoning" i],[data-testid*="tool" i],[data-testid*="research" i],[data-testid*="progress" i]';
  const TOOL_SELECTOR = '[data-testid*="tool" i],[data-testid*="connector" i],[data-testid*="plugin" i],[data-testid*="app-card" i]';
  const ALERT_SELECTOR = '[role="alert"],[role="dialog"],[data-testid*="error" i]';
  const STOP_SELECTORS = ['[data-testid="stop-button"]','button[aria-label*="stop" i]','button[data-testid*="stop" i]'];
  const COMPLETION_SELECTORS = ['button[data-testid="copy-turn-action-button"]','button[aria-label*="copy" i]'];
  const RETRY_WORDS = /^(try again|retry|regenerate|thử lại|tạo lại|kết nối lại|reconnect)$/i;
  const STOP_WORDS = /^(stop|stop generating|dừng|dừng tạo)$/i;
  const CONNECTION_RE = /(network error|connection (?:lost|interrupted)|disconnected|failed to fetch|reconnect|try again|something went wrong|mất kết nối|lỗi mạng|kết nối bị gián đoạn|thử lại)/i;
  const RATE_RE = /(too many requests|rate limit|usage limit|limit resets|you(?:'|’)ve reached (?:the )?(?:message|usage|rate) limit|giới hạn tốc độ|giới hạn sử dụng|đặt lại giới hạn)/i;
  const CONVERSATION_RE = /(maximum (?:length|context).*(?:conversation|chat)|conversation.*(?:too long|maximum length|context limit)|start a new chat to continue|continue in a new chat|reached.*context.*limit|cuộc trò chuyện.*(?:quá dài|giới hạn ngữ cảnh|đạt giới hạn)|bắt đầu.*cuộc trò chuyện mới.*tiếp tục)/i;
  const TERMINAL_RE = /(there was an error generating a response|failed to generate|something went wrong.*help\.openai\.com|đã xảy ra lỗi khi tạo phản hồi)/i;
  const ACTIVE_STATUS_RE = /(thinking|searching|researching|reading|browsing|analyzing|working|running|generating|looking up|using .+ tool|đang suy nghĩ|đang tìm|đang nghiên cứu|đang đọc|đang phân tích|đang làm|đang chạy|đang tạo)/i;
  const FILE_RE = /\.(zip|7z|rar|tar|gz|tgz|bz2|xz|pdf|docx?|xlsx?|pptx?|csv|tsv|jsonl?|ya?ml|xml|md|txt|log|html|css|m?js|cjs|tsx?|jsx|py|rs|go|java|kt|swift|cpp|hpp|cs|sh|ps1|png|jpe?g|gif|webp|svg|avif|mp3|wav|mp4|webm|sqlite|db|bin|wasm)(?:$|[?#\s])/i;

  let lastDomMutationAt = Date.now();
  let lastAssistantMutationAt = 0;
  let lastStatusMutationAt = 0;
  let lastAssistantText = '';
  let lastStatusHash = '';
  let lastSentHash = '';
  let debounceTimer;

  const visible = (el) => {
    if (!(el instanceof Element) || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const textOf = (el, max = MAX_TURN_CHARS) => String(el?.innerText || el?.textContent || '').replace(/\u0000/g,'').trim().slice(0,max);
  const firstVisible = (selectors) => {
    for (const selector of selectors) for (const el of document.querySelectorAll(selector)) if (visible(el)) return el;
    return null;
  };
  const allVisible = (selector, limit = 50) => [...document.querySelectorAll(selector)].filter(visible).slice(-limit);
  const conversationId = () => location.pathname.match(/^\/c\/([^/?#]+)/)?.[1] || null;

  function collectTurns() {
    const rows = [];
    for (const selector of USER_SELECTORS) {
      for (const el of document.querySelectorAll(selector)) rows.push({ el, role:'user' });
      if (rows.length) break;
    }
    const assistants = [];
    for (const selector of ASSISTANT_SELECTORS) {
      for (const el of document.querySelectorAll(selector)) assistants.push({ el, role:'assistant' });
      if (assistants.length) break;
    }
    rows.push(...assistants);
    return rows
      .filter((item) => visible(item.el))
      .sort((a,b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
      .slice(-MAX_TURNS)
      .map(({el,role}) => ({ role, text:textOf(el), testId:el.getAttribute('data-testid') }));
  }

  function collectArtifacts() {
    const out = [];
    const seen = new Set();
    const add = (candidate) => {
      const key = `${candidate.href || ''}\0${candidate.download || ''}\0${candidate.text || ''}`;
      if (seen.has(key) || out.length >= MAX_ARTIFACTS) return;
      seen.add(key); out.push(candidate);
    };
    for (const a of allVisible('a[href]', 160)) {
      const href = a.href || a.getAttribute('href') || '';
      const text = textOf(a, 500);
      const download = a.getAttribute('download') || '';
      if (download || FILE_RE.test(href) || FILE_RE.test(text) || /^https:\/\/github\.com\//i.test(href)) {
        add({ href, text, download, clickable:true, source:'dom-anchor' });
      }
    }
    for (const el of allVisible('button,[role="button"]', 160)) {
      const text = textOf(el, 500);
      if (FILE_RE.test(text)) add({ href:null, text, download:'', clickable:true, source:'dom-file-control' });
    }
    return out;
  }

  function collectToolActivities() {
    const rows = allVisible(TOOL_SELECTOR, 40)
      .map((el) => textOf(el, 1200))
      .filter((text) => text && !/^(thinking|reasoning|answer now|đang suy nghĩ)$/i.test(text));
    const unique = [...new Set(rows)].slice(-16);
    return unique.map((text) => ({ name: /github/i.test(text) ? 'GitHub' : 'ChatGPT tool', text, active:true }));
  }

  function detectWaitingUser() {
    for (const dialog of allVisible('[role="dialog"],[data-testid*="approval" i]', 12)) {
      const text = textOf(dialog, 2400);
      if (/(allow chatgpt|allow once|deny|approve|approval|required|confirm|cho phép|từ chối|xác nhận)/i.test(text)) return true;
    }
    return false;
  }

  function collectSnapshot() {
    const composer = firstVisible(COMPOSER_SELECTORS);
    const turns = collectTurns();
    const assistantTurns = turns.filter((x) => x.role === 'assistant');
    const assistantText = assistantTurns.at(-1)?.text || '';
    if (assistantText !== lastAssistantText) { lastAssistantText = assistantText; lastAssistantMutationAt = Date.now(); }
    const statusTexts = allVisible(STATUS_SELECTOR, 32).map((el) => textOf(el, 1000)).filter(Boolean);
    const statusHash = statusTexts.join('\u241e');
    if (statusHash !== lastStatusHash) { lastStatusHash = statusHash; lastStatusMutationAt = Date.now(); }
    const alerts = allVisible(ALERT_SELECTOR, 24).map((el) => textOf(el, 2500)).filter(Boolean);
    const nearSurface = `${alerts.join('\n')}\n${statusTexts.join('\n')}\n${assistantText.slice(-6000)}`;
    const stop = firstVisible(STOP_SELECTORS) || allVisible('button,[role="button"]',100).find((el) => STOP_WORDS.test(textOf(el,120)));
    const lastAssistantEl = (() => {
      for (const selector of ASSISTANT_SELECTORS) {
        const list = [...document.querySelectorAll(selector)].filter(visible);
        if (list.length) return list.at(-1);
      }
      return null;
    })();
    const completion = lastAssistantEl ? COMPLETION_SELECTORS.some((sel) => [...lastAssistantEl.querySelectorAll(sel)].some(visible)) : false;
    return {
      version: 1,
      capturedAt: Date.now(),
      url: location.href,
      title: document.title,
      conversationId: conversationId(),
      composerPresent: Boolean(composer),
      composerText: textOf(composer, 20_000),
      responsePresent: Boolean(lastAssistantEl),
      assistantText,
      responseHtml: String(lastAssistantEl?.innerHTML || '').slice(-40_000),
      userTurnCount: turns.filter((x) => x.role === 'user').length,
      assistantTurnCount: assistantTurns.length,
      turns,
      stopVisible: Boolean(stop),
      generationRunning: Boolean(stop || (!completion && statusTexts.some((text) => ACTIVE_STATUS_RE.test(text)))),
      completionActionVisible: completion,
      statusTexts: statusTexts.slice(-16),
      toolActivities: collectToolActivities(),
      waitingUser: detectWaitingUser(),
      connectionLost: CONNECTION_RE.test(nearSurface) && !RATE_RE.test(nearSurface) && !CONVERSATION_RE.test(nearSurface),
      rateLimited: RATE_RE.test(nearSurface),
      conversationLimit: CONVERSATION_RE.test(nearSurface),
      terminalError: TERMINAL_RE.test(nearSurface),
      artifacts: collectArtifacts(),
      lastDomMutationAt,
      lastAssistantMutationAt,
      lastStatusMutationAt
    };
  }

  function emit(force = false) {
    const snapshot = collectSnapshot();
    const hash = JSON.stringify({
      url:snapshot.url, conversationId:snapshot.conversationId, composerText:snapshot.composerText,
      assistantText:snapshot.assistantText, stopVisible:snapshot.stopVisible, completionActionVisible:snapshot.completionActionVisible,
      statusTexts:snapshot.statusTexts, waitingUser:snapshot.waitingUser, connectionLost:snapshot.connectionLost,
      rateLimited:snapshot.rateLimited, conversationLimit:snapshot.conversationLimit, terminalError:snapshot.terminalError,
      artifacts:snapshot.artifacts
    });
    if (!force && hash === lastSentHash) return;
    lastSentHash = hash;
    chrome.runtime.sendMessage({ type:'sentinel.snapshot', snapshot }).catch(() => {});
  }

  function scheduleEmit() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => emit(false), 220);
  }

  const observer = new MutationObserver((mutations) => {
    lastDomMutationAt = Date.now();
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      if (target?.closest?.(STATUS_SELECTOR)) lastStatusMutationAt = Date.now();
      if (target && ASSISTANT_SELECTORS.some((sel) => target.matches?.(sel) || target.closest?.(sel))) lastAssistantMutationAt = Date.now();
    }
    scheduleEmit();
  });
  observer.observe(document.documentElement, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['aria-label','aria-disabled','data-state','href','download'] });

  function findSemanticButton(words) {
    return allVisible('button,[role="button"]', 140).find((el) => words.test(textOf(el, 180)));
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'sentinel.ping') { sendResponse({ok:true,url:location.href,composer:Boolean(firstVisible(COMPOSER_SELECTORS))}); return; }
    if (message.type === 'sentinel.requestSnapshot') { sendResponse({ok:true,snapshot:collectSnapshot()}); return; }
    if (message.type === 'sentinel.command') {
      try {
        if (message.command === 'stop') {
          const el = firstVisible(STOP_SELECTORS) || findSemanticButton(STOP_WORDS); if (!el) throw new Error('Không tìm thấy control dừng.'); el.click();
        } else if (message.command === 'retry') {
          const el = findSemanticButton(RETRY_WORDS); if (!el) throw new Error('Không tìm thấy control retry.'); el.click();
        } else if (message.command === 'clickArtifact') {
          const { href, name } = message.params || {};
          const anchor = href ? [...document.querySelectorAll('a[href]')].find((a) => a.href === href) : null;
          const button = !anchor && name ? allVisible('button,[role="button"],a',180).find((el) => textOf(el,500).includes(name)) : null;
          const target = anchor || button; if (!target) throw new Error('Artifact không còn tồn tại trong DOM.'); target.click();
        } else if (message.command === 'focusComposer') {
          const el = firstVisible(COMPOSER_SELECTORS); if (!el) throw new Error('Không tìm thấy composer.'); el.focus();
        } else throw new Error('Command content không hỗ trợ.');
        sendResponse({ok:true});
      } catch (error) { sendResponse({ok:false,error:error.message}); }
      return true;
    }
  });

  addEventListener('popstate', () => setTimeout(() => emit(true), 50));
  addEventListener('focus', () => emit(true));
  emit(true);
})();
