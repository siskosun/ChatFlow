/* Narrow, user-triggered page access for Task Loop and optional navigation. MIT. */
(() => {
 'use strict';
 const C=globalThis.TLCore,T=globalThis.TLTasks;
 async function handle(msg,sender,api){
  if(!['tl:taskSource','tl:taskReturn','tl:openTools'].includes(msg.type))return undefined;
  C.check(sender?.id===api.runtime.id&&String(sender.url||'').startsWith(api.runtime.getURL('workspace/')),'WORKSPACE_ONLY');
  if(msg.type==='tl:taskReturn'){
   const raw=await TLTaskStore.get(msg.taskId);C.check(raw,'TASK_NOT_FOUND');const task=T.validateTask(raw);
   let windowId=sender.tab?.windowId;
   if(!Number.isInteger(windowId)){
    C.check(Number.isInteger(msg.windowId)&&Number.isInteger(msg.activeTabId),'WORKSPACE_WINDOW_REQUIRED');
    const active=await api.tabs.get(msg.activeTabId);
    C.check(active?.windowId===msg.windowId&&active.active===true,'WORKSPACE_WINDOW_REQUIRED');
    windowId=msg.windowId;
   }
   // Never accept a return URL from the external result or alter an existing draft.
   const tabs=await api.tabs.query({windowId});
   const existing=tabs.find(tab=>{try{const s=C.chatUrl(tab.url);return s.origin===task.source.origin&&s.conversationId===task.source.conversationId&&s.url===task.source.url;}catch{return false;}});
   if(existing){const now=await api.tabs.get(existing.id);C.check(C.chatUrl(now.url).url===task.source.url,'TASK_SOURCE_CHANGED');await api.tabs.update(existing.id,{active:true});await api.windows.update(windowId,{focused:true});return{tabId:existing.id,state:'source_opened_not_sent'};}
   const tab=await api.tabs.create({windowId,url:task.source.url,active:true});return{tabId:tab.id,state:'source_opened_not_sent'};
  }
  C.check(Number.isInteger(msg.tabId),'INVALID_TAB_ID');
  const before=await api.tabs.get(msg.tabId),identity=C.chatUrl(before.url);
  C.check(typeof msg.expectedUrl==='string'&&identity.url===msg.expectedUrl,'TASK_SOURCE_CHANGED');
  if(msg.type==='tl:openTools'){
   await api.scripting.executeScript({target:{tabId:msg.tabId},files:['src/tl-core.js','src/tl-provider.js','src/tl-page-scope.js','src/toolkit-port.js','src/tl-tools-page.js']});
   const after=C.chatUrl((await api.tabs.get(msg.tabId)).url);C.check(after.url===identity.url,'TASK_SOURCE_CHANGED');
   const response=await api.tabs.sendMessage(msg.tabId,{type:'tl:showTools',url:identity.url});C.check(response?.ok,'TOOLS_PAGE_CHANGED');
   await api.tabs.update(msg.tabId,{active:true});return{opened:true};
  }
  await api.scripting.executeScript({target:{tabId:msg.tabId},files:['src/tl-page-scope.js']});
  const read=await api.scripting.executeScript({target:{tabId:msg.tabId},func:()=>{
   const scope=globalThis.TLPageScope?.current(),selection=window.getSelection(),anchor=selection?.anchorNode?.parentElement;
   const message=anchor?.closest('[data-message-id],[data-turn-key],[data-message-author-role]');
   const focus=selection?.focusNode;
   const safe=!!scope?.root&&scope.status!=='ambiguous'&&globalThis.TLPageScope.contains(scope,anchor)&&globalThis.TLPageScope.contains(scope,focus);
   const same=safe&&message&&message.contains(focus)&&globalThis.TLPageScope.contains(scope,message);
   const text=same?String(selection).slice(0,20001):'';
   const verified=same&&scope.status==='confirmed';
   return{url:location.origin+location.pathname,title:document.title,text,messageId:verified?(message.getAttribute('data-message-id')||null):null,nodeId:verified?(message.getAttribute('data-node-id')||null):null,selectionEvidence:verified?'confirmed':same?'page_observed':'unavailable'};
  }});
  const row=read.find(x=>x.frameId===0),data=row?.result;
  C.check(data&&data.url===identity.url,'TASK_SOURCE_CHANGED');
  const after=C.chatUrl((await api.tabs.get(msg.tabId)).url);C.check(after.url===identity.url,'TASK_SOURCE_CHANGED');
  const selectionTooLong=typeof data.text==='string'&&data.text.length>T.LIMITS.task;
  // The page probe reads at most limit+1 as an overflow sentinel. Never expose
  // that prefix as if it were a complete selection that the user can save.
  return{source:T.source({...identity,title:data.title,messageId:data.messageId,nodeId:data.nodeId}),selection:selectionTooLong?'':data.text,selectionTooLong,documentId:row.documentId||null};
 }
 globalThis.TLTaskService=Object.freeze({handle});
})();
