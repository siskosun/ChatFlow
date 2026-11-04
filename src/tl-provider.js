/* Provider boundary. Unknown providers are explicitly unsupported; no speculative DOM/API probing. */
(() => {
 'use strict';
 const C=globalThis.TLCore;
 const registry=new Map();
 function register(adapter){
  C.check(adapter&&typeof adapter.id==='string'&&typeof adapter.identify==='function','INVALID_PROVIDER_ADAPTER');
  C.check(!registry.has(adapter.id),'DUPLICATE_PROVIDER_ADAPTER');
  registry.set(adapter.id,Object.freeze(adapter));
 }
 function chatIdentity(raw,options={}){return C.chatUrl(raw,options);}
 function readEndpoint(path,source){
  C.check(source&&typeof source.origin==='string'&&typeof source.conversationId==='string','INVALID_PROVIDER_SOURCE');
  const u=new URL(path,source.origin),conversationPath='/backend-api/conversation/'+encodeURIComponent(source.conversationId);
  C.check(u.origin===source.origin,'CROSS_ORIGIN_AUTH_REQUEST_REJECTED');
  C.check(u.pathname==='/api/auth/session'||u.pathname===conversationPath||u.pathname.startsWith(conversationPath+'/')||u.pathname.startsWith('/backend-api/files/'),'UNSUPPORTED_READ_ENDPOINT');
  C.readOnlyRequest('GET');
  return u;
 }
 register({
  id:'chatgpt',
  label:'ChatGPT',
  hosts:Object.freeze(['chatgpt.com','chat.openai.com']),
  identify:chatIdentity,
  readEndpoint,
  mediaUrl:C.mediaUrl,
  capabilities:Object.freeze({
   conversationRead:true,visibleBranchRead:true,attachmentBytes:true,
   archiveRestore:true,newChatPrefill:true,manualSendOnly:true,
   uploadConfirmation:'page_observation_only',modelReadConfirmation:false,
   supported:true
  })
 });
 function get(id){return registry.get(id)||null;}
 function forUrl(raw){
  let u;try{u=new URL(raw);}catch{return null;}
  for(const adapter of registry.values())if(adapter.hosts.includes(u.hostname))return adapter;
  return null;
 }
 function identify(raw,options={}){
  const adapter=forUrl(raw);
  C.check(adapter,'UNSUPPORTED_PROVIDER');
  return{provider:adapter.id,adapter,identity:adapter.identify(raw,options)};
 }
 function capabilityMatrix(){
  return [...registry.values()].map(a=>({id:a.id,label:a.label,capabilities:{...a.capabilities}}));
 }
 globalThis.ChatFlowProviders=Object.freeze({get,forUrl,identify,capabilityMatrix,registered:()=>[...registry.keys()]});
})();
