/* User-triggered page tools; evidence grades stay explicit. MIT. */
(() => {
  'use strict';
  if (globalThis.CFPageToolsInstalled) return;
  globalThis.CFPageToolsInstalled = true;
  const C = globalThis.TLCore, K = globalThis.CFToolkit, api = chrome;
  const S = globalThis.TLPageScope;
  let live = null;
  const n = (tag, text, attrs = {}) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  const canonical = () => C.chatUrl(location.href).url;
  const scope = () => S.current();
  function current(session) {
    try {
      return live === session && !session.closed && canonical() === session.url &&
        (!session.lease || S.unchanged(session.lease, false));
    } catch { return false; }
  }
  function ensure(session) { C.check(current(session), 'TOOLS_SOURCE_CHANGED'); }
  function close() {
    const session = live;
    if (!session) return;
    session.closed = true; session.jump += 1;
    session.controller?.abort(); session.navigationController?.abort();
    clearInterval(session.routeWatch);
    session.host.remove(); session.restoreFocus?.focus?.(); live = null;
  }
  function nodes(sc = scope()) {
    if (!sc.root) return [];
    const found = sc.root.querySelectorAll('[data-message-author-role],article[data-turn-key],[data-message-id]');
    C.check(found.length <= 4096, 'TOOLS_DOM_SCAN_LIMIT');
    return [...found].filter(el => S.contains(sc, el) && !el.closest('#chatflow-page-tools'));
  }
  function messageRole(el) {
    return el.getAttribute('data-message-author-role') || el.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
  }
  function resolve(session, message, sc) {
    if (!sc.root || sc.status === 'ambiguous') return null;
    if (message.domNode?.isConnected && message.idKnown === false && S.contains(sc, message.domNode)) {
      if (message.observedLease && !S.unchanged(message.observedLease)) return null;
      const text = message.domNode.innerText || message.domNode.textContent || '';
      if (message.text != null && text !== message.text) return null;
      return { el: message.domNode, confidence: 'observed_dom_node' };
    }
    const ids = new Set([message.id, message.nodeId].filter(Boolean));
    const found = nodes(sc).filter(el => (!message.role || messageRole(el) === message.role) &&
      K.getDomMessageIdCandidates(el).some(id => ids.has(id)));
    const inner = found.filter(el => !found.some(other => other !== el && el.contains(other)));
    if (inner.length !== 1) return null;
    return { el: inner[0], confidence: sc.status === 'confirmed' ? 'verified_message_id' : 'observed_dom_node' };
  }
  function scroller(el) {
    for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (/auto|scroll/.test(css.overflowY) && node.scrollHeight > node.clientHeight + 10) return node;
    }
    return document.scrollingElement;
  }
  async function jump(session, message) {
    const token = ++session.jump, initial = scope();
    if (!initial.root || initial.status === 'ambiguous') {
      session.status.textContent = '当前对话的页面范围无法确认，已停止定位。'; return false;
    }
    const lease = S.freeze?.();
    session.status.textContent = '正在定位原消息…';
    const byId = new Map();
    session.messages.forEach((item, index) => { byId.set(item.id, index); if (item.nodeId) byId.set(item.nodeId, index); });
    let cancelled = false;
    const cancel = () => { cancelled = true; };
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    for (const event of events) window.addEventListener(event, cancel, { capture: true, passive: true });
    const started = performance.now();
    try {
      for (let attempt = 0; attempt < 24 && performance.now() - started < 8000; attempt += 1) {
        ensure(session);
        if (token !== session.jump || cancelled) {
          if (current(session) && token === session.jump) session.status.textContent = '已取消定位。';
          return false;
        }
        const sc = scope();
        if (sc.root !== initial.root || sc.status === 'ambiguous' || (lease && !S.unchanged(lease))) {
          session.status.textContent = '对话内容容器已变化，已停止定位。'; return false;
        }
        const exact = resolve(session, message, sc);
        if (exact) {
          exact.el.scrollIntoView({ block: 'center', behavior: 'instant' });
          if (token !== session.jump || cancelled || !S.contains(scope(), exact.el)) return false;
          session.status.textContent = exact.confidence === 'verified_message_id' ? '已按消息身份定位。' :
            '仅定位到本次读取的页面节点；原消息身份尚未核验。';
          return true;
        }
        const mounted = nodes(sc).map(el => ({ el, index: K.getDomMessageIdCandidates(el).map(id => byId.get(id)).find(i => i !== undefined) }))
          .filter(item => item.index !== undefined);
        const target = session.messages.indexOf(message);
        if (!mounted.length) break;
        const nearest = mounted.reduce((a, b) => Math.abs(a.index - target) <= Math.abs(b.index - target) ? a : b);
        const box = scroller(nearest.el);
        if (!box || box.clientHeight < 1) break;
        let orientation = 1;
        const first = mounted[0], other = mounted.find(item => item.index !== first.index &&
          Math.abs(item.el.getBoundingClientRect().top - first.el.getBoundingClientRect().top) > 2);
        if (other) orientation = Math.sign((other.index - first.index) * (other.el.getBoundingClientRect().top - first.el.getBoundingClientRect().top));
        box.scrollBy({ top: Math.sign(target - nearest.index) * orientation * Math.max(120, box.clientHeight * 0.85), behavior: 'instant' });
        await new Promise(resolve => setTimeout(resolve, 240));
      }
      if (current(session) && token === session.jump) session.status.textContent = '页面未挂载目标消息；未跳转到相似文本。可手动滚动后重试。';
      return false;
    } finally { for (const event of events) window.removeEventListener(event, cancel, true); }
  }
  async function json(session, path, request) {
    ensure(session); C.check(session.request === request, 'TOOLS_REQUEST_SUPERSEDED');
    const url = globalThis.ChatFlowProviders.get('chatgpt').readEndpoint(path, C.chatUrl(session.url));
    const response = await fetch(url, { method: 'GET', credentials: 'include', redirect: 'error',
      headers: request.token ? { Authorization: 'Bearer ' + request.token } : {}, cache: 'no-store', signal: request.controller.signal });
    C.check(response.ok, 'TOOLS_HTTP_' + response.status);
    C.check(response.body, 'TOOLS_RESPONSE_MISSING');
    const reader = response.body.getReader(), parts = []; let size = 0;
    try {
      while (true) {
        ensure(session); const result = await reader.read(); ensure(session);
        if (result.done) break;
        size += result.value.length; C.check(size <= 8 * 1024 ** 2, 'TOOLS_RESPONSE_LIMIT'); parts.push(result.value);
      }
    } catch (error) { try { await reader.cancel(); } catch { /* original failure retained */ } throw error; }
    finally { reader.releaseLock(); }
    ensure(session); C.check(session.request === request, 'TOOLS_REQUEST_SUPERSEDED');
    const text = await new Blob(parts).text(); ensure(session);
    return JSON.parse(text);
  }
  function loadedMessages() {
    const seen = new Set(), output = [], sc = scope();
    if (!sc.root || sc.status === 'ambiguous') return output;
    const lease = S.freeze();
    for (const el of nodes(sc)) {
      const ids = K.getDomMessageIdCandidates(el), role = messageRole(el);
      if (!['user', 'assistant'].includes(role)) continue;
      const id = ids[0] || 'loaded-' + output.length;
      if (seen.has(id) || output.some(item => item.domNode.contains(el) || el.contains(item.domNode))) continue;
      seen.add(id);
      output.push({ id, nodeId: null, role, text: el.innerText || el.textContent || '', domNode: el,
        idKnown: !!ids.length, observedLease: lease });
    }
    return output;
  }
  async function load(session) {
    session.jump += 1; session.controller?.abort(); session.navigationController?.abort();
    const request = { controller: new AbortController(), token: null };
    session.request = request; session.controller = request.controller; session.selected.clear();
    const timer = setTimeout(() => request.controller.abort(), 10000);
    let messages, coverage, label;
    session.list.replaceChildren(); session.prev.disabled = session.next.disabled = true;
    session.matches = []; session.count.textContent = ''; session.status.textContent = '正在读取当前对话…';
    try {
      const auth = await json(session, '/api/auth/session', request); request.token = auth.accessToken || null;
      const raw = await json(session, '/backend-api/conversation/' + encodeURIComponent(C.chatUrl(session.url).conversationId), request);
      const snapshot = C.normalizeConversation(raw, session.url), byNode = new Map(snapshot.messages.map(item => [item.nodeId, item]));
      messages = snapshot.active.map(id => byNode.get(id)).filter(Boolean);
      C.check(messages.length, 'TOOLS_NO_API_MESSAGES');
      coverage = 'api_accessible_branch'; label = '当前可访问分支' + (snapshot.integrity.issues.length ? '（有完整性提示）' : '');
    } catch (error) {
      if (!current(session) || session.request !== request) return;
      messages = loadedMessages(); session.loadedScope = S.freeze();
      coverage = 'loaded_dom_only'; label = '仅已加载消息；历史覆盖不完整';
      session.loadError = /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : 'TOOLS_API_UNAVAILABLE';
    } finally { clearTimeout(timer); request.token = null; }
    if (!current(session) || session.request !== request) return;
    session.messages = messages; session.coverage = coverage; session.coverageLabel = label;
    session.coverageNode.textContent = label + ' · ' + messages.length + ' 条';
    session.status.textContent = session.loadError ? 'API 读取未完成（' + session.loadError + '），仅显示本次页面观察。' : '';
    session.turns = K.groupExportMessagesIntoTurns(messages); render(session);
  }
  function reportJumpError(session, error) {
    if (!current(session)) return;
    session.status.textContent = '定位未完成：' + (/^[A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'PAGE_NAVIGATION_FAILED');
  }
  function render(session) {
    session.list.replaceChildren(); session.cursor = -1;
    const query = session.query.value.trim(), tooLong = query.length > 200;
    session.query.setCustomValidity(tooLong ? '搜索词超过 200 个字符，全文已保留。' : '');
    session.query.setAttribute('aria-invalid', String(tooLong));
    if (tooLong) {
      session.matches = []; session.prev.disabled = session.next.disabled = true;
      session.count.textContent = '搜索词过长'; session.status.textContent = '搜索词超过 200 个字符，全文已保留。请缩短后搜索。'; return;
    }
    session.matches = session.messages.filter(item => query ? K.getSearchMatchRanges(item.text, query).length : item.role === 'user');
    session.count.textContent = session.matches.length + (query ? ' 条命中' : ' 个提问');
    session.prev.disabled = session.next.disabled = !session.matches.length;
    for (const item of session.matches.slice(0, 200)) {
      const row = n('div', null, { class: 'row' });
      const turn = session.turns.find(group => group.messages.some(entry => entry.message === item));
      const check = n('input', null, { type: 'checkbox', 'aria-label': '选择此问答回合' });
      check.checked = session.selected.has(turn?.id); check.dataset.turnId = turn?.id || '';
      check.onchange = () => {
        if (!turn) return;
        if (check.checked) session.selected.add(turn.id); else session.selected.delete(turn.id);
        for (const el of session.list.querySelectorAll('input[type=checkbox]')) el.checked = session.selected.has(el.dataset.turnId);
      };
      const button = n('button', null, { type: 'button', title: item.text.slice(0, 800) });
      const first = query ? K.getSearchMatchRanges(item.text, query)[0] : null;
      const start = first ? Math.max(0, first.start - 30) : 0, end = Math.min(item.text.length, start + 150);
      if (first && first.end <= end) button.append(document.createTextNode(item.text.slice(start, first.start)),
        n('mark', item.text.slice(first.start, first.end)), document.createTextNode(item.text.slice(first.end, end)));
      else button.textContent = item.text.slice(start, end) || '（无文本）';
      button.onclick = () => { session.cursor = session.matches.indexOf(item); jump(session, item).catch(error => reportJumpError(session, error)); };
      row.append(check, button); session.list.append(row);
    }
    if (session.matches.length > 200) session.list.append(n('p', '显示前 200 条；请缩小搜索范围。'));
  }
  const STYLE = `:host{all:initial;position:fixed;right:18px;top:80px;z-index:2147483646;width:min(340px,calc(100vw - 32px));font:14px/1.5 system-ui;color:#233442;color-scheme:light}*{box-sizing:border-box}.panel{background:#fff;border:1px solid #d3dce4;border-radius:16px;box-shadow:0 12px 44px #182e4524;padding:16px;max-height:calc(100vh - 160px);overflow:auto}header,.controls,.row{display:flex;gap:8px;align-items:center}header{justify-content:space-between;margin-bottom:12px}h2{font-size:16px;margin:0}button,input,select{font:inherit;color:inherit}button{min-height:44px;padding:8px 10px;border:1px solid #d6dfe6;border-radius:9px;background:#fff;cursor:pointer}button:disabled{opacity:.5}input[type=search],select{width:100%;padding:10px;border:1px solid #ccd7e0;border-radius:9px;margin:7px 0}input[type=checkbox]{flex:none;width:18px;height:18px}.row{border-bottom:1px solid #edf0f3}.row button{flex:1;text-align:left;border:0;overflow-wrap:anywhere;min-width:0}.controls{justify-content:space-between}.hint,small{color:#5d6d7c;font-size:12px}#list{max-height:38vh;overflow:auto;margin:8px 0}p{overflow-wrap:anywhere}details{margin-top:12px}summary{cursor:pointer;min-height:44px;padding-top:10px}mark{background:#fff0a4}button:focus-visible,input:focus-visible,summary:focus-visible,select:focus-visible{outline:2px solid #327aba;outline-offset:2px}@media(prefers-color-scheme:dark){:host{color:#e4edf4;color-scheme:dark}.panel,button,input[type=search],select{background:#1c2832;border-color:#425666}.hint,small{color:#c1ced8}.row{border-color:#3b4a57}mark{background:#6d581d;color:#fff}}`;
  function show(url) {
    C.check(canonical() === url, 'TOOLS_SOURCE_CHANGED'); close();
    const host = n('div', null, { id: 'chatflow-page-tools' }), shadow = host.attachShadow({ mode: 'open' });
    const session = { url, host, shadow, lease: S.freeze(), closed: false, jump: 0, messages: [], turns: [], selected: new Set(), matches: [], cursor: -1, restoreFocus: document.activeElement };
    live = session;
    const panel = n('section', null, { class: 'panel', role: 'dialog', 'aria-label': '对话搜索与时间轴' });
    const header = n('header'), x = n('button', '×', { type: 'button', 'aria-label': '关闭对话工具' });
    x.onclick = close; header.append(n('h2', '对话导航'), x);
    session.query = n('input', null, { type: 'search', placeholder: '搜索当前对话', 'aria-label': '搜索当前对话' });
    session.query.oninput = () => { session.jump += 1; session.navigationController?.abort(); render(session); };
    session.coverageNode = n('p', null, { class: 'hint' }); session.count = n('span');
    session.prev = n('button', '上一条', { type: 'button' }); session.next = n('button', '下一条', { type: 'button' });
    for (const [button, step] of [[session.prev, -1], [session.next, 1]]) button.onclick = () => {
      if (!session.matches.length) return;
      session.cursor = K.nextMatchIndex(session.cursor, step, session.matches.length);
      jump(session, session.matches[session.cursor]).catch(error => reportJumpError(session, error));
    };
    const controls = n('div', null, { class: 'controls' }); controls.append(session.prev, session.count, session.next);
    session.list = n('div', null, { id: 'list' }); session.status = n('p', null, { role: 'status', 'aria-live': 'polite', class: 'hint' });
    const extra = n('details'), summary = n('summary', '导出所选回合与公式复制');
    const format = n('select', null, { 'aria-label': '导出格式' });
    for (const value of ['md', 'json', 'txt']) format.add(new Option(value.toUpperCase(), value));
    const exportButton = n('button', '导出勾选回合', { type: 'button' });
    exportButton.onclick = () => {
      try {
        ensure(session);
        C.check(session.coverage === 'api_accessible_branch' || (scope().status === 'confirmed' && S.unchanged(session.loadedScope)), 'TOOLS_SOURCE_UNVERIFIED');
        const content = K.exportSelected(session.messages, [...session.selected], { ...C.chatUrl(url), coverage: session.coverage }, document.title, format.value);
        const objectUrl = URL.createObjectURL(new Blob([content], { type: format.value === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }));
        n('a', null, { href: objectUrl, download: 'chatflow-selected-turns.' + format.value }).click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        session.status.textContent = '已发起所选回合下载；不是全文档案备份。';
      } catch (error) { session.status.textContent = error.message === 'NO_EXPORT_TURNS' ? '请先勾选至少一个回合。' : '无法导出：' + error.message; }
    };
    const formulas = n('select', null, { 'aria-label': '选择可复制的 LaTeX 公式' });
    const copyFormula = n('button', '复制 LaTeX', { type: 'button' });
    const fallback = n('textarea', null, { readonly: '', hidden: '', 'aria-label': '手动复制 LaTeX' });
    let formulaRows = [], formulaLease = null;
    extra.addEventListener('toggle', () => {
      if (!extra.open) return;
      formulas.replaceChildren(new Option('选择页面中的公式', '')); formulaRows = []; formulaLease = S.freeze();
      if (formulaLease.status !== 'confirmed' || !formulaLease.root) { session.status.textContent = '当前对话的公式来源未确认，不能复制。'; return; }
      const found = formulaLease.root.querySelectorAll('annotation[encoding="application/x-tex"],annotation[encoding="application/x-latex"]');
      for (const el of [...found].filter(el => S.contains(formulaLease, el)).slice(0, 100)) {
        const text = el.textContent;
        if (text && text.length <= 20000) { formulaRows.push({ el, text }); formulas.add(new Option(text.slice(0, 80), text)); }
      }
    });
    copyFormula.onclick = async () => {
      let text = '';
      try {
        ensure(session); C.check(formulaLease && S.unchanged(formulaLease) && scope().status === 'confirmed', 'TOOLS_SOURCE_UNVERIFIED');
        const entry = formulaRows[formulas.selectedIndex - 1];
        C.check(entry && S.contains(scope(), entry.el) && entry.el.textContent === entry.text, 'NO_FORMULA'); text = entry.text;
        await navigator.clipboard.writeText(text); ensure(session); session.status.textContent = 'LaTeX 已复制。';
      } catch (error) {
        if (['TOOLS_SOURCE_CHANGED','TOOLS_SOURCE_UNVERIFIED','NO_FORMULA'].includes(error.message)) {
          fallback.value = ''; fallback.hidden = true; session.status.textContent = '公式或来源已变化，请重新打开工具后选择。'; return;
        }
        session.status.textContent = '剪贴板不可用，请手动复制下方文本。';
        fallback.value = text; fallback.hidden = false; fallback.focus(); fallback.select();
      }
    };
    const refresh = n('button', '刷新当前对话', { type: 'button' });
    refresh.onclick = () => { session.jump += 1; session.loadError = null; load(session).catch(error => reportJumpError(session, error)); };
    extra.append(summary, format, exportButton, n('p', '只导出勾选回合，包含来源身份与覆盖范围。', { class: 'hint' }), formulas, copyFormula, fallback, refresh);
    panel.append(header, session.query, session.coverageNode, controls, session.list, session.status, extra);
    shadow.append(n('style', STYLE), panel); document.documentElement.append(host); session.query.focus();
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
    session.routeWatch = setInterval(() => { if (!current(session)) close(); }, 200);
    load(session).catch(error => reportJumpError(session, error)); return session;
  }
  api.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type !== 'tl:showTools' || sender.id !== api.runtime.id) return false;
    try { show(msg.url); reply({ ok: true }); } catch { reply({ ok: false }); }
    return false;
  });
})();
