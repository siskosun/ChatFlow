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
    const found = sc.root.querySelectorAll('[data-message-author-role],article[data-turn-key],[data-message-id],[data-chatgpt-selection-message-id],[data-chatgpt-search-message-ids]');
    C.check(found.length <= 4096, 'TOOLS_DOM_SCAN_LIMIT');
    return [...found].filter(el => S.contains(sc, el) && !el.closest('#chatflow-page-tools'));
  }
  function messageRole(el) {
    const direct=node=>node.getAttribute('data-message-author-role')||(node.matches?.('[data-user-message-bubble]')?'user':node.matches?.('[data-markdown-text-style="assistant-message"]')?'assistant':null);
    const own=direct(el);if(own)return own;
    const children=el.querySelectorAll('[data-message-author-role],[data-user-message-bubble],[data-markdown-text-style="assistant-message"]');
    const roles=new Set([...children].map(direct).filter(Boolean));return roles.size===1?[...roles][0]:null;
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
    const plural=(inner[0].getAttribute('data-chatgpt-search-message-ids')||'').trim().split(/\s+/).filter(Boolean);
    return { el: inner[0], confidence: sc.status === 'confirmed' && plural.length<=1 ? 'verified_message_id' : 'observed_dom_node' };
  }
  function scroller(el) {
    for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (/auto|scroll/.test(css.overflowY) && node.scrollHeight > node.clientHeight + 10) return node;
    }
    return document.scrollingElement;
  }
  async function jump(session, message, section = null) {
    const token = ++session.jump;
    session.navigationController?.abort();
    if (session.navigationPromise) await session.navigationPromise;
    ensure(session);
    if (token !== session.jump) return false;
    const controller = new AbortController(); session.navigationController = controller;
    const initial = S.freeze();
    if (!initial.root || initial.status === 'ambiguous') {
      session.status.textContent = '\u5f53\u524d\u5bf9\u8bdd\u7684\u9875\u9762\u8303\u56f4\u65e0\u6cd5\u786e\u8ba4\uff0c\u5df2\u505c\u6b62\u5b9a\u4f4d\u3002'; return false;
    }
    const byId = new Map();
    session.messages.forEach((item,index)=>{byId.set(item.id,index);if(item.nodeId)byId.set(item.nodeId,index);});
    const cancel=event=>{
      if (event.type==='keydown' && !['Escape','PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(event.key)) return;
      controller.abort();
    };
    const events=['wheel','touchstart','pointerdown','keydown'];
    for(const event of events)window.addEventListener(event,cancel,{capture:true,passive:true});
    session.status.textContent='\u6b63\u5728\u5b9a\u4f4d\u539f\u6d88\u606f\u2026';
    const work=globalThis.TLNavigation.navigate({
      resolve:()=>{
        const match=resolve(session,message,scope());
        if(!section)return match;
        if(match?.confidence!=='verified_message_id')return null;
        const el=globalThis.TLHeadings.resolve(match.el,section,node=>S.contains(scope(),node));
        return el?{el,confidence:'verified_message_id'}:null;
      },
      mounted:()=>section?[]:nodes().map(el=>({el,index:K.getDomMessageIdCandidates(el).map(id=>byId.get(id)).find(index=>index!==undefined)})).filter(row=>row.index!==undefined),
      scrollContainer:scroller,targetIndex:session.messages.indexOf(message),total:session.messages.length,signal:controller.signal,
      assertCurrent:()=>{ensure(session);S.assert(initial);C.check(token===session.jump,'TOOLS_REQUEST_SUPERSEDED');}
    });
    session.navigationPromise=work.then(()=>{},()=>{});
    try {
      const result=await work;session.navigationResult=result;
      if(!current(session)||token!==session.jump)return false;
      const labels={matched:'\u5df2\u6309\u6d88\u606f\u8eab\u4efd\u5b9a\u4f4d\u3002',observed:'\u4ec5\u5b9a\u4f4d\u5230\u672c\u6b21\u8bfb\u53d6\u7684\u9875\u9762\u8282\u70b9\uff1b\u539f\u6d88\u606f\u8eab\u4efd\u5c1a\u672a\u6838\u9a8c\u3002',cancelled:'\u5df2\u53d6\u6d88\u5b9a\u4f4d\u3002',timeout:'\u5b9a\u4f4d\u8d85\u65f6\uff0c\u672a\u62a5\u544a\u6210\u529f\u3002',not_found:'\u672a\u627e\u5230\u53ef\u786e\u8ba4\u7684\u76ee\u6807\uff0c\u672a\u8df3\u8f6c\u5230\u76f8\u4f3c\u6587\u672c\u3002'};
      session.status.textContent=section && result.state==='matched' ? '\u5df2\u5b9a\u4f4d\u5230\u56de\u7b54\u7ae0\u8282\u3002' :
        section && result.state==='not_found' ? '\u5df2\u5b9a\u4f4d\u5230\u56de\u7b54\uff0c\u4f46\u7ae0\u8282\u5df2\u53d8\u5316\u6216\u65e0\u6cd5\u786e\u8ba4\u3002' : labels[result.state];
      return result.state==='matched'||result.state==='observed';
    } finally {for(const event of events)window.removeEventListener(event,cancel,true);}
  }
  async function json(session, path, request) {
    ensure(session); C.check(session.request === request, 'TOOLS_REQUEST_SUPERSEDED');
    const url = globalThis.ChatFlowProviders.get('chatgpt').readEndpoint(path, C.chatUrl(session.url));
    const response = await fetch(url, { method: 'GET', credentials: 'include', redirect: 'error',
      headers: request.token ? { Authorization: 'Bearer ' + request.token } : {}, cache: 'no-store', signal: request.controller.signal });
    C.check(response.ok, 'TOOLS_HTTP_' + response.status);
    C.check(response.body, 'TOOLS_RESPONSE_MISSING');
    const limit = 32 * 1024 ** 2;
    const declared = Number(response.headers.get('content-length')||0);
    C.check(!declared || (Number.isSafeInteger(declared) && declared<=limit), 'TOOLS_RESPONSE_LIMIT');
    const reader = response.body.getReader(), parts = []; let size = 0;
    try {
      while (true) {
        ensure(session); const result = await reader.read(); ensure(session);
        if (result.done) break;
        size += result.value.length; C.check(size <= limit, 'TOOLS_RESPONSE_LIMIT'); parts.push(result.value);
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
    const timer = setTimeout(() => request.controller.abort(), 30000);
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
    session.retry.hidden=!session.loadError;
    session.status.textContent = session.loadError ? (messages.length?'只显示已加载内容，未取得完整历史。':'本次未读取到可确认的消息。')+' 可重试完整读取（'+session.loadError+'）。' : '';
    session.turns = K.groupExportMessagesIntoTurns(messages); render(session);
  }
  function reportJumpError(session, error) {
    if (!current(session)) return;
    session.status.textContent = '定位未完成，请重新打开这段对话后再试。';
  }
  // Extract a useful outline from retrieved answer text without claiming
  // those headings are mounted or navigable in the ChatGPT DOM.
  function textOutline(value) {
    const output=[];let fence=null;
    for(const line of String(value||'').split(/\r?\n/)){
      const trimmed=line.trim();
      const mark=/^(`{3,}|~{3,})/.exec(trimmed);
      if(mark){if(!fence)fence=mark[1][0];else if(fence===mark[1][0])fence=null;continue;}
      if(fence)continue;
      const m=/^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/.exec(line);
      if(!m)continue;
      const title=m[2].replace(/\s+/g,' ').trim();
      if(title&&title.length<=250)output.push({level:m[1].length,text:title});
      if(output.length>=80)break;
    }
    return output;
  }
  // When the API is unavailable, a rendered answer may still contain real
  // heading elements even though innerText no longer contains Markdown '#'.
  // Observe only a source-scoped loaded message; never certify these as
  // full-history or remote identity evidence.
  function visibleOutline(message) {
    if(!message.domNode?.isConnected || !message.observedLease ||
       !S.unchanged(message.observedLease,false))return [];
    const sc=scope();
    if(!sc.root || sc.status==='ambiguous' || !S.contains(sc,message.domNode))return [];
    const headings=message.domNode.querySelectorAll('h1,h2,h3,h4,h5,h6');
    const result=[];
    for(const el of headings){
      if(!S.contains(sc,el) || el.closest('pre,code,[hidden],[inert],[aria-hidden="true"]'))continue;
      const title=String(el.textContent||'').replace(/\s+/g,' ').trim();
      if(!title || title.length>250)continue;
      result.push({level:Number(el.tagName.slice(1)),text:title});
      if(result.length>=80)break;
    }
    return result;
  }
  function headingMenu(session, message) {
    // DOM-only innerText may include '# headings' inside code blocks. Prefer
    // actual rendered heading elements rather than reparsing that flattened text.
    const outline=message.domNode?visibleOutline(message):textOutline(message.text);
    if(!outline.length)return null;
    const details=n('details',null,{class:'cf-headings'});
    const summary=n('summary','提纲（'+outline.length+'） · '+outline[0].text.slice(0,30));
    const list=n('div',null,{class:'cf-heading-list'});
    const load=n('button','\u5b9a\u4f4d\u56de\u7b54\u5e76\u8bfb\u53d6\u7ae0\u8282',{type:'button',class:'cf-read-headings'});
    const hint=n('p',null,{class:'hint','aria-live':'polite'});
    function populate() {
      ensure(session);list.replaceChildren();
      const sc=scope(),match=resolve(session,message,sc);
      if(match?.confidence!=='verified_message_id') {
        hint.textContent='文本提纲可查看；原消息尚未定位，不能直接跳转章节。';
        for(const entry of outline)list.append(n('div',entry.text,{class:'cf-outline','data-level':String(entry.level)}));
        return;
      }
      const entries=globalThis.TLHeadings.read(match.el,node=>S.contains(sc,node));
      hint.textContent=entries.length ? entries.length+' 个可定位章节' : '页面标题未挂载，仅展示文本提纲。';
      if(!entries.length)for(const entry of outline)list.append(n('div',entry.text,{class:'cf-outline','data-level':String(entry.level)}));
      for(const entry of entries) {
        const saved=globalThis.TLHeadings.descriptor(entry);
        const button=n('button',entry.text,{type:'button',class:'cf-heading','data-level':String(entry.level)});
        button.style.marginInlineStart=(entry.level-1)*10+'px';
        button.title='H'+entry.level+' / '+(entry.occurrence+1);
        button.onclick=async()=>{
          try {
            if(!await jump(session,message)||session.navigationResult?.state!=='matched')return;
            await jump(session,message,saved);
          } catch(error) {reportJumpError(session,error);}
        };
        list.append(button);
      }
    }
    load.onclick=async()=>{
      load.disabled=true;
      try{if(await jump(session,message))populate();}catch(error){reportJumpError(session,error);}
      finally{load.disabled=false;}
    };
    details.addEventListener('toggle',()=>{
      if(!details.open)return;
      try{populate();}catch(error){reportJumpError(session,error);}
    });
    details.append(summary,load,hint,list);return details;
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
      const answers=item.role==='assistant'?[item]:(turn?.assistantMessages||[]).map(entry=>entry.message);
      for(const answer of answers){const menu=headingMenu(session,answer);if(menu)session.list.append(menu);}
    }
    if (session.matches.length > 200) session.list.append(n('p', '显示前 200 条；请缩小搜索范围。'));
  }
  const STYLE = `:host{all:initial;position:fixed;right:18px;top:80px;z-index:2147483646;width:min(340px,calc(100vw - 32px));font:14px/1.5 system-ui;color:#11100e;color-scheme:light}*{box-sizing:border-box}.panel{background:#fffdf5;border:2px solid #11100e;border-radius:14px;box-shadow:6px 6px 0 #11100e;padding:17px;max-height:calc(100vh - 160px);overflow:auto}header,.controls,.row{display:flex;gap:8px;align-items:center}header{justify-content:space-between;margin-bottom:12px}h2{font-size:19px;font-weight:830;letter-spacing:-.04em;margin:0}button,input,select{font:inherit;color:inherit}button{min-height:44px;padding:8px 10px;border:1.5px solid #11100e;border-radius:9px;background:#fbf4e0;cursor:pointer;font-weight:700}button:hover:not(:disabled){background:#c9b6ff}button:disabled{opacity:.56}input[type=search],select{width:100%;padding:10px;border:1.5px solid #11100e;border-radius:9px;margin:7px 0;background:#fffdf5}input[type=checkbox]{flex:none;width:18px;height:18px;accent-color:#ff7a66}.row{border-bottom:1px solid #d6cbbb}.row button{flex:1;text-align:left;border:0;overflow-wrap:anywhere;min-width:0;background:transparent}.row button:hover:not(:disabled){background:#f4e6c9}.controls{justify-content:space-between}.hint,small{color:#514940;font-size:12px}#list{max-height:38vh;overflow:auto;margin:8px 0}p{overflow-wrap:anywhere}details{margin-top:12px}.cf-headings{margin:0 0 8px 26px}.cf-heading-list{display:flex;flex-direction:column;gap:3px}.cf-heading{text-align:left;overflow-wrap:anywhere}.cf-headings summary{font-size:12px}summary{cursor:pointer;min-height:44px;padding-top:10px}mark{background:#ff7a66;color:#11100e}button:focus-visible,input:focus-visible,summary:focus-visible,select:focus-visible{outline:3px solid #8369ef;outline-offset:3px}@media(prefers-color-scheme:dark){:host{color:#fff3df;color-scheme:dark}.panel{background:#24231e;border-color:#fff3df;box-shadow:6px 6px 0 #0e0e0c}button,input[type=search],select{background:#302c28;color:#fff3df;border-color:#fff3df}.hint,small{color:#e1d3bf}.row{border-color:#555047}mark{background:#ff947f;color:#11100e}.row button:hover:not(:disabled){background:#43394e}}`;
  const UX_STYLE=`.panel{padding:13px;max-height:calc(100vh - 60px);overflow-y:auto}.panel header{margin-bottom:10px}.panel header button{min-width:36px;width:39px;height:40px;min-height:40px;padding:0;font-size:24px}.panel h2{font-size:19px}.panel .controls button{min-height:40px;padding:7px 11px}.panel .controls{justify-content:space-between;gap:10px;margin:10px 0}.panel #list{max-height:40vh;overflow:auto}.panel .row{align-items:flex-start;border-bottom:1px solid #d6cbbb}.panel .row button{font-weight:540;padding:7px 5px;min-height:40px}.panel .cf-headings{margin:2px 0 9px 21px;border-left:2px solid #e9e0d4;padding-left:8px}.panel .cf-headings summary{min-height:34px;padding:5px 0;font-size:13px;font-weight:650;color:#514940}.panel .cf-outline{font-size:13px;padding:4px 0;color:#514940;overflow-wrap:anywhere}.panel .cf-headings .cf-read-headings{font-size:12px;min-height:35px;padding:5px 9px;background:#e9e5ef}.panel .cf-retry{width:100%;margin:6px 0 12px;background:#dde9dd}.panel .hint{line-height:1.55}.panel [role=status]{margin:9px 0;white-space:normal}.panel input[type=search]{margin:0}@media(prefers-color-scheme:dark){.panel .cf-headings summary,.panel .cf-outline{color:#e3d5c3}.panel .cf-headings{border-color:#575046}.panel .cf-headings .cf-read-headings,.panel .cf-retry{background:#353d35;color:#fff3df;border-color:#e3d5c3}}`;
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
      } catch (error) { session.status.textContent = error.message === 'NO_EXPORT_TURNS' ? '请先勾选至少一个回合。' : '导出未完成，请检查选择后重试。'; }
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
    session.retry=n('button','重试读取',{type:'button',class:'cf-retry',hidden:''});
    session.retry.onclick=()=>{session.loadError=null;load(session).catch(error=>reportJumpError(session,error));};
    panel.append(header, session.query, session.coverageNode, controls, session.list, session.status, session.retry, extra);
    shadow.append(n('style', STYLE),n('style', UX_STYLE), panel); document.documentElement.append(host); session.query.focus();
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
