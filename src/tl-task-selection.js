/* User-armed, document-scoped selection relay. Never persists or sends a task. MIT. */
(() => {
 'use strict';
 if(globalThis.ChatFlowTaskSelectionInstalled)return;
 globalThis.ChatFlowTaskSelectionInstalled=true;
 const C=globalThis.TLCore,S=globalThis.TLPageScope;
 const MAX=20000;
 chrome.runtime.onConnect.addListener(port=>{
  if(port.name!=='chatflow:task-selection')return;
  let expected=null,timer=null,active=false,previous='';
  const stop=()=>{
   active=false;clearTimeout(timer);timer=null;
   document.removeEventListener('selectionchange',schedule);
   window.removeEventListener('pagehide',stop);
  };
  const send=record=>{try{port.postMessage(record);}catch{stop();}};
  function read(){
   if(!active)return;
   if(location.origin+location.pathname!==expected){
    send({type:'stopped',reason:'source-changed'});stop();return;
   }
   const lease=S.freeze();
   // A uniquely visible thread without an explicit DOM conversation marker
   // is usable as a user-selected draft, but never claimed as verified.
   if(!lease.root||!['confirmed','unverified'].includes(lease.status))return;
   const selection=window.getSelection();
   if(!selection||selection.isCollapsed||!selection.anchorNode||!selection.focusNode)return;
   const anchor=selection.anchorNode,focus=selection.focusNode;
   const el=anchor instanceof Element?anchor:anchor.parentElement;
   const message=el?.closest('[data-message-id],[data-turn-key],[data-message-author-role]');
   if(!message||!message.contains(focus)||
      !S.contains(lease,anchor)||!S.contains(lease,focus)||!S.contains(lease,message))return;
   const value=String(selection);
   if(!value.trim()||!S.unchanged(lease))return;
   const tooLong=value.length>MAX;
   const fingerprint=lease.generation+'|'+(message.getAttribute('data-message-id')||'')+'|'+value;
   if(fingerprint===previous)return;
   previous=fingerprint;
   send({type:'selection',url:expected,
    text:tooLong?'':value,length:value.length,tooLong,
    evidence:lease.status==='confirmed'?'confirmed':'unverified',
    messageId:message.getAttribute('data-message-id')||null});
  }
  function schedule(){if(!active)return;clearTimeout(timer);timer=setTimeout(read,180);}
  port.onMessage.addListener(msg=>{
   if(msg?.type!=='watch'||active)return;
   try{
    if(typeof msg.expectedUrl!=='string'||C.chatUrl(msg.expectedUrl).url!==msg.expectedUrl||
       location.origin+location.pathname!==msg.expectedUrl)throw Error('SOURCE_CHANGED');
   }catch{send({type:'stopped',reason:'source-changed'});stop();return;}
   expected=msg.expectedUrl;active=true;
   document.addEventListener('selectionchange',schedule);
   window.addEventListener('pagehide',stop,{once:true});
   schedule(); // Also accept an existing selection after a user presses Read.
  });
  port.onDisconnect.addListener(stop);
 });
})();
