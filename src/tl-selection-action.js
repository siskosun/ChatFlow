/* Selected-message action beside ChatGPT's own selection UI. Never sends text to a model. MIT. */
(() => {
 'use strict';
 if (globalThis.ChatFlowSelectionActionInstalled) return;
 globalThis.ChatFlowSelectionActionInstalled = true;
 const S = globalThis.TLPageScope, C = globalThis.TLCore;
 let host = null, button = null, timer = null, current = null, busy = false;
 function hide() { if (host) host.hidden = true; current = null; }
 function inChat() { try { C.chatUrl(location.href); return true; } catch { return false; } }
 // ChatGPT owns its native quote popover. Place an INDEPENDENT action beside
 // the visible Ask ChatGPT control when it is exposed in the page DOM, without
 // editing React-owned markup or treating the quote control as source evidence.
 function adjacentNativeButton(selectionRect) {
  const controls=document.querySelectorAll('button,[role="button"]');
  let best=null,score=Infinity;
  for(let i=0;i<Math.min(controls.length,450);i++){
   const el=controls[i],label=(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\s+/g,' ');
   if(!/^(向\s*ChatGPT\s*提问|Ask\s*ChatGPT)$/i.test(label))continue;
   if(el.closest('#chatflow-selected-action'))continue;
   const r=el.getBoundingClientRect();
   if(r.width<20||r.height<20||r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)continue;
   const distance=Math.hypot(Math.max(0,r.left-selectionRect.right,selectionRect.left-r.right),Math.max(0,r.top-selectionRect.bottom,selectionRect.top-r.bottom));
   if(distance<180&&distance<score){best=r;score=distance;}
  }
  return best;
 }

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
   :host([hidden]){display:none!important}
   button{font:800 13px/1.35 system-ui,sans-serif;color:#11100e;background:#ff7a66;border:1.5px solid #11100e;border-radius:10px;
    padding:8px 12px;min-width:118px;min-height:36px;box-shadow:3px 3px 0 #11100e;white-space:nowrap;cursor:pointer}
   button:hover{background:#ffa08f;transform:translate(1px,1px);box-shadow:2px 2px 0 #11100e}
   button:focus-visible{outline:3px solid #8369ef;outline-offset:3px}
   button:disabled{opacity:.65;cursor:progress;box-shadow:none}`;
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
  if(rect.bottom<0||rect.top>innerHeight){hide();return;}
  const width=144,height=42,pad=10,native=adjacentNativeButton(rect);
  const idealX=native?(native.right+8+width<innerWidth-pad?native.right+8:native.left-width-8):
    (rect.right+10+width<innerWidth-pad?rect.right+10:rect.left-width-10);
  const idealY=native?native.top:(rect.top-height-9>=pad?rect.top-height-9:rect.bottom+9);
  const x=Math.max(pad,Math.min(innerWidth-width-pad,idealX));
  const y=Math.max(pad,Math.min(innerHeight-height-pad,idealY));
  host.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:2147483646;pointer-events:auto`;
  host.hidden = false;
 }
 function schedule() { if (busy) return;clearTimeout(timer);timer=setTimeout(prepare,120); }
 document.addEventListener('selectionchange',schedule);
 document.addEventListener('mouseup',schedule,true);
 document.addEventListener('pointerup',()=>{schedule();setTimeout(schedule,300);},true);
 document.addEventListener('keyup',event=>{if(event.key==='Escape')hide();else schedule();},true);
 window.addEventListener('scroll',schedule,true);
 window.addEventListener('pagehide',hide);
})();
