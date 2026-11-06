/* New-chat handoff. One explicit attempt; page evidence is not model-read evidence. MIT. */
(() => {
  'use strict';
  if (globalThis.TLInjectInstalled) return;
  globalThis.TLInjectInstalled = true;
  const C = globalThis.TLCore, P = globalThis.ChatFlowProviders, api = chrome;
  const EDITOR_SELECTOR = '#prompt-textarea[contenteditable="true"],textarea#prompt-textarea,[data-testid="composer-text-input"][contenteditable="true"]';
  const CHIP_SELECTOR = '[data-testid="file-chip"],[data-testid="attachment-chip"],[data-testid="file-upload"],[data-file-id]';
  let started = false, experimentPreparing = false, lastExperimentAttempt = null, experimentGestureCleanup = null;
  const noticeTimers = new Map();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const code = error => /^[A-Z0-9_]{2,100}$/.test(error?.message || '') ? error.message : 'HANDOFF_NOT_CONFIRMED';
  async function send(type, data = {}) {
    const response = await api.runtime.sendMessage({ type, ...data });
    if (!response?.ok) throw new Error(response?.code || 'EXTENSION_UNAVAILABLE');
    return response.data;
  }
  function notice(text, kind='handoff') {
    const noticeId=kind==='experiment'?'chatflow-experiment-notice':'chatflow-handoff-notice';
    let el = document.getElementById(noticeId);
    if (!el) {
      el = document.createElement('div'); el.id = noticeId; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;top:10px;right:10px;width:max-content;max-width:min(310px,calc(100vw - 20px));z-index:2147483647;padding:10px 36px 10px 12px;border:1px solid #ccd8e2;border-radius:10px;background:#fff;color:#264259;font:12px/1.5 system-ui;box-shadow:0 4px 16px #142e3422;overflow-wrap:anywhere';
      (document.body || document.documentElement).append(el);
    }
    el.replaceChildren(document.createTextNode(text));
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '关闭 ChatFlow 提示');
    close.style.cssText = 'position:absolute;top:4px;right:5px;min-width:24px;height:24px;border:0;background:transparent;color:#456;cursor:pointer';
    close.addEventListener('click', () => { clearTimeout(noticeTimers.get(noticeId));noticeTimers.delete(noticeId); el.remove(); }); el.append(close);
    clearTimeout(noticeTimers.get(noticeId));
    noticeTimers.set(noticeId,setTimeout(() => { el.remove();noticeTimers.delete(noticeId); }, text.includes('未确认') || text.includes('手动上传') ? 12000 : 4500));
  }
  const visible = el => !!el && !el.closest?.('[hidden],[inert],[aria-hidden="true"]') &&
    (el.getClientRects().length > 0 || el.offsetParent !== null);
  const value = el => el instanceof HTMLTextAreaElement ? el.value : el.innerText || el.textContent || '';
  function editor() {
    const candidates = [...document.querySelectorAll(EDITOR_SELECTOR)].filter(visible);
    C.check(candidates.length === 1, 'COMPOSER_UNAVAILABLE_OR_AMBIGUOUS'); return candidates[0];
  }
  function composerArea(el) {
    const area = el.closest('form') || el.closest('[data-testid="composer"],[data-testid="composer-root"]');
    // Body/main fallback cannot establish which input owns an attachment.
    if (!area || !area.isConnected || area === document.body || area === document.documentElement) return null;
    return area;
  }
  function preflight() {
    P.identify(location.href, { target: true }).identity;
    C.check(!document.querySelector('[data-project-id],[data-testid="temporary-chat-banner"],[data-testid="project-header"]'), 'NON_STANDARD_CHAT');
    C.check(![...document.querySelectorAll('[data-message-author-role="user"],[data-message-author-role="assistant"]')].some(visible), 'EXISTING_CHAT_REJECTED');
    const el = editor(); C.check(!value(el).trim(), 'USER_DRAFT_PRESENT');
    C.check(![...document.querySelectorAll('input[type="file"]')].some(input => input.files?.length), 'USER_FILES_PRESENT');
    C.check(![...document.querySelectorAll(CHIP_SELECTOR)].some(visible), 'USER_FILES_PRESENT'); return el;
  }
  function generalFileInput(el) {
    const area = composerArea(el);
    C.check(area, 'GENERAL_FILE_INPUT_UNAVAILABLE_OR_AMBIGUOUS');
    const candidates = [...document.querySelectorAll('input[type="file"]')].filter(input => {
      if (!area.contains(input) && input.form !== area) return false;
      if (input.disabled || input.hasAttribute('capture')) return false;
      const types = String(input.accept || '').toLowerCase().split(',').map(item => item.trim()).filter(Boolean);
      return !types.length || types.includes('*/*') || types.some(type =>
        type.startsWith('.') && !/^\.(png|jpg|jpeg|gif|webp|heic|mp3|mp4)$/.test(type) || type.startsWith('application/') || type.startsWith('text/'));
    });
    C.check(candidates.length === 1, 'GENERAL_FILE_INPUT_UNAVAILABLE_OR_AMBIGUOUS'); return candidates[0];
  }
  async function receiveFile(handoff, file) {
    const parts = [], hash = new C.SHA256(); let offset = 0;
    while (offset < file.size) {
      P.identify(location.href, { target: true }).identity;
      const result = await send('tl:handoffChunk', { id: handoff.id, index: file.index, offset });
      C.check(result.total === file.size, 'HANDOFF_FILE_SIZE_CHANGED');
      const bytes = C.base64ToBytes(result.data);
      C.check(bytes.length > 0 && offset + bytes.length <= file.size, 'HANDOFF_FILE_TRUNCATED');
      hash.update(bytes); parts.push(bytes); offset += bytes.length;
    }
    C.check(offset === file.size && hash.hex() === file.sha256, 'HANDOFF_FILE_HASH_MISMATCH');
    return new File(parts, file.uploadName || file.name, { type: file.mime || 'application/octet-stream' });
  }
  function prefill(el, text) {
    C.check(!value(el).trim(), 'USER_DRAFT_CHANGED');
    const earlier=document.activeElement;
    el.focus();
    try{
    if (el instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // execCommand is still the established input path for ChatGPT rich editors.
      // Synthetic InputEvent alone does not insert text; final readback is authoritative.
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    C.check(value(el).replace(/\r/g, '').trim() === text.replace(/\r/g, '').trim(), 'PREFILL_NOT_CONFIRMED');
    }finally{if(earlier&&earlier!==el&&earlier.isConnected)earlier.focus({preventScroll:true});}
  }
  function observeFiles(names,composer){
    const area=composerArea(composer),unknown=()=>names.map(()=>({state:'unknown',basis:null}));
    if(!area||!names.length||new Set(names).size!==names.length)return unknown();
    const candidates=area.querySelectorAll(CHIP_SELECTOR);
    if(candidates.length>100)return unknown();
    const chips=[...candidates].filter(visible),used=new Set();
    return names.map(name=>{
      const matches=[];
      for(let i=0;i<chips.length;i++){
        const chip=chips[i],text=chip.getAttribute('data-filename')||chip.getAttribute('title')||chip.textContent;
        if(typeof text==='string'&&text.trim()===name)matches.push(i);
      }
      if(matches.length!==1||used.has(matches[0]))return {state:'unknown',basis:null};
      const i=matches[0],chip=chips[i];used.add(i);
      const state=chip.getAttribute('data-state')||chip.getAttribute('data-status');
      return ['ready','uploaded','complete','success'].includes(state)&&!chip.querySelector('[role="progressbar"],[aria-busy="true"]')?
        {state:'page_ready',basis:'exact_filename_ready'}:{state:'unknown',basis:null};
    });
  }
  function uploadsConfirmed(names,composer){return names.length>0&&observeFiles(names,composer).every(row=>row.state==='page_ready');}
  function observeManualExperimentSend(handoff, el) {
    experimentGestureCleanup?.();
    let armed = true;
    function clear() {
      document.removeEventListener('click', onGesture, true); document.removeEventListener('keydown', onGesture, true);
      globalThis.removeEventListener?.('pagehide',clear);
      if(experimentGestureCleanup===clear)experimentGestureCleanup=null;
    }
    function matches(event) {
      if (!event.isTrusted || !armed || !el.isConnected || value(el).trim() !== handoff.text.trim()) return false;
      if (event.type === 'keydown') return event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey &&
        (event.target === el || el.contains(event.target));
      const button = event.target?.closest?.('button'), area = composerArea(el);
      return !!button && !!area?.contains(button) && !button.disabled &&
        button.matches('[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Send message"],button[aria-label="发送"]');
    }
    async function onGesture(event) {
      if (!matches(event)) return;
      armed = false; clear();
      try { await send('tl:experimentSendIntent', { experimentId: handoff.experimentId, branch: handoff.branch, attemptId: handoff.attemptId }); }
      catch { notice('ChatFlow：无法确认手动发送操作的分支身份。请勿继续采集该分支；不会自动重发。','experiment'); }
    }
    document.addEventListener('click', onGesture, true); document.addEventListener('keydown', onGesture, true);
    experimentGestureCleanup=clear;
    globalThis.addEventListener?.('pagehide', clear, { once: true });
  }
  async function waitForEditor() {
    for (let i = 0; i < 40; i += 1) { try { editor(); return; } catch { await sleep(250); } }
    throw new Error('COMPOSER_NOT_READY');
  }
  async function prepareExperiment() {
    if(experimentPreparing)return;
    experimentPreparing=true;
    let handoff;
    try{
      try{handoff=await send('tl:claimExperimentHandoff');}
      catch(error){notice('ChatFlow：并行分支预填未确认（'+code(error)+'）。请检查目标页；不会自动重试。','experiment');return;}
      if(!handoff)return;
      const attempt=[handoff.experimentId,handoff.branch,handoff.attemptId].join(':');
      if(lastExperimentAttempt===attempt){try{if(value(editor()).trim()===handoff.text.trim())return;}catch{/* next preflight must still verify */}}
      try{
        notice('ChatFlow：正在核验冻结任务。不会自动发送消息。','experiment');
        await waitForEditor();
        const el=preflight();prefill(el,handoff.text);P.identify(location.href,{target:true}).identity;
        C.check(value(el).replace(/\r/g,'').trim()===handoff.text.replace(/\r/g,'').trim(),'PREFILL_NOT_CONFIRMED');
        await send('tl:experimentPrefillAck',{experimentId:handoff.experimentId,branch:handoff.branch,attemptId:handoff.attemptId});
        observeManualExperimentSend(handoff,el);lastExperimentAttempt=attempt;
        notice('ChatFlow：分支 '+handoff.branch+' 的冻结任务已逐字预填。请核对后由你手动发送。','experiment');
      }catch(error){notice('ChatFlow：分支 '+handoff.branch+' 预填未确认（'+code(error)+'）。不会自动发送或重试；请回实验页手动重新预填。','experiment');}
    }finally{experimentPreparing=false;}
  }
  async function prepare() {
    if(started)return;
    let handoff;
    try{handoff=await send('tl:claimHandoff');}
    catch(error){notice('\u65b0\u5bf9\u8bdd\u8eab\u4efd\u672a\u786e\u8ba4\uff08'+code(error)+'\uff09\uff0c\u6ca1\u6709\u6ce8\u5165\u6750\u6599\u3002');return;}
    if(!handoff)return;started=true;
    let attempted=false,evidence=handoff.files.map(file=>({index:file.index,state:'prepared',basis:null}));
    const report=(type,state,reason)=>send(type,{id:handoff.id,attemptId:handoff.attemptId,files:evidence,state,code:reason});
    try{
      await waitForEditor();preflight();
      const files=[];for(const file of handoff.files)files.push(await receiveFile(handoff,file));
      const el=preflight();let input=null,manualReason=null;
      try{input=generalFileInput(el);if(!input.multiple&&files.length!==1)manualReason='FILE_INPUT_IS_SINGLE_ONLY';}
      catch(error){if(code(error)==='GENERAL_FILE_INPUT_UNAVAILABLE_OR_AMBIGUOUS')manualReason=code(error);else throw error;}
      const transfer=new DataTransfer();
      for(const file of files){C.check(file.size>0,'EMPTY_FILE_REJECTED');transfer.items.add(file);}
      prefill(el,handoff.prompt);P.identify(location.href,{target:true}).identity;
      C.check(value(el).trim()===handoff.prompt.trim(),'USER_DRAFT_CHANGED');
      if(manualReason){
        await report('tl:handoffStatus','draft_prepared',manualReason);
        notice('\u8349\u7a3f\u5df2\u51c6\u5907\uff1b\u9875\u9762\u6ca1\u6709\u53ef\u786e\u8ba4\u7684\u9644\u4ef6\u5165\u53e3\uff0c\u8bf7\u4e0b\u8f7d\u540e\u624b\u52a8\u4e0a\u4f20\u3002');return;
      }
      const area=composerArea(el);attempted=true;
      input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
      evidence=evidence.map(row=>({...row,state:'offered'}));
      await report('tl:handoffProgress');
      let confirmed=false;
      for(let i=0;i<32;i++){
        await sleep(250);P.identify(location.href,{target:true}).identity;
        C.check(el.isConnected&&input.isConnected&&editor()===el&&composerArea(el)===area,'COMPOSER_REPLACED');
        evidence=observeFiles(files.map(file=>file.name),el).map((row,index)=>({...row,index:handoff.files[index].index}));
        confirmed=evidence.every(row=>row.state==='page_ready');
        if(confirmed)break;
      }
      await report('tl:handoffStatus',confirmed?'upload_confirmed':'upload_unknown');
      notice((confirmed?'网页显示首批附件就绪（不代表模型已读取）。':'网页未提供足够的附件就绪证据，可能是名称截断或缺少上传状态；请在新聊天人工核对。')+'核对后请手动发送。'+(handoff.remainingBatches?'另有 '+handoff.remainingBatches+' 批待手动补充。':''));
    }catch(error){
      if(attempted)evidence=evidence.map(row=>({...row,state:'unknown',basis:null}));
      try{await report('tl:handoffStatus',attempted?'partial_injection':'injection_blocked',code(error));}
      catch{/* Keep the local warning. A lost reply never becomes a successful receipt. */}
      notice('\u81ea\u52a8\u63a5\u7eed\u672a\u786e\u8ba4\uff08'+code(error)+'\uff09\u3002\u4e0d\u4f1a\u81ea\u52a8\u91cd\u8bd5\u6216\u6e05\u9664\u8349\u7a3f\uff1b\u8bf7\u624b\u52a8\u6838\u5bf9\u3002');
    }
  }
  api.runtime.onMessage.addListener((msg, sender, respond) => {
    if (sender.id !== api.runtime.id) return false;
    if (msg?.type === 'tl:handoffAvailable') { prepare(); respond({ ok: true }); }
    if (msg?.type === 'TL_EXPERIMENT_HANDOFF_READY') { prepareExperiment(); respond({ ok: true }); }
    return false;
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { prepare(); prepareExperiment(); }, { once: true });
  else { prepare(); prepareExperiment(); }
})();
