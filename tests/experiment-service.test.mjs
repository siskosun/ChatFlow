import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
import {webcrypto} from 'node:crypto';
import Core from '../src/experiment-core.js';

function harness(){
 const records=new Map(),session=new Map(),local=new Map(),tabs=new Map(),created=[],updated=[],sent=[];
 let nextTab=20;
 const DB={
  async create(row){if(records.has(row.id))throw Error('duplicate');records.set(row.id,structuredClone(row));},
  async createImported(row){if(records.has(row.id))throw Error('duplicate');records.set(row.id,structuredClone(row));},
  async read(id){return structuredClone(records.get(id)||null);},
  async list(){return [...records.values()].map(x=>structuredClone(x));},
  async update(id,revision,reducer){const before=records.get(id);if(!before)throw Error('not found');assert.equal(before.revision,revision);const after=reducer(structuredClone(before));records.set(id,structuredClone(after));return structuredClone(after);}
 };
 const api={
  runtime:{id:'chatflow-test',getURL:p=>'chrome-extension://chatflow-test/'+p},
  storage:{
   local:{async get(k){return {[k]:local.get(k)};},async set(v){for(const [k,x] of Object.entries(v))local.set(k,x);}},
   session:{async get(k){if(k==null)return Object.fromEntries(session);return {[k]:session.get(k)};},async set(v){for(const [k,x] of Object.entries(v))session.set(k,x);},async remove(...keys){for(const k of keys.flat())session.delete(k);}}
  },
  tabs:{
   async create(opts){const id=nextTab++;created.push({id,opts});tabs.set(id,{id,url:'about:blank'});return{id};},
   async update(id,patch){const t=tabs.get(id);Object.assign(t,patch);updated.push({id,patch});return t;},
   async get(id){if(!tabs.has(id))throw Error('tab missing');return tabs.get(id);},
   async sendMessage(id,msg){sent.push({id,type:msg.type});return{ok:true};}
  }
 };
 const TLCore={chatUrl(raw,{target=false}={}){const u=new URL(raw);if(target){assert.equal(u.pathname,'/');return{origin:u.origin,url:u.href,conversationId:null};}const m=u.pathname.match(/\/c\/([^/]+)/);if(!m)throw Error('NO_CONVERSATION_ID');return{origin:u.origin,url:u.origin+u.pathname,conversationId:m[1]};}};
 const context=vm.createContext({chrome:api,globalThis:null,ChatFlowExperimentCore:Core,ChatFlowExperimentDB:DB,TLCore,crypto:webcrypto,structuredClone,Date,Promise,URL,TextEncoder,Error,console});
 context.globalThis=context;
 vm.runInContext(fs.readFileSync(path.join(root,'src/experiment-service.js'),'utf8'),context);
 const service=context.ChatFlowExperimentService;
 const pageSender={id:'chatflow-test',url:'chrome-extension://chatflow-test/workspace/experiments.html'};
 const startCapture=async({tabId})=>({captureId:'capture-'+tabId});
 async function msg(type,data={},sender=pageSender){return service.handle({type,...data},sender,api,{startCapture});}
 return{service,api,DB,records,session,tabs,created,updated,sent,pageSender,msg};
}

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
  const sender={id:'chatflow-test',url:'https://chatgpt.com/',tab:{id:tabId,url:'https://chatgpt.com/'}};
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
  const tabId=launch.tabIds[branch],conversationId='conversation'+branch+'1234567890',sender={id:'chatflow-test',url:'https://chatgpt.com/c/'+conversationId,tab:{id:tabId,url:'https://chatgpt.com/c/'+conversationId}};
  await h.service.handle({type:'tl:claimExperimentHandoff'}, {id:'chatflow-test',url:'https://chatgpt.com/',tab:{id:tabId,url:'https://chatgpt.com/'}},h.api,{});
  await h.service.handle({type:'tl:experimentPrefillAck',experimentId:created.id,branch,attemptId:launch.attemptIds[branch]},{id:'chatflow-test',url:'https://chatgpt.com/',tab:{id:tabId,url:'https://chatgpt.com/'}},h.api,{});
  h.tabs.get(tabId).url=sender.url;
  const cap=await h.msg('FF_CAPTURE',{experimentId:created.id,branch});
  const bindKey='chatflow_exp_capture_'+cap.runId,bind=h.session.get(bindKey);assert.ok(bind);
  const row=await h.DB.read(created.id),frozen=row.frozen.text;
  const snapshot={source:{conversationId},integrity:{state:'valid'},messages:[
   {id:'user-'+branch,role:'user',text:frozen,nodeId:'u'},
   {id:'assistant-'+branch,role:'assistant',text:'final answer '+branch,finished:true,nodeId:'a'}
  ]};
  await h.service.onCaptureFinished({captureId:cap.runId}, {get:async()=>({snapshot})},h.api);
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
