/* ChatGPT read-only capture adapter. Tokens stay in this closure. MIT. */
(() => {
  'use strict';
  if (globalThis.TLCaptureInstalled) return;
  globalThis.TLCaptureInstalled = true;
  const C = globalThis.TLCore, P = globalThis.ChatFlowProviders, api = chrome;
  const DOWNLOAD_TIMEOUT_MS = 60000, CHUNK_BYTES = C.TRANSFER_CHUNK_BYTES;
  const JSON_LIMITS = Object.freeze({ session: 1024 ** 2, conversation: 32 * 1024 ** 2, metadata: 2 * 1024 ** 2 });
  let active = null;
  const code = e => e?.name === 'AbortError' ? 'CANCELLED_OR_TIMEOUT' :
    /^[A-Z0-9_]{2,100}$/.test(e?.message || '') ? e.message : 'CAPTURE_REQUEST_FAILED';

  function remaining(run) {
    const ms = run.assetDeadline == null ? DOWNLOAD_TIMEOUT_MS : run.assetDeadline - Date.now();
    C.check(ms > 0, 'ASSET_DOWNLOAD_TIMEOUT');
    return Math.min(DOWNLOAD_TIMEOUT_MS, ms);
  }
  async function message(type, data = {}, nonce = active?.nonce) {
    const result = await api.runtime.sendMessage({ type, nonce, ...data });
    if (!result?.ok) throw new Error(result?.code || 'EXTENSION_UNAVAILABLE');
    return result.data;
  }
  function sameSource(run) {
    const source = P.identify(location.href).identity;
    C.check(source.conversationId === run.source.conversationId && source.origin === run.source.origin, 'SOURCE_CONVERSATION_CHANGED');
    C.check(active === run && !run.stopped, 'CANCELLED_BY_USER');
    if (run.pageLease) globalThis.TLPageScope.assert(run.pageLease, false);
  }
  function status() { document.getElementById('chatflow-cache-notice')?.remove(); }
  function stop(run) {
    run.stopped = true;
    run.controller?.abort(); run.reader?.cancel().catch(()=>{}); run.observer?.disconnect(); clearInterval(run.timer);
    if (active === run) active = null;
    status();
  }
  async function fetchResponse(run, path, token, accountId) {
    sameSource(run);
    const url = P.get('chatgpt').readEndpoint(path, run.source);
    const headers = { Accept: '*/*' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (accountId) headers['ChatGPT-Account-ID'] = accountId;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), remaining(run));
    run.controller = controller;
    const close = () => { clearTimeout(timer); if (run.controller === controller) delete run.controller; };
    try {
      const response = await fetch(url.href, { method: 'GET', credentials: 'include', headers, redirect: 'error', cache: 'no-store', signal: controller.signal });
      C.check(response.ok, 'HTTP_' + response.status);
      return { response, close };
    } catch (error) { close(); throw error; }
  }
  /** Bound decoded response bytes before allocating a JSON object graph. */
  async function boundedBytes(run, response, limit) {
    let reader;
    try {
      const declared = Number(response.headers.get('content-length') || 0);
      C.check(Number.isSafeInteger(declared) && declared >= 0, 'API_JSON_LENGTH_INVALID');
      C.check(!declared || declared <= limit, 'API_JSON_RESPONSE_TOO_LARGE');
      C.check(response.body, 'API_JSON_BODY_MISSING');
      reader = response.body.getReader();
      const parts = []; let size = 0;
      while (true) {
        sameSource(run); remaining(run);
        const part = await reader.read();
        sameSource(run);
        if (part.done) break;
        size += part.value.byteLength;
        C.check(size <= limit, 'API_JSON_RESPONSE_TOO_LARGE');
        parts.push(part.value);
      }
      if (declared && !response.headers.get('content-encoding')) C.check(size === declared, 'API_JSON_LENGTH_MISMATCH');
      const bytes = new Uint8Array(size); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      return bytes;
    } catch (error) {
      // Cancellation cleanup must not hide the original refusal.
      try { if (reader) await reader.cancel(); else await response.body?.cancel(); } catch { /* original error retained */ }
      throw error;
    } finally { reader?.releaseLock(); }
  }
  function parseJson(bytes) {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('API_JSON_INVALID_UTF8'); }
    try { return JSON.parse(text); } catch { throw new Error('API_JSON_INVALID'); }
  }
  async function json(run, path, token, accountId) {
    const conversationPath = '/backend-api/conversation/' + encodeURIComponent(run.source.conversationId);
    const limit = path === '/api/auth/session' ? JSON_LIMITS.session : path === conversationPath ? JSON_LIMITS.conversation : JSON_LIMITS.metadata;
    const { response, close } = await fetchResponse(run, path, token, accountId);
    try {
      C.check(!(response.headers.get('content-type') || '').toLowerCase().includes('text/html'), 'API_JSON_NOT_JSON');
      const result = parseJson(await boundedBytes(run, response, limit));
      sameSource(run);
      return result;
    } finally { close(); }
  }
  async function sourceBytes(run, asset, response) {
    const mime = (response.headers.get('content-type') || asset.mime).split(';')[0];
    if (mime === 'text/html' && !/\.html?$/i.test(asset.name)) throw new Error('HTML_LOGIN_OR_ERROR_DOCUMENT');
    await message('tl:assetBegin', { key: asset.key }, run.nonce);
    C.check(response.body, 'EMPTY_DOWNLOAD_BODY');
    const reader = response.body.getReader(); run.reader=reader; let seq = 0, total = 0;
    try {
      while (true) {
        sameSource(run); if (run.assetDeadline != null) remaining(run);
        const part = await reader.read(); sameSource(run);
        if (part.done) break;
        for (let i = 0; i < part.value.length; i += CHUNK_BYTES) {
          sameSource(run); if (run.assetDeadline != null) remaining(run);
          const bytes = part.value.subarray(i, i + CHUNK_BYTES);
          await message('tl:assetChunk', { key: asset.key, seq: seq++, data: C.bytesToBase64(bytes) }, run.nonce);
          total += bytes.length;
        }
      }
    } catch (error) { try { await reader.cancel(); } catch { /* retain original */ } throw error; }
    finally { if(run.reader===reader)run.reader=null;reader.releaseLock(); }
    if (run.assetDeadline != null) remaining(run);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared && !response.headers.get('content-encoding')) C.check(total === declared, 'DOWNLOAD_SIZE_MISMATCH');
    return message('tl:assetEnd', { key: asset.key, mime }, run.nonce);
  }
  async function urlBytes(run, asset, url, token, accountId) {
    const target = new URL(url, run.source.origin);
    if (target.origin !== run.source.origin) {
      P.get('chatgpt').mediaUrl(target.href);
      return message('tl:external', { key: asset.key, url: target.href, deadlineAt: run.assetDeadline ?? Date.now() + DOWNLOAD_TIMEOUT_MS }, run.nonce);
    }
    const { response, close } = await fetchResponse(run, target.href, token, accountId);
    try { return await sourceBytes(run, asset, response); } finally { close(); }
  }
  const stopFallback = error => ['HTTP_401','HTTP_403','MEDIA_PERMISSION_REQUIRED','LOCAL_STORAGE_FULL','CANCELLED_BY_USER','CANCELLED_OR_TIMEOUT','ASSET_DOWNLOAD_TIMEOUT','PAGE_SCOPE_CHANGED','SOURCE_CONVERSATION_CHANGED','API_JSON_RESPONSE_TOO_LARGE'].includes(code(error));
  async function download(run, asset, token, accountId) {
    const ref = asset.ref, id = encodeURIComponent(run.source.conversationId);
    if (ref.scheme === 'https') { C.check(asset.ephemeralUrl, 'SIGNED_URL_UNAVAILABLE'); return urlBytes(run, asset, asset.ephemeralUrl, token, accountId); }
    if (['file-service','sediment'].includes(ref.scheme)) {
      const file = encodeURIComponent(ref.fileId), qs = '?conversation_id=' + id;
      const routes = ['/backend-api/files/download/' + file + qs + '&inline=false', '/backend-api/files/download/' + file + qs, '/backend-api/files/' + file + '/download' + qs];
      let last;
      for (const route of routes) {
        try {
          const data = await json(run, route, token, accountId), url = data.download_url || data.signed_url || data.url;
          C.check(typeof url === 'string', 'DOWNLOAD_URL_MISSING');
          return await urlBytes(run, asset, url, token, accountId);
        } catch (error) { last = error; if (stopFallback(error)) break; }
      }
      throw last || new Error('DOWNLOAD_UNAVAILABLE');
    }
    if (ref.scheme === 'sandbox') {
      const query = new URLSearchParams({ sandbox_path: ref.path, message_id: asset.messageId });
      const base = '/backend-api/conversation/' + id;
      const routes = [base + '/download_from_sandbox/v2?' + query, base + '/interpreter/download?' + query, base + '/download_from_sandbox?' + query];
      let last;
      for (const route of routes) {
        let close;
        try {
          const fetched = await fetchResponse(run, route, token, accountId); close = fetched.close;
          const response = fetched.response, mime = response.headers.get('content-type') || '';
          if (mime.includes('application/json') && !response.headers.get('content-disposition')) {
            const bytes = await boundedBytes(run, response, JSON_LIMITS.metadata), data = parseJson(bytes);
            const url = data.download_url || data.signed_url;
            if (typeof url === 'string') { close(); close = null; return await urlBytes(run, asset, url, token, accountId); }
            if (/\.json$/i.test(asset.name)) return await sourceBytes(run, asset, new Response(bytes, { headers: { 'content-type': 'application/json' } }));
            throw new Error('SANDBOX_DOWNLOAD_ENVELOPE_UNRECOGNIZED');
          }
          return await sourceBytes(run, asset, response);
        } catch (error) { last = error; if (stopFallback(error)) break; }
        finally { close?.(); }
      }
      throw last || new Error('SANDBOX_FILE_UNAVAILABLE');
    }
    throw new Error('UNSUPPORTED_ASSET_REFERENCE');
  }
  function reconcileVisibleAttachments(model) {
    const scope = globalThis.TLPageScope?.current();
    if (scope?.status === 'unavailable') {
      // API identity is independently locked. No DOM container is not proof
      // that the returned mapping or its files are incomplete.
      model.domAudit = { state: 'unavailable', reason: 'NO_CONFIRMED_PAGE_CONTAINER' };
      return;
    }
    if (!scope?.root || scope.status === 'ambiguous') {
      if (globalThis.TLPageScope) {
        model.integrity.state = 'partial';
        model.integrity.issues.push({ code: 'VISIBLE_ATTACHMENT_SCOPE_UNAVAILABLE' });
      }
      return;
    }
    const selector = '[data-message-author-role] a[download],[data-message-author-role] [data-testid="file-chip"]';
    const candidates = scope.root.querySelectorAll(selector);
    C.check(candidates.length <= 4096, 'PAGE_ATTACHMENT_SCAN_LIMIT');
    const visible = [...candidates].filter(el => globalThis.TLPageScope.contains(scope, el));
    if (!visible.length) return;
    if (scope.status !== 'confirmed') {
      model.integrity.state = 'partial'; model.integrity.issues.push({ code: 'VISIBLE_ATTACHMENT_SCOPE_UNVERIFIED', count: visible.length }); return;
    }
    const byId = new Map();
    for (const msg of model.messages) {
      for (const id of [msg.id, msg.nodeId].filter(Boolean)) {
        const rows = byId.get(id) || []; if (!rows.includes(msg)) rows.push(msg); byId.set(id, rows);
      }
    }
    const original = model.assets.slice(), seenElements = new Set();
    let occurrence = 0;
    for (const el of visible) {
      if (seenElements.has(el)) continue;
      seenElements.add(el); occurrence += 1;
      const raw = el.getAttribute('download') || el.getAttribute('data-filename') || el.textContent || '';
      const name = C.safeName(raw.trim());
      if (!name) continue;
      const owner = el.closest('[data-message-author-role]') || el.closest('[data-turn-key]');
      const ids = new Set();
      for (const node of [owner, owner?.closest('[data-turn-key]')].filter(Boolean)) {
        for (const attr of ['data-message-id','data-node-id','data-turn-key','data-chatgpt-selection-message-id']) {
          const value = node.getAttribute(attr) || node.querySelector('[' + attr + ']')?.getAttribute(attr);
          if (value) for (const id of value.split(/[\s,]+/).filter(Boolean)) ids.add(id);
        }
      }
      const matches = [...new Set([...ids].flatMap(id => byId.get(id) || []))];
      const messageOwner = matches.length === 1 ? matches[0] : null;
      const fileId = el.getAttribute('data-file-id') || el.getAttribute('data-attachment-id');
      let path = null;
      const href = el.getAttribute('href');
      if (href?.startsWith('sandbox:')) { try { path = C.pointer(href).path; } catch { /* invalid reference stays unresolved */ } }
      // Names, case folding and ordinal counts never establish file identity.
      const matched = messageOwner && original.some(asset => asset.messageId === messageOwner.id && asset.nodeId === messageOwner.nodeId &&
        (fileId ? asset.ref?.fileId === fileId : path ? asset.ref?.scheme === 'sandbox' && asset.ref.path === path : false));
      if (matched) continue;
      const role = owner?.getAttribute('data-message-author-role') || 'unknown';
      const origin = role === 'assistant' ? 'assistant_generated' : role === 'user' ? 'user_uploaded' : 'unknown';
      const reason = messageOwner ? 'VISIBLE_ATTACHMENT_NOT_IN_API' : 'VISIBLE_ATTACHMENT_MESSAGE_UNVERIFIED';
      const stableRef = fileId || path || 'observed-' + occurrence;
      model.integrity.state = 'partial';
      model.integrity.issues.push({ code: reason, name, messageId: messageOwner?.id || null, occurrence });
      const key = JSON.stringify(['visible-unmatched', model.source.conversationId, messageOwner?.id || null, stableRef]);
      if (model.assets.some(asset => asset.key === key)) continue;
      model.assets.push({ key, messageId: messageOwner?.id || 'visible-unmatched', nodeId: messageOwner?.nodeId || 'visible-unmatched', name,
        mime: 'application/octet-stream', kind: 'upload', origin, authorRole: role,
        ref: { scheme: 'unsupported' }, expectedSize: null, state: 'unavailable', reason });
    }
  }
  async function cycle(run) {
    if (run.busy || run.stopped) return;
    run.busy = true; run.dirty = false;
    try {
      sameSource(run);
      const session = await json(run, '/api/auth/session');
      C.check(typeof session.accessToken === 'string' && session.accessToken, 'CHATGPT_LOGIN_REQUIRED');
      const token = session.accessToken, account = session.account?.id || session.activeAccount?.id || session.account_id || null;
      const raw = await json(run, '/backend-api/conversation/' + encodeURIComponent(run.source.conversationId), token, account);
      sameSource(run);
      const mapping = raw.conversation?.mapping || raw.mapping;
      C.check(!mapping || Object.keys(mapping).length <= 50000, 'API_CONVERSATION_NODE_LIMIT');
      const model = C.normalizeConversation(raw, location.href);
      reconcileVisibleAttachments(model);
      const selected = new Set(C.selectAssetKeys(model, run.scope));
      const ambiguous = run.scope === 'last_generated' && C.lastGeneratedScopeAmbiguous(model);
      for (const asset of model.assets) if (!selected.has(asset.key)) {
        const activeNode = model.active.includes(asset.nodeId), known = !!model.nodes[asset.nodeId];
        const generated = asset.origin === 'assistant_generated' || (!asset.origin && asset.kind === 'generated');
        const unresolved = !known ? asset.origin === 'unknown' || generated : activeNode && (asset.origin === 'unknown' || (ambiguous && generated));
        asset.state = unresolved ? 'unavailable' : 'excluded';
        asset.reason = unresolved ? 'SAVE_SCOPE_SOURCE_UNRESOLVED' : 'OUT_OF_SAVE_SCOPE';
      }
      const persisted = C.persistedSnapshot(model);
      // Allow a bounded larger conversation snapshot, without truncating or claiming missing history.\n      C.check(JSON.stringify(persisted).length <= 24 * 1024 ** 2, 'SNAPSHOT_MESSAGE_SIZE_LIMIT');
      sameSource(run);
      const saved = new Set((await message('tl:snapshot', { snapshot: persisted }, run.nonce)).savedKeys);
      for (const asset of model.assets) {
        if (asset.state === 'excluded') continue;
        sameSource(run); if (saved.has(asset.key)) continue;
        if (asset.reason === 'SAVE_SCOPE_SOURCE_UNRESOLVED') { await message('tl:assetFail', { key: asset.key, code: asset.reason }, run.nonce); continue; }
        run.assetDeadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
        try { await download(run, asset, token, account); }
        catch (error) {
          const reason = code(error);
          await message('tl:assetFail', { key: asset.key, code: reason }, run.nonce);
          if (['LOCAL_STORAGE_FULL','PAGE_SCOPE_CHANGED','SOURCE_CONVERSATION_CHANGED','CANCELLED_BY_USER'].includes(reason)) throw error;
        } finally { delete run.assetDeadline; }
      }
      sameSource(run); await message('tl:finish', {}, run.nonce);
      if (!run.live) { run.stopped = true; if (active === run) active = null; }
    } catch (error) {
      try { await message('tl:captureFailed', { code: code(error) }, run.nonce); }
      catch { /* disconnected extension cannot receive a failure receipt; restart recovery handles it */ }
      stop(run);
    } finally { run.busy = false; }
  }
  function start(nonce, live, scope = 'all', expectedSource) {
    C.check(['all','last_generated'].includes(scope), 'INVALID_SAVE_SCOPE');
    C.check(!(live && scope === 'last_generated'), 'LIVE_CACHE_REQUIRES_ALL_SCOPE');
    const source = P.identify(location.href).identity;
    C.check(expectedSource?.conversationId === source.conversationId && expectedSource?.origin === source.origin, 'SOURCE_CONVERSATION_CHANGED');
    if (active) stop(active);
    const run = { nonce, source, live: !!live, scope, busy: false, stopped: false, dirty: true, pageLease: globalThis.TLPageScope?.freeze?.() };
    active = run;
    if (run.live) {
      run.observer = new MutationObserver(() => { run.dirty = true; });
      run.observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      run.timer = setInterval(async () => {
        if (run.busy || run.stopped) return;
        try { sameSource(run); await message('tl:heartbeat', {}, run.nonce); if (run.dirty) await cycle(run); }
        catch { stop(run); }
      }, 12000);
    }
    cycle(run);
  }
  api.runtime.onMessage.addListener((msg, sender, respond) => {
    if (sender.id !== api.runtime.id) return false;
    if (msg?.type === 'tl:capture') {
      try { C.check(typeof msg.nonce === 'string' && msg.nonce.length > 20, 'INVALID_CAPTURE_NONCE'); start(msg.nonce, msg.live, msg.scope || 'all', msg.expectedSource); respond({ ok: true }); }
      catch (error) { respond({ ok: false, code: code(error) }); }
    }
    if (msg?.type === 'tl:stopCapture' && active?.nonce === msg.nonce) { stop(active); respond({ ok: true }); }
    return false;
  });
})();
