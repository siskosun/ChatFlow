/* Selected-message action beside ChatGPT's own selection UI. Never sends text to a model. MIT. */
(() => {
 'use strict';
 if (globalThis.ChatFlowSelectionActionInstalled) return;
 globalThis.ChatFlowSelectionActionInstalled = true;
 const S = globalThis.TLPageScope, C = globalThis.TLCore;
 let host = null, button = null, timer = null, current = null, busy = false;
 function hide() { if (host) host.hidden = true; current = null; }
 function inChat() { try { C.chatUrl(location.href); return true; } catch { return false; } }
 function prepare() {
  if (!inChat()) { hide(); return; }
  const result = S.selectedMessage(20000);
  if (result.status !== 'selected' || result.tooLong || result.text.trim().length < 2) { hide(); return; }
  const selection = getSelection();
  const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
  if (!rect || (!rect.width && !rect.height)) { hide(); return; }
  current = { text: result.text, url: result.url, evidence: result.evidence, messageId: result.messageId };
  if (!host) {
   host = document.createElement('div');host.id = 'chatflow-selected-action';
   const shadow = host.attachShadow({ mode: 'open' });
   const style = document.createElement('style');
   style.textContent = `:host{all:initial;position:fixed;z-index:2147483646;line-height:1;pointer-events:auto}
   button{font:600 13px/1.35 system-ui,sans-serif;color:#fff;background:#244c8d;border:1px solid #244c8d;border-radius:22px;
    padding:7px 12px;min-width:116px;min-height:35px;box-shadow:0 5px 18px #172c4733;white-space:nowrap;cursor:pointer}
   button:hover{background:#193b75}button:focus-visible{outline:3px solid #89bafd;outline-offset:2px}
   button:disabled{opacity:.65;cursor:progress}`;
   button = document.createElement('button');button.type = 'button';button.textContent = '交给 ChatFlow';
   button.setAttribute('aria-label','使用选中的文字创建 ChatFlow 任务');
   // Keep the user's selection when the floating action gets pointer focus.
   button.addEventListener('pointerdown',event => event.preventDefault());
   button.addEventListener('click',async () => {
    if (busy || !current) return;
    const value = current;busy=true;button.disabled=true;button.textContent='正在打开…';
    try {
     const response = await chrome.runtime.sendMessage({type:'tl:quickSelection',...value});
     if (!response?.ok) throw Error(response?.code || 'SELECTION_OPEN_FAILED');
     hide();
    } catch {
     button.textContent = '打开失败，请点扩展图标';
     setTimeout(() => { if (button) button.textContent = '交给 ChatFlow'; }, 2500);
    } finally { busy=false;button.disabled=false; }
   });
   shadow.append(style,button);document.documentElement.append(host);
  }
  const width = 130, height = 38;
  const x = Math.max(10,Math.min(innerWidth-width-10,rect.right+9 <= innerWidth-width-10 ? rect.right+9 : rect.left));
  const y = Math.max(8,Math.min(innerHeight-height-8,rect.top-height-8 >= 8 ? rect.top-height-8 : rect.bottom+7));
  host.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:2147483646;pointer-events:auto`;
  host.hidden = false;
 }
 function schedule() { if (busy) return;clearTimeout(timer);timer=setTimeout(prepare,120); }
 document.addEventListener('selectionchange',schedule);
 document.addEventListener('mouseup',schedule,true);
 document.addEventListener('keyup',event=>{if(event.key==='Escape')hide();else schedule();},true);
 window.addEventListener('scroll',hide,true);
 window.addEventListener('pagehide',hide);
})();
