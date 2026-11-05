/* User-armed, document-scoped selection relay. Never persists or sends a task. MIT. */
(() => {
 'use strict';
 if(globalThis.ChatFlowTaskSelectionInstalled)return;
 globalThis.ChatFlowTaskSelectionInstalled=true;
 const C=globalThis.TLCore,S=globalThis.TLPageScope;
 const MAX=20000;
 chrome.runtime.onConnect.addListener(port=>{
  if(port.name!=='chatflow:task-selection')return;
  let expected=null,timer=null,active=false,previous='',lastHint='';
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
   const record=S.selectedMessage(MAX);
   if(record.status==='empty')return;
   if(record.status!=='selected'){
    const reason=record.reason==='scope-unavailable'?'scope-unavailable':'single-message';
    if(lastHint!==reason){send({type:'hint',reason});lastHint=reason;}
    return;
   }
   lastHint='';
   const fingerprint=record.generation+'|'+(record.messageId||'')+'|'+record.text;
   if(fingerprint===previous)return;
   previous=fingerprint;
   send({type:'selection',url:expected,
    text:record.text,length:record.length,tooLong:record.tooLong,
    evidence:record.evidence,messageId:record.messageId});
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
