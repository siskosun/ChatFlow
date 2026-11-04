/* Read-only current ChatGPT DOM scope. Never turns visibility into source identity. MIT. */
(() => {
 'use strict';
 if (globalThis.TLPageScope) return;
 const C=globalThis.TLCore;
 const ID_ATTR='data-chatgpt-selection-conversation-id';
 const isVisible=el=>{
  if (!(el instanceof Element)||!el.isConnected||el.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
  if (!el.getClientRects().length)return false;
  for(let x=el;x instanceof Element;x=x.parentElement){
   const css=getComputedStyle(x);
   if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse')return false;
  }
  return true;
 };
 function conversation(){
  try{return C.chatUrl(location.href).conversationId;}catch{return null;}
 }
 function identities(root){
  const values=new Set();
  if(root.hasAttribute(ID_ATTR))values.add(root.getAttribute(ID_ATTR));
  for(const node of root.querySelectorAll('['+ID_ATTR+']')){
   const id=node.getAttribute(ID_ATTR);
   if(id)values.add(id);
  }
  return values;
 }
 function current(){
  const id=conversation();
  if(!id)return{status:'unavailable',root:null,conversationId:null};
  // Outgoing SPA containers can remain mounted and hidden. Never choose by DOM order.
  const threadCandidates=[...document.querySelectorAll('.thread-scroll-container')];
  const candidates=threadCandidates.length?threadCandidates:[...document.querySelectorAll('main')];
  const visible=candidates.filter(isVisible);
  const matches=[],unknown=[],conflicting=[];
  for(const root of visible){
   const ids=identities(root);
   if(ids.size===1&&ids.has(id))matches.push(root);
   else if(ids.size===0)unknown.push(root);
   else conflicting.push(root);
  }
  if(matches.length===1&&!conflicting.length)return{status:'confirmed',root:matches[0],conversationId:id};
  if(matches.length>1||conflicting.length||visible.length>1)return{status:'ambiguous',root:null,conversationId:id};
  if(unknown.length===1)return{status:'unverified',root:unknown[0],conversationId:id};
  return{status:'unavailable',root:null,conversationId:id};
 }
 function contains(scope,node){
  if(!scope?.root||!(node instanceof Node)||!scope.root.isConnected||!scope.root.contains(node))return false;
  const el=node instanceof Element?node:node.parentElement;
  if(!el||!isVisible(el))return false;
  const closest=el.closest('['+ID_ATTR+']');
  if(closest&&scope.root.contains(closest)&&closest.getAttribute(ID_ATTR)!==scope.conversationId)return false;
  return true;
 }
 globalThis.TLPageScope=Object.freeze({current,contains,isVisible,identities});
})();
