import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
function instrument(name,expr){const src=read(name);if(!src.trimEnd().endsWith('})();'))throw Error('INVALID_TEST_INSTRUMENT_TARGET');return src.replace(/\}\)\(\);\s*$/,expr+'\n})();');}

function scopeHarness(){
 class Node {}
 class Element extends Node {
  constructor(attrs={},visible=true){super();this.attrs=attrs;this.visible=visible;this.isConnected=true;this.parentElement=null;this.children=[];}
  getClientRects(){return this.visible?[{top:0}]:[];}
  getAttribute(name){return this.attrs[name]??null;}
  hasAttribute(name){return Object.hasOwn(this.attrs,name);}
  querySelectorAll(selector){if(selector==='[data-chatgpt-selection-conversation-id]')return this.children.filter(e=>e.hasAttribute('data-chatgpt-selection-conversation-id'));return[];}
  closest(selector){return null;}
  contains(node){return this===node||this.children.includes(node);}
 }
 const state={pathname:'/c/source-A',roots:[]};
 const document={querySelectorAll(selector){return selector==='.thread-scroll-container'?state.roots:selector==='main'?state.roots:[];}};
 const context=vm.createContext({globalThis:null,Node,Element,document,location:{href:'https://chatgpt.com/c/source-A'},getComputedStyle:()=>({display:'block',visibility:'visible'}),TLCore:{chatUrl:url=>({conversationId:url.split('/c/')[1]})}});
 context.globalThis=context;
 vm.runInContext(read('tl-page-scope.js'),context);
 return{context,state,Element};
}

test('active DOM scope refuses stale or conflicting threads; visibility alone stays unverified',()=>{
 const {context,Element,state}=scopeHarness();
 const outgoing=new Element();outgoing.children=[new Element({'data-chatgpt-selection-conversation-id':'source-B'},false)];outgoing.visible=false;
 const active=new Element();active.children=[new Element({'data-chatgpt-selection-conversation-id':'source-A'})];
 state.roots=[outgoing,active];
 assert.equal(context.TLPageScope.current().status,'confirmed');
 assert.equal(context.TLPageScope.current().root,active);
 const second=new Element();second.children=[new Element({'data-chatgpt-selection-conversation-id':'source-A'})];
 state.roots=[active,second];
 assert.equal(context.TLPageScope.current().status,'ambiguous');
 state.roots=[new Element()];
 assert.equal(context.TLPageScope.current().status,'unverified');
 const foreign=new Element();foreign.children=[new Element({'data-chatgpt-selection-conversation-id':'source-B'})];
 state.roots=[foreign];
 assert.equal(context.TLPageScope.current().status,'ambiguous');
});

function injectionHarness(){
 const listeners=[],ctx=vm.createContext({
  globalThis:null,
  chrome:{runtime:{id:'test',onMessage:{addListener(fn){listeners.push(fn);}}}},
  document:{readyState:'loading',addEventListener(){}},
  TLCore:{check:(ok,code)=>{if(!ok)throw Error(code);}},
  ChatFlowProviders:{},
  setTimeout,clearTimeout,URL,File:class{},DataTransfer:class{}
 });
 ctx.globalThis=ctx;
 vm.runInContext(instrument('tl-inject.js','globalThis.__uploadsConfirmed=uploadsConfirmed;'),ctx);
 return ctx.__uploadsConfirmed;
}
function chip(name,{state='ready',visible=true,attribute='data-filename'}={}){
 return{
  getClientRects:()=>visible?[{}]:[],
  offsetParent:null,
  getAttribute:k=>k===attribute?name:k==='data-state'?state:null,
  textContent:name,
  querySelector:()=>null
 };
}
function composer(chips){
 const area={isConnected:true,querySelectorAll:()=>chips};
 return{closest:()=>null,parentElement:area};
}
test('upload confirmation cannot confuse a substring or a different composer with a target',()=>{
 const confirmed=injectionHarness();
 assert.equal(confirmed(['report.pdf'],composer([chip('old-report.pdf')])),false);
 const contradictory=chip('report.pdf');
 contradictory.getAttribute=k=>k==='data-filename'?'old-report.pdf':k==='data-state'?'ready':null;
 assert.equal(confirmed(['report.pdf'],composer([contradictory])),false,'structured filename wins over display text');
 assert.equal(confirmed(['report.pdf'],composer([chip('report.pdf',{attribute:'title'})])),true);
 assert.equal(confirmed(['report.pdf'],composer([chip('report...',{attribute:'title'})])),false);
 assert.equal(confirmed(['report.pdf'],composer([chip('report.pdf')])),true);
 assert.equal(confirmed(['report.pdf','other.pdf'],composer([chip('report.pdf')])),false);
 assert.equal(confirmed(['report.pdf'],composer([chip('report.pdf'),chip('report.pdf')])),false,'duplicate chip is not unique evidence');
 assert.equal(confirmed(['report.pdf'],composer([chip('report.pdf',{state:'uploading'})])),false);
 assert.equal(confirmed(['report.pdf'],composer([])),false);
});

function captureHarness(fetcher,scope){
 const origin='https://chatgpt.com',conversationId='source-A',identity={origin,conversationId};
 const context=vm.createContext({
  globalThis:null,
  URL,URLSearchParams,AbortController,Response,Blob,Uint8Array,TextEncoder,TextDecoder,ReadableStream,setTimeout,clearTimeout,
  document:{},location:{href:origin+'/c/'+conversationId},
  fetch:fetcher,
  TLPageScope:scope||{current:()=>({status:'unavailable',root:null}),contains:()=>false},
  TLCore:{check(ok,code){if(!ok)throw Error(code);},safeName:x=>x},
  ChatFlowProviders:{identify:()=>({identity}),get:()=>({readEndpoint:path=>new URL(path,origin)})},
  chrome:{runtime:{id:'test',onMessage:{addListener(){}}}}
 });
 context.globalThis=context;
 vm.runInContext(instrument('tl-capture.js','globalThis.__capture={json,reconcileVisibleAttachments,setRun(run){active=run;}};'),context);
 const run={source:identity,stopped:false};
 context.__capture.setRun(run);
 return{hooks:context.__capture,run,context};
}
test('API JSON rejects declared and streamed oversized session bodies before parsing',async()=>{
 let fetched=0;
 const badHeader=captureHarness(async()=>{fetched++;return new Response('{}',{headers:{'content-length':'1048577','content-type':'application/json'}});});
 await assert.rejects(badHeader.hooks.json(badHeader.run,'/api/auth/session'),/API_JSON_RESPONSE_TOO_LARGE/);
 assert.equal(fetched,1);
 const tooLong='x'.repeat(1024*1024+1);
 const badBody=captureHarness(async()=>new Response(tooLong,{headers:{'content-type':'application/json'}}));
 await assert.rejects(badBody.hooks.json(badBody.run,'/api/auth/session'),/API_JSON_RESPONSE_TOO_LARGE/);
 const valid=captureHarness(async()=>new Response('{"accessToken":"synthetic"}',{headers:{'content-type':'application/json'}}));
 const obj=await valid.hooks.json(valid.run,'/api/auth/session');
 assert.equal(obj.accessToken,'synthetic');
});
test('DOM attachment reconciliation distinguishes same filenames on different messages',()=>{
 const file={
  getAttribute:k=>k==='download'?'report.pdf':null,
  textContent:'report.pdf',
  closest:()=>owner
 };
 const owner={
  getAttribute:k=>k==='data-message-id'?'message-B':k==='data-message-author-role'?'user':null,
  querySelector:()=>null,
  closest:()=>null
 };
 const scope={root:{querySelectorAll:()=>[file]},status:'confirmed',conversationId:'source-A'};
 const h=captureHarness(async()=>new Response('{}'),{current:()=>scope,contains:()=>true});
 const model={source:{conversationId:'source-A'},messages:[{id:'message-A',nodeId:'node-A'},{id:'message-B',nodeId:'node-B'}],assets:[{name:'report.pdf',messageId:'message-A',nodeId:'node-A',ref:{fileId:'file-A'}}],integrity:{state:'valid',issues:[]}};
 h.hooks.reconcileVisibleAttachments(model);
 assert.equal(model.assets.length,2);
 assert.equal(model.assets[1].messageId,'message-B');
 assert.equal(model.assets[1].state,'unavailable');
 assert.equal(model.integrity.issues[0].code,'VISIBLE_ATTACHMENT_NOT_IN_API');
});
test('unverified DOM attachment scope leaves an issue but invents no file bytes',()=>{
 const scope={root:{querySelectorAll:()=>[{}]},status:'unverified',conversationId:'source-A'};
 const h=captureHarness(async()=>new Response('{}'),{current:()=>scope,contains:()=>true});
 const model={source:{conversationId:'source-A'},messages:[],assets:[],integrity:{state:'valid',issues:[]}};
 h.hooks.reconcileVisibleAttachments(model);
 assert.equal(model.assets.length,0);
 assert.equal(model.integrity.state,'partial');
 assert.equal(model.integrity.issues[0].code,'VISIBLE_ATTACHMENT_SCOPE_UNVERIFIED');
});


test('ambiguous current conversation records a skipped attachment audit without foreign-file attribution',()=>{
 const sc={root:null,status:'ambiguous',conversationId:'source-A'};
 const h=captureHarness(async()=>new Response('{}'),{current:()=>sc,contains:()=>false,isVisible:()=>true});
 h.context.document.querySelectorAll=()=>[{}];
 const model={source:{conversationId:'source-A'},messages:[],assets:[],integrity:{state:'valid',issues:[]}};
 h.hooks.reconcileVisibleAttachments(model);
 assert.equal(model.assets.length,0);
 assert.equal(model.integrity.state,'partial');
 assert.equal(model.integrity.issues[0].code,'VISIBLE_ATTACHMENT_SCOPE_AMBIGUOUS');
});
test('navigation never labels an unidentified DOM node as verified message identity',()=>{
 const node={isConnected:true};
 const context=vm.createContext({
  globalThis:null,
  TLCore:{chatUrl:url=>({url})},
  CFToolkit:{getDomMessageIdCandidates:()=>[]},
  TLPageScope:{current:()=>({root:{},status:'unverified'}),contains:()=>true},
  chrome:{runtime:{id:'test',onMessage:{addListener(){}}}},
  document:{},location:{href:'https://chatgpt.com/c/source-A'},
  URL
 });
 context.globalThis=context;
 vm.runInContext(instrument('tl-tools-page.js','globalThis.__resolve=resolve;'),context);
 const sc={root:{},status:'unverified'};
 const found=context.__resolve({}, {domNode:node,idKnown:false},sc);
 assert.equal(found.confidence,'observed_dom_node');
});

test('navigation cancels on user wheel and restores temporary event listeners',async()=>{
 const handlers=new Map();
 const window={
  addEventListener(type,handler){handlers.set(type,handler);},
  removeEventListener(type,handler){if(handlers.get(type)===handler)handlers.delete(type);}
 };
 let scrollWrites=0;
 const body={};
 const box={clientHeight:500,scrollHeight:2000,parentElement:body,scrollBy(){scrollWrites++;handlers.get('wheel')?.();}};
 const otherElement={
  parentElement:box,isConnected:true,closest:()=>null,
  getBoundingClientRect:()=>({top:20,height:120})
 };
 const root={querySelectorAll:()=>[otherElement]};
 const area={root,status:'confirmed',conversationId:'source-A'};
 const url='https://chatgpt.com/c/source-A';
 const context=vm.createContext({
  globalThis:null,
  TLCore:{chatUrl:()=>({url}),check:(ok,code)=>{if(!ok)throw Error(code);}},
  CFToolkit:{getDomMessageIdCandidates:e=>e===otherElement?['other-message']:[]},
  TLPageScope:{current:()=>area,contains:()=>true},
  chrome:{runtime:{id:'test',onMessage:{addListener(){}}}},
  document:{body,scrollingElement:box},
  location:{href:url},
  getComputedStyle:()=>({overflowY:'auto'}),
  window,performance:{now:()=>1000},setTimeout:fn=>fn(),
  URL
 });
 context.globalThis=context;
 vm.runInContext(instrument('tl-tools-page.js','globalThis.__nav={jump,setLive(s){live=s;}};'),context);
 const target={id:'target-message'},other={id:'other-message'};
 const s={url,closed:false,jump:0,messages:[other,target],status:{textContent:''}};
 context.__nav.setLive(s);
 assert.equal(await context.__nav.jump(s,target),false);
 assert.equal(scrollWrites,1,'no scrolling after a manual wheel event');
 assert.equal(handlers.size,0,'all cancellation listeners must be removed');
});
