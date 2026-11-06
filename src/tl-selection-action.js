/* Selected-message action beside ChatGPT's own selection UI. Never sends text to a model. MIT. */
(() => {
 'use strict';
 if (globalThis.ChatFlowSelectionActionInstalled) return;
 const S = globalThis.TLPageScope, C = globalThis.TLCore;
 if (!S?.selectedMessage || !C?.chatUrl) return;
 globalThis.ChatFlowSelectionActionInstalled = true;
 const LABEL = 'ChatFlow选文', ERROR = '打开失败，点击重试';
 let host = null, button = null, current = null, dismissed = null;
 let timer = null, nativeTimer = null, nativeStop = null, nativeObserver = null;

 function stopNativeWatch() {
  nativeObserver?.disconnect();nativeObserver = null;
  clearTimeout(nativeTimer);nativeTimer = null;
  clearTimeout(nativeStop);nativeStop = null;
 }
 function clearCurrent() {
  clearTimeout(timer);timer = null;stopNativeWatch();
  current = null;if (host) host.hidden = true;
 }
 function readSelection() {
  try {
   C.chatUrl(location.href);
   const result = S.selectedMessage(20000);
   if (result.status !== 'selected' || result.tooLong || result.text.trim().length < 2) return null;
   const selected = getSelection();
   if (!selected?.rangeCount) return null;
   const range = selected.getRangeAt(0), rect = range.getBoundingClientRect();
   if ((!rect.width && !rect.height) || rect.bottom < 0 || rect.top > innerHeight) return null;
   const lines = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight);
   return {
    text: result.text, url: result.url, evidence: result.evidence,
    messageId: result.messageId, generation: result.generation,
    startContainer: range.startContainer, startOffset: range.startOffset,
    endContainer: range.endContainer, endOffset: range.endOffset,
    rect, line: lines[0] || rect
   };
  } catch { return null; }
 }
 function sameSelection(a, b) {
  return !!a && !!b && a.url === b.url && a.generation === b.generation &&
   a.text === b.text && a.messageId === b.messageId && a.evidence === b.evidence &&
   a.startContainer === b.startContainer && a.startOffset === b.startOffset &&
   a.endContainer === b.endContainer && a.endOffset === b.endOffset;
 }
 function dismiss() {
  dismissed = readSelection() || current?.value || null;
  clearCurrent();
 }
 // ChatGPT owns its native quote popover. Keep this action outside React-owned
 // markup, and use the native button's geometry only as a placement hint.
 function adjacentNativeButton(selectionRect) {
  const controls = document.querySelectorAll('button,[role="button"]');
  let best = null, score = Infinity;
  for (let i = controls.length - 1; i >= Math.max(0, controls.length - 450); i--) {
   const el = controls[i], label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
   if (!/^(向\s*ChatGPT\s*提问|Ask\s*ChatGPT)$/i.test(label)) continue;
   if (el.closest('#chatflow-selected-action') || (S.isVisible && !S.isVisible(el))) continue;
   const r = el.getBoundingClientRect();
   if (r.width < 20 || r.height < 20 || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) continue;
   const distance = Math.hypot(Math.max(0, r.left - selectionRect.right, selectionRect.left - r.right),
    Math.max(0, r.top - selectionRect.bottom, selectionRect.top - r.bottom));
   if (distance < 180 && distance < score) { best = r;score = distance; }
  }
  return best;
 }
 function place(value) {
  if (!host || host.hidden) return;
  // Measure after the label changes: errors can be wider or wrap to two lines.
  const measured = host.getBoundingClientRect(), width = measured.width, height = measured.height;
  const pad = 10, gap = 6, native = adjacentNativeButton(value.rect), anchor = native || value.line;
  let x, y;
  if (native) {
   if (native.right + gap + width <= innerWidth - pad) { x = native.right + gap;y = native.top + (native.height-height)/2; }
   else if (native.left - gap - width >= pad) { x = native.left - gap - width;y = native.top + (native.height-height)/2; }
   else {
    x = native.left;
    y = native.top - height - gap >= pad ? native.top - height - gap : native.bottom + gap;
   }
  } else {
   x = anchor.right + gap + width <= innerWidth - pad ? anchor.right + gap : anchor.left - width - gap;
   y = anchor.top - height - gap >= pad ? anchor.top - height - gap : anchor.bottom + gap;
  }
  host.style.left = Math.max(pad, Math.min(Math.max(pad, innerWidth - width - pad), x)) + 'px';
  host.style.top = Math.max(pad, Math.min(Math.max(pad, innerHeight - height - pad), y)) + 'px';
 }
 function render(record) {
  if (current !== record) return;
  button.disabled = record.pending;
  button.textContent = record.pending ? '正在打开…' : record.error || LABEL;
  button.setAttribute('aria-label', record.error || '使用选中的文字创建 ChatFlow 任务');
  button.setAttribute('aria-busy', String(record.pending));
  button.title = record.error ? '可点击重试，也可点击浏览器中的 ChatFlow 图标。' : '';
  host.hidden = false;place(record.value);
 }
 function createHost() {
  // A DOM singleton survives duplicate injections with separate JS globals.
  if (host?.isConnected === false) { host = null;button = null; }
  if (host) return true;
  if (document.querySelector?.('#chatflow-selected-action')) return false;
  host = document.createElement('div');host.id = 'chatflow-selected-action';host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' }), style = document.createElement('style');
  style.textContent = [
   ':host{all:initial;display:block;position:fixed;left:0;top:0;z-index:2147483646;line-height:1;pointer-events:auto;width:max-content;max-width:calc(100vw - 20px)}',
   ':host([hidden]){display:none!important}',
   'button{box-sizing:border-box;display:block;font:600 13px/1.3 system-ui,sans-serif;color:#262626;background:#fff;border:1px solid #d1d5db;border-radius:12px;',
   'padding:6px 11px;min-height:32px;max-width:calc(100vw - 20px);box-shadow:0 2px 8px #00000020;white-space:nowrap;overflow-wrap:anywhere;cursor:pointer}',
   'button:hover:not(:disabled){background:#f4f4f5;border-color:#b5bac3}',
   'button:focus-visible{outline:3px solid #8369ef;outline-offset:2px}',
   'button:disabled{opacity:.65;cursor:progress;box-shadow:none}',
   '@media(prefers-color-scheme:dark){button{color:#f7f7f7;background:#303030;border-color:#626262;box-shadow:0 2px 8px #0008}button:hover:not(:disabled){background:#454545;border-color:#888}}'
  ].join('\n');
  button = document.createElement('button');button.type = 'button';button.textContent = LABEL;
  button.setAttribute('aria-live', 'polite');
  button.addEventListener('pointerdown', event => event.preventDefault());
  button.addEventListener('click', activate);
  shadow.append(style, button);document.documentElement.append(host);return true;
 }
 async function activate() {
  const record = current;
  if (!record || record.pending) return;
  // A queued click cannot reuse a selection from an earlier route or DOM range.
  const fresh = readSelection();
  if (!sameSelection(record.value, fresh)) { clearCurrent();prepare();return; }
  record.value = fresh;record.pending = true;record.error = null;render(record);
  try {
   const response = await chrome.runtime.sendMessage({
    type: 'tl:quickSelection', text: fresh.text, url: fresh.url,
    evidence: fresh.evidence, messageId: fresh.messageId, generation: fresh.generation
   });
   if (current !== record) return;
   if (!sameSelection(record.value, readSelection())) { clearCurrent();prepare();return; }
   if (!response?.ok) throw Error(response?.code || 'SELECTION_OPEN_FAILED');
   // Selection may stay in the document after the side panel opens. Suppress its
   // old action until the user actually chooses another range.
   dismissed = record.value;clearCurrent();
  } catch {
   if (current !== record) return;
   if (!sameSelection(record.value, readSelection())) { clearCurrent();prepare();return; }
   record.error = ERROR;
  } finally {
   if (current === record) { record.pending = false;render(record); }
  }
 }
 function watchNative(record) {
  stopNativeWatch();
  if (typeof MutationObserver !== 'function') return;
  // Native quote portals may appear well after pointerup. Observe briefly, and
  // coalesce changes; no permanent polling or mutation of the native toolbar.
  nativeObserver = new MutationObserver(records => {
   if (current !== record || nativeTimer !== null) return;
   if (records.every(change => change.target === host || host.contains(change.target))) return;
   nativeTimer = setTimeout(() => {
    nativeTimer = null;if (current === record) prepare();
   }, 80);
  });
  nativeObserver.observe(document.documentElement, {
   childList: true, subtree: true, attributes: true,
   attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
  });
  nativeStop = setTimeout(stopNativeWatch, 3000);
 }
 function prepare() {
  clearTimeout(timer);timer = null;
  const value = readSelection();
  if (!value) { dismissed = null;clearCurrent();return; }
  if (sameSelection(dismissed, value)) { clearCurrent();return; }
  dismissed = null;
  if (!current || !sameSelection(current.value, value)) {
   clearCurrent();if(!createHost())return;
   const record = { value, pending: false, error: null };
   current = record;render(record);watchNative(record);
  } else {
   current.value = value;render(current);
  }
 }
 function schedule() {
  clearTimeout(timer);timer = setTimeout(prepare, 120);
 }
 document.addEventListener('selectionchange', schedule);
 document.addEventListener('mouseup', schedule, true);
 document.addEventListener('pointerup', schedule, true);
 document.addEventListener('keydown', event => { if (event.key === 'Escape') dismiss(); }, true);
 document.addEventListener('keyup', event => { if (event.key !== 'Escape') schedule(); }, true);
 window.addEventListener('scroll', schedule, true);
 window.addEventListener('resize', schedule);
 window.addEventListener('pagehide', dismiss);
 window.addEventListener('popstate', dismiss);
 globalThis.navigation?.addEventListener('currententrychange', dismiss);
})();
