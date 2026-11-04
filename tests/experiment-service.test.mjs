import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
import {webcrypto} from 'node:crypto';
import Core from '../src/experiment-core.js';

function harness({failCreateAt=0,failNavigateAt=0}={}){
 const records=new Map(),session=new Map(),local=new Map(),tabs=new Map(),created=[],updated=[],sent=[],captureCalls=[];
 let nextTab=20,createCount=0,navigateCount=0;const revisions=[];
 const DB={
  async create(row){if(records.has(row.id))throw Error('duplicate');records.set(row.id,structuredClone(row));},
  async createImported(row){if(records.has(row.id))throw Error('duplicate');records.set(row.id,structuredClone(row));},
  async read(id){return structuredClone(records.get(id)||null);},
  async list(){return [...records.values()].map(x=>structuredClone(x));},
  async update(id,revision,reducer,steps=1){const before=records.get(id);if(!before)throw Error('not found');assert.equal(before.revision,revision);const after=reducer(structuredClone(before));if(after.revision!==before.revision)assert.equal(after.revision,before.revision+steps);revisions.push({id,steps,before:before.revision,after:after.revision});records.set(id,structuredClone(after));return structuredClone(after);}
 };
 const api={
  runtime:{id:'chatflow-test',getURL:p=>'chrome-extension://chatflow-test/'+p},
  storage:{
   local:{async get(k){return {[k]:local.get(k)};},async set(v){for(const [k,x] of Object.entries(v))local.set(k,x);}},
   session:{async get(k){if(k==null)return Object.fromEntries(session);return {[k]:session.get(k)};},async set(v){for(const [k,x] of Object.entries(v))session.set(k,x);},async remove(...keys){for(const k of keys.flat())session.delete(k);}}
  },
  tabs:{
   async create(opts){createCount++;if(failCreateAt===createCount)throw Error('CREATE_FAILED');const id=nextTab++;created.push({id,opts});tabs.set(id,{id,url:'about:blank',documentId:'doc-'+id});return{id};},
   async update(id,patch){if(patch.url&&++navigateCount===failNavigateAt)throw Error('NAVIGATION_FAILED');const t=tabs.get(id);Object.assign(t,patch);updated.push({id,patch});return t;},
   async remove(id){tabs.delete(id);},
   async get(id){if(!tabs.has(id))throw Error('tab missing');return tabs.get(id);},
   async sendMessage(id,msg){sent.push({id,type:msg.type});return{ok:true};}
  },
  scripting:{async executeScript({target}){
   const tab=tabs.get(target.tabId);
   if(!tab)throw Error('missing document');
   return[{frameId:0,documentId:tab.documentId,result:tab.url}];
  }}
 };
 const TLCore={chatUrl(raw,{target=false}={}){const u=new URL(raw);if(target){if(u.pathname!=='/')throw Error('NOT_NEW_NORMAL_CHAT');return{origin:u.origin,url:u.href,conversationId:null};}const m=u.pathname.match(/\/c\/([^/]+)/);if(!m)throw Error('NO_CONVERSATION_ID');return{origin:u.origin,url:u.origin+u.pathname,conversationId:m[1]};}};
 const provider={identify:(raw,options={})=>({identity:TLCore.chatUrl(raw,options)}),get:id=>({mediaUrl:TLCore.mediaUrl})};
 const context=vm.createContext({chrome:api,ChatFlowProviders:provider,TLCore,ChatFlowExperimentCore:Core,ChatFlowExperimentDB:DB,crypto:webcrypto,structuredClone,Date,Promise,URL,TextEncoder,Error,console});
 context.globalThis=context;
 vm.runInContext(fs.readFileSync(path.join(root,'src/experiment-service.js'),'utf8'),context);
 const service=context.ChatFlowExperimentService;
 const pageSender={id:'chatflow-test',url:'chrome-extension://chatflow-test/workspace/experiments.html',tab:{id:99,windowId:1,url:'chrome-extension://chatflow-test/workspace/experiments.html'}};
 const startCapture=async(options)=>{captureCalls.push(options);return{captureId:'capture-'+options.tabId};};
 async function msg(type,data={},sender=pageSender){return service.handle({type,...data},sender,api,{startCapture});}
 const sourceSender=tabId=>({id:'chatflow-test',url:'https://chatgpt.com/',tab:{id:tabId,url:'https://chatgpt.com/'},documentId:tabs.get(tabId).documentId});
 async function prefill(created,launch,branch){
  const tabId=launch.tabIds[branch],sender=sourceSender(tabId);
  await service.handle({type:'tl:claimExperimentHandoff'},sender,api,{});
  await service.handle({type:'tl:experimentPrefillAck',experimentId:created.id,branch,attemptId:launch.attemptIds[branch]},sender,api,{});
  return tabId;
 }
 async function observeSend(created,launch,branch){
  const tabId=launch.tabIds[branch];
  return service.handle({type:'tl:experimentSendIntent',experimentId:created.id,branch,attemptId:launch.attemptIds[branch]},sourceSender(tabId),api,{});
 }
 async function navigate(tabId,conversationId){
  const url='https://chatgpt.com/c/'+conversationId;
  tabs.get(tabId).url=url;
  await service.onTabUpdated(api,tabId,{url});
 }
 return{service,api,DB,records,session,tabs,created,updated,revisions,sent,captureCalls,pageSender,msg,sourceSender,prefill,observeSend,navigate};
}

test('ordinary conversation pages without a pending experiment handoff do not raise NOT_NEW_NORMAL_CHAT',async()=>{
 const h=harness(),url='https://chatgpt.com/c/existing_conversation_12345';
 h.tabs.set(88,{id:88,url,documentId:'doc-88'});
 const sender={id:'chatflow-test',url,tab:{id:88,url,windowId:1},documentId:'doc-88'};
 const result=await h.service.handle({type:'tl:claimExperimentHandoff'},sender,h.api,{});
 assert.equal(result,null);
});
test('a pending experiment handoff remains restricted to a normal new-chat page',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const created=await h.msg('FF_CREATE',{operationId:'create_target_guard',w0:'W',p:'P'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:created.id,operationId:'launch_target_guard'});
 const tabId=launch.tabIds.A,tab=h.tabs.get(tabId),url='https://chatgpt.com/c/existing_conversation_12345';
 tab.url=url;
 const sender={...h.sourceSender(tabId),url,tab:{...h.sourceSender(tabId).tab,url}};
 await assert.rejects(h.service.handle({type:'tl:claimExperimentHandoff'},sender,h.api,{}),/NOT_NEW_NORMAL_CHAT/);
 tab.url='https://chatgpt.com/';
 const claimed=await h.service.handle({type:'tl:claimExperimentHandoff'},h.sourceSender(tabId),h.api,{});
 assert.equal(claimed.branch,'A');
});
test('K=4 experiment freezes shared input, opens inactive tabs and only prefills',async()=>{
 const h=harness();
 await assert.rejects(h.msg('FF_CREATE',{operationId:'create_00001',w0:'W0',p:'P'}),/EXPERIMENTS_DISABLED/);
 await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const created=await h.msg('FF_CREATE',{operationId:'create_00001',branchCount:4,w0:'shared source material',p:'same task'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:created.id,operationId:'launch_00001'});
 assert.equal(launch.branchCount,4);assert.equal(h.created.length,4);
 for(const tab of h.created)assert.equal(tab.opts.active,false);
 assert.equal(h.updated.filter(x=>x.patch.url==='https://chatgpt.com/').length,4);
 assert.equal(h.sent.every(x=>x.type==='TL_EXPERIMENT_HANDOFF_READY'),true);
 for(const [branch,tabId] of Object.entries(launch.tabIds)){
  const sender=h.sourceSender(tabId);
  const intent=await h.service.handle({type:'tl:claimExperimentHandoff'},sender,h.api,{});
  assert.equal(intent.branch,branch);assert.ok(intent.text.includes('shared source material'));
  const ack=await h.service.handle({type:'tl:experimentPrefillAck',experimentId:created.id,branch,attemptId:launch.attemptIds[branch]},sender,h.api,{});
  assert.equal(ack.branches[branch].phase,'awaiting_send');
 }
 assert.equal(h.sent.some(x=>/SEND|CLICK/.test(x.type)),false);
});

test('branch completion requires exact input, finished assistant evidence and persisted complete capture',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const created=await h.msg('FF_CREATE',{operationId:'create_00002',branchCount:2,w0:'material',p:'task'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:created.id,operationId:'launch_00002'});
 for(const branch of ['A','B']){
  const conversationId='conversation'+branch+'1234567890',tabId=await h.prefill(created,launch,branch);
  await h.observeSend(created,launch,branch);
  await h.navigate(tabId,conversationId);
  const cap=await h.msg('FF_CAPTURE',{experimentId:created.id,branch});
  assert.equal(h.captureCalls.at(-1).expectedDocumentId,'doc-'+tabId);
  assert.equal(h.captureCalls.at(-1).expectedConversationId,conversationId);
  const bindKey='chatflow_exp_capture_'+cap.runId,bind=h.session.get(bindKey);assert.ok(bind);
  const row=await h.DB.read(created.id),frozen=row.frozen.text;
  const snapshot={source:{conversationId,origin:'https://chatgpt.com'},integrity:{state:'valid'},messages:[
   {id:'user-'+branch,role:'user',text:frozen,nodeId:'u',timestamp:Date.now()/1000},
   {id:'assistant-'+branch,role:'assistant',text:'final answer '+branch,finished:true,nodeId:'a',timestamp:Date.now()/1000}
  ]};
  await h.service.onCaptureFinished({captureId:cap.runId,tabId,documentId:'doc-'+tabId}, {get:async()=>({state:'ready',snapshot})},h.api);
 }
 const row=await h.DB.read(created.id);
 assert.equal(row.branches.A.status,'done');assert.equal(row.branches.B.status,'done');
 assert.equal(row.branches.A.attempts[0].evidence.inputLevel,'exact');
 const comparison=await h.msg('FF_COMPARE',{experimentId:created.id,operationId:'compare_0002'});
 assert.ok(comparison.mapping);assert.equal(comparison.budgetParity,undefined);
});

test('manual UI cannot mark a branch done and unknown states are not replayed',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const created=await h.msg('FF_CREATE',{operationId:'create_00003',w0:'W',p:'P'});
 await assert.rejects(h.msg('FF_RECORD',{experimentId:created.id,branch:'A',expectedRevision:0,operationId:'manual_done1',attemptId:'att_fake001',status:'done'}),/MANUAL_DONE_NOT_ALLOWED/);
});

test('browser restart with lost session binding marks a pending branch unknown without replay',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const created=await h.msg('FF_CREATE',{operationId:'create_00004',branchCount:2,w0:'W',p:'P'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:created.id,operationId:'launch_00004'});
 const tabId=launch.tabIds.A;
 await h.api.storage.session.remove('chatflow_experiment_bind_'+tabId);
 await h.service.recover(h.api,{get:async()=>null});
 const row=await h.DB.read(created.id);
 assert.equal(row.branches.A.status,'unknown');
 assert.equal(h.updated.some(x=>x.patch.url==='https://chatgpt.com/'),true);
 assert.equal(h.sent.filter(x=>x.type==='TL_EXPERIMENT_HANDOFF_READY').length,2);
});


test('capture without observed first new-chat navigation becomes unknown instead of capturing an arbitrary chat',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const c=await h.msg('FF_CREATE',{operationId:'create_guard1',w0:'W',p:'P'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:c.id,operationId:'launch_guard1'});
 const tabId=await h.prefill(c,launch,'A');
 h.tabs.get(tabId).url='https://chatgpt.com/c/untracked12345678';
 await assert.rejects(h.msg('FF_CAPTURE',{experimentId:c.id,branch:'A'}),/EXPERIMENT_CONVERSATION_UNVERIFIED/);
 assert.equal(h.captureCalls.length,0);
 assert.equal((await h.DB.read(c.id)).branches.A.status,'unknown');
});

test('prefilled branch rejects navigation from its first conversation to another even if the prompt matches',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const c=await h.msg('FF_CREATE',{operationId:'create_guard2',w0:'W',p:'P'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:c.id,operationId:'launch_guard2'});
 const tabId=await h.prefill(c,launch,'A');
 await h.observeSend(c,launch,'A');
 await h.navigate(tabId,'firstConversation1234');
 assert.equal((await h.DB.read(c.id)).branches.A.attempts[0].evidence.firstConversationId,'firstConversation1234');
 await h.navigate(tabId,'foreignConversation1234');
 assert.equal((await h.DB.read(c.id)).branches.A.status,'unknown');
 await assert.rejects(h.msg('FF_CAPTURE',{experimentId:c.id,branch:'A'}),/NO_PENDING_BRANCH_TAB/);
 assert.equal(h.captureCalls.length,0);
});

test('prefill acknowledgment from a different document marks the branch unknown',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const c=await h.msg('FF_CREATE',{operationId:'create_guard3',w0:'W',p:'P'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:c.id,operationId:'launch_guard3'});
 const tabId=launch.tabIds.A,sender=h.sourceSender(tabId);
 await h.service.handle({type:'tl:claimExperimentHandoff'},sender,h.api,{});
 await assert.rejects(h.service.handle({type:'tl:experimentPrefillAck',experimentId:c.id,branch:'A',attemptId:launch.attemptIds.A},{...sender,documentId:'new-document'},h.api,{}),/EXPERIMENT_DOCUMENT_CHANGED/);
 assert.equal((await h.DB.read(c.id)).branches.A.status,'unknown');
});

test('capture detects document navigation after prefill without starting a read',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const c=await h.msg('FF_CREATE',{operationId:'create_guard4',w0:'W',p:'P'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:c.id,operationId:'launch_guard4'});
 const tabId=await h.prefill(c,launch,'A');
 await h.observeSend(c,launch,'A');
 await h.navigate(tabId,'firstConversation1234');
 h.tabs.get(tabId).documentId='new-document';
 await assert.rejects(h.msg('FF_CAPTURE',{experimentId:c.id,branch:'A'}),/EXPERIMENT_CAPTURE_IDENTITY_MISMATCH/);
 assert.equal(h.captureCalls.length,0);
 assert.equal((await h.DB.read(c.id)).branches.A.status,'unknown');
});

test('a completed capture cannot mark the wrong document or conversation done after a route change',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const c=await h.msg('FF_CREATE',{operationId:'create_guard5',w0:'W',p:'P'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:c.id,operationId:'launch_guard5'});
 const tabId=await h.prefill(c,launch,'A');
 await h.observeSend(c,launch,'A');
 await h.navigate(tabId,'firstConversation1234');
 const cap=await h.msg('FF_CAPTURE',{experimentId:c.id,branch:'A'});
 const frozen=(await h.DB.read(c.id)).frozen.text;
 await h.navigate(tabId,'foreignConversation1234');
 const snapshot={source:{conversationId:'foreignConversation1234',origin:'https://chatgpt.com'},integrity:{state:'valid'},messages:[
  {id:'user',role:'user',text:frozen},{id:'assistant',role:'assistant',text:'looks done',finished:true}
 ]};
 await h.service.onCaptureFinished({captureId:cap.runId,tabId,documentId:'doc-'+tabId},{get:async()=>({state:'ready',snapshot})},h.api);
 assert.equal((await h.DB.read(c.id)).branches.A.status,'unknown');
});


test('first conversation navigation without observed manual send intent is rejected',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const c=await h.msg('FF_CREATE',{operationId:'create_guard6',w0:'W',p:'P'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:c.id,operationId:'launch_guard6'});
 const tabId=await h.prefill(c,launch,'A');
 await h.navigate(tabId,'foreignConversation1234');
 assert.equal((await h.DB.read(c.id)).branches.A.status,'unknown');
 await assert.rejects(h.msg('FF_CAPTURE',{experimentId:c.id,branch:'A'}),/NO_PENDING_BRANCH_TAB/);
 assert.equal(h.captureCalls.length,0);
});

test('matching frozen input from an old conversation cannot count as a newly sent response',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const c=await h.msg('FF_CREATE',{operationId:'create_old_chat1',w0:'W',p:'P'});
 const launch=await h.msg('FF_LAUNCH',{experimentId:c.id,operationId:'launch_old_chat1'});
 const tabId=await h.prefill(c,launch,'A');
 await h.observeSend(c,launch,'A');
 await h.navigate(tabId,'oldConversation12345');
 const cap=await h.msg('FF_CAPTURE',{experimentId:c.id,branch:'A'});
 const frozen=(await h.DB.read(c.id)).frozen.text;
 const snapshot={source:{origin:'https://chatgpt.com',conversationId:'oldConversation12345'},integrity:{state:'valid'},messages:[
  {id:'old-user',role:'user',text:frozen,timestamp:1700000000},
  {id:'old-answer',role:'assistant',text:'an already-finished answer',finished:true,timestamp:1700000001}
 ]};
 await h.service.onCaptureFinished({captureId:cap.runId,tabId,documentId:'doc-'+tabId},{get:async()=>({state:'ready',snapshot})},h.api);
 const row=await h.DB.read(c.id);
 assert.equal(row.branches.A.status,'unknown');
 assert.equal(row.branches.A.attempts[0].evidence.sendTimestampVerified,false);
});

test('all K branches are atomically recorded before any navigation, using the source experiment window',async()=>{
 const h=harness();await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const c=await h.msg('FF_CREATE',{operationId:'create_atomic_guard',branchCount:4,w0:'material',p:'one task'});
 const launched=await h.msg('FF_LAUNCH',{experimentId:c.id,operationId:'launch_atomic_guard'});
 assert.equal(launched.branchCount,4);
 assert.equal(h.revisions.filter(r=>r.steps===4).length,1,'all branches share one transaction');
 assert.ok(h.created.every(x=>x.opts.windowId===1&&x.opts.active===false));
});
test('second tab navigation failure marks all branches unknown and cleans bindings and tabs',async()=>{
 const h=harness({failNavigateAt:2});await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const c=await h.msg('FF_CREATE',{operationId:'create_nav_failure',branchCount:3,w0:'material',p:'one task'});
 await assert.rejects(h.msg('FF_LAUNCH',{experimentId:c.id,operationId:'launch_nav_failure'}),/NAVIGATION_FAILED/);
 const row=await h.DB.read(c.id);
 assert.equal(row.revision,6,'launch and terminalization each commit one K-operation transaction');
 assert.ok(Object.values(row.branches).every(b=>b.status==='unknown'));
 assert.equal(h.tabs.size,0,'failed tabs removed');
 assert.ok([...h.session.keys()].every(k=>!k.startsWith('chatflow_experiment_bind_')&&!k.startsWith('tl_experiment_handoff_')));
 assert.equal(h.sent.length,0,'no followup prefill after failure');
});
test('tab creation failure leaves experiment unchanged and closes any earlier blank tab',async()=>{
 const h=harness({failCreateAt:2});await h.msg('FF_SET_ENABLED',{enabled:true,ack:'local-only-no-send'});
 const c=await h.msg('FF_CREATE',{operationId:'create_tab_failure',branchCount:3,w0:'material',p:'one task'});
 await assert.rejects(h.msg('FF_LAUNCH',{experimentId:c.id,operationId:'launch_tab_failure'}),/CREATE_FAILED/);
 const row=await h.DB.read(c.id);
 assert.equal(row.revision,0);
 assert.ok(Object.values(row.branches).every(b=>b.attempts.length===0));
 assert.equal(h.tabs.size,0);
});
