import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
const core=fs.readFileSync(new URL('../src/tl-core.js',import.meta.url),'utf8');
const provider=fs.readFileSync(new URL('../src/tl-provider.js',import.meta.url),'utf8');
const service=fs.readFileSync(new URL('../src/tl-service.js',import.meta.url),'utf8');
async function harness({navigationFails=false,navigationGate=null,bootFailures=0}={}){
 const records=new Map([['handoff',{id:'handoff',captureId:'capture',state:'prepared',prompt:'Test',files:[{name:'history.md',size:1,sha256:'a'.repeat(64)}],batches:[[0]],missing:[]}]]),events=[],tabs=new Map(),panelBehaviors=[];
 const store={get:async(name,key)=>structuredClone(records.get(key)),all:async name=>name==='handoffs'?[...records.values()].map(x=>structuredClone(x)):[],
  handoffsForCapture:async captureId=>[...records.values()].filter(x=>x.captureId===captureId).map(x=>structuredClone(x)),
  pruneHandoffs:async()=>0,
  set:async(name,value)=>{records.set(value.id,structuredClone(value));events.push('persist:'+value.state);},recover:async()=>{}};
 const event=()=>({addListener(){}});
 const api={runtime:{id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:event()},storage:{session:{get:async()=>{if(bootFailures-->0)throw Error('IDB_UPGRADE_BLOCKED_CLOSE_OTHER_WINDOWS');return{};},set:async()=>{}}},action:{onClicked:{addListener(){throw Error('Legacy full-page action handler must not be registered');}}},sidePanel:{setPanelBehavior:async options=>{panelBehaviors.push({...options});}},scripting:{executeScript:async()=>{}},permissions:{contains:async()=>true},
  windows:{create:async()=>{throw Error('WINDOW_CREATION_NOT_ALLOWED');},update:async()=>{}},
  tabs:{onUpdated:event(),onRemoved:event(),create:async options=>{assert.equal(options.url,'about:blank');assert.equal(options.windowId,9);assert.equal(options.active,true);events.push('create-tab');const tab={id:17,windowId:9,url:'about:blank',status:'complete'};tabs.set(17,tab);return tab;},get:async id=>tabs.get(id),query:async()=>[],sendMessage:async()=>{events.push('announce');},update:async(id,options)=>{const h=records.get('handoff');assert.equal(h.targetTabId,id);assert.equal(h.state,'target_opened');events.push('navigate');if(navigationGate)await navigationGate;if(navigationFails)throw Error('network failure');tabs.set(id,{...tabs.get(id),url:options.url,status:'loading'});return tabs.get(id);}}
 };
 const context=vm.createContext({console,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,ArrayBuffer,Blob,AbortController,setTimeout,clearTimeout,crypto:webcrypto,atob,btoa,chrome:api,TLStore:store,TLDiagnostics:{record:async(operation,error)=>{events.push('diagnostic:'+operation+':'+error.message);return true;}},ChatFlowExperimentService:{handle:async()=>undefined,recover:async()=>{},onTabUpdated:async()=>{},onTabRemoved:async()=>{},onCaptureFinished:async()=>{}},importScripts(){},structuredClone});
 vm.runInContext(core,context);
 vm.runInContext(provider,context);
 vm.runInContext(service+'\n globalThis.TEST_BOUNDARY={openHandoff,claim,targetHandoff,handle,sourceRun,runs,boot};',context);
 await context.TEST_BOUNDARY.boot;
 return{...context.TEST_BOUNDARY,events,records,tabs,api,panelBehaviors};
}
const workspaceSender={id:'extension',url:'chrome-extension://extension/workspace/index.html',tab:{id:10,windowId:9,url:'chrome-extension://extension/workspace/index.html'}};
const panelSender={id:'extension',url:'chrome-extension://extension/workspace/index.html'};
test('toolbar action registers native side panel rather than creating a full-page workspace tab',async()=>{
 const h=await harness();await Promise.resolve();
 assert.deepEqual(h.panelBehaviors,[{openPanelOnActionClick:true}]);
 assert.equal(h.events.filter(x=>x==='create-tab').length,0);
});
test('side panel handoff opens a ChatGPT tab in the validated browser window',async()=>{
 const h=await harness();h.tabs.set(11,{id:11,windowId:9,active:true,url:'https://chatgpt.com/'});
 const result=await h.handle({type:'tl:openHandoff',id:'handoff',windowId:9,activeTabId:11},panelSender);
 assert.equal(result.targetWindowId,9);assert.equal(h.tabs.get(17).url,'https://chatgpt.com/');
});
test('side panel handoff fails closed with forged or stale active-window context',async()=>{
 const h=await harness();h.tabs.set(11,{id:11,windowId:9,active:true,url:'https://chatgpt.com/'});
 for(const bad of [{windowId:10,activeTabId:11},{windowId:9,activeTabId:12},{windowId:9,activeTabId:0}])
  await assert.rejects(h.handle({type:'tl:openHandoff',id:'handoff',...bad},panelSender),/WORKSPACE_WINDOW_REQUIRED|Cannot read/);
 assert.equal(h.events.length,0);
});
test('new chat opens as a tab in the workspace window after handoff ownership is persisted',async()=>{
 const h=await harness(),result=await h.openHandoff('handoff',workspaceSender);
 assert.equal(result.targetTabId,17);assert.equal(result.targetWindowId,9);
 assert.deepEqual(h.events,['create-tab','persist:target_opened','navigate']);
 assert.equal(h.tabs.get(17).url,'https://chatgpt.com/');assert.equal(h.tabs.get(17).windowId,9);
});
test('concurrent double-click opens exactly one target tab',async()=>{
 const h=await harness(),results=await Promise.allSettled([h.openHandoff('handoff',workspaceSender),h.openHandoff('handoff',workspaceSender)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.match(results.find(x=>x.status==='rejected').reason.message,/HANDOFF_ALREADY_OPENED/);
 assert.equal(h.events.filter(x=>x==='create-tab').length,1);
});
test('navigation uncertainty is persisted and never automatically retried',async()=>{
 const h=await harness({navigationFails:true});
 await assert.rejects(h.openHandoff('handoff',workspaceSender),/TARGET_NAVIGATION_UNCONFIRMED/);
 assert.equal(h.records.get('handoff').state,'injection_blocked');
 await assert.rejects(h.openHandoff('handoff',workspaceSender),/HANDOFF_ALREADY_OPENED/);
 assert.equal(h.events.filter(x=>x==='navigate').length,1);
 assert.ok(h.events.includes('diagnostic:handoff-inject:TARGET_NAVIGATION_UNCONFIRMED'));
});
test('only the first claim for the exact new tab and document succeeds',async()=>{
 const h=await harness();await h.openHandoff('handoff',workspaceSender);
 const sender={id:'extension',tab:{id:17,url:'https://chatgpt.com/'},url:'https://chatgpt.com/',documentId:'doc-one'};
 const results=await Promise.all([h.claim(sender),h.claim(sender)]);
 assert.equal(results.filter(Boolean).length,1);assert.equal(h.records.get('handoff').targetDocumentId,'doc-one');
 assert.equal(await h.claim({...sender,documentId:'doc-reloaded'}),null);
});
test('ordinary existing ChatGPT pages without a handoff are silent no-ops',async()=>{
 const h=await harness(),url='https://chatgpt.com/c/existing_conversation_12345';
 const result=await h.claim({id:'extension',url,tab:{id:88,url,windowId:9},documentId:'existing-doc'});
 assert.equal(result,null);
 assert.equal(h.events.length,0);
});
test('handoff file reads reject a different tab, document and existing conversation',async()=>{
 const h=await harness();await h.openHandoff('handoff',workspaceSender);
 const sender={id:'extension',tab:{id:17,url:'https://chatgpt.com/'},url:'https://chatgpt.com/',documentId:'doc-one'};await h.claim(sender);
 await assert.rejects(h.targetHandoff({id:'handoff'},{...sender,documentId:'different'}),/HANDOFF_TARGET_MISMATCH/);
 await assert.rejects(h.targetHandoff({id:'handoff'},{...sender,tab:{id:19}}),/HANDOFF_TARGET_MISMATCH/);
 await assert.rejects(h.targetHandoff({id:'handoff'},{...sender,url:'https://chatgpt.com/c/existing_chat_123'}),/NOT_NEW_NORMAL_CHAT/);
});
test('source-page callers cannot start captures or prepare handoffs through workspace commands',async()=>{
 const h=await harness(),sender={id:'extension',tab:{id:17},url:'https://chatgpt.com/'};
 for(const type of ['tl:start','tl:prepareHandoff','tl:openHandoff'])await assert.rejects(h.handle({type,id:'handoff'},sender),/WORKSPACE_ONLY/);
 await assert.rejects(h.handle({type:'tl:sources'},{id:'other-extension',url:'chrome-extension://extension/workspace/index.html'}),/FOREIGN_EXTENSION/);
});

test('capture accepts stale same-origin sender document URL after same-document SPA routing, not a foreign route',async()=>{
 const h=await harness(),conversationId='conversation_new123456789',nonce='capture_nonce_123456789';
 h.tabs.set(42,{id:42,url:'https://chatgpt.com/c/'+conversationId});
 const run={nonce,tabId:42,source:{origin:'https://chatgpt.com',conversationId},captureId:'capture123',documentId:'doc-42',cancelled:false};
 h.runs.set(nonce,run);
 const sender={id:'extension',tab:{id:42,url:'https://chatgpt.com/'},url:'https://chatgpt.com/',documentId:'doc-42'};
 assert.equal(await h.sourceRun({nonce},sender),run);
 await assert.rejects(h.sourceRun({nonce},{...sender,documentId:'doc-foreign'}),/SOURCE_DOCUMENT_CHANGED/);
 await assert.rejects(h.sourceRun({nonce},{...sender,url:'https://attacker.invalid/'}),/SOURCE_ORIGIN_CHANGED/);
 h.tabs.get(42).url='https://chatgpt.com/c/another_conversation_123456';
 await assert.rejects(h.sourceRun({nonce},sender),/SOURCE_NAVIGATED/);
});


test('prepared handoff rejects changed or deleted source before opening any tab',async()=>{
 const h=await harness(),snapshot={assets:[],source:{conversationId:'conversation_test'},messages:[]};
 h.records.set('capture',{id:'capture',snapshot});
 h.records.get('handoff').snapshotHash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
 h.records.get('capture').snapshot.messages.push({id:'new'});
 await assert.rejects(h.openHandoff('handoff',workspaceSender),/HANDOFF_SOURCE_CHANGED_REGENERATE/);
 assert.equal(h.events.includes('create-tab'),false);
 h.records.delete('capture');
 await assert.rejects(h.openHandoff('handoff',workspaceSender),/HANDOFF_SOURCE_DELETED/);
 assert.equal(h.events.includes('create-tab'),false);
});
test('unchanged prepared source remains eligible for a user-requested handoff',async()=>{
 const h=await harness(),snapshot={assets:[],messages:[]};
 h.records.set('capture',{id:'capture',snapshot});
 h.records.get('handoff').snapshotHash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
 const result=await h.openHandoff('handoff',workspaceSender);
 assert.equal(result.targetTabId,17);
});

test('failed navigation cannot clobber a concurrently arriving target claim',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);
 const h=await harness({navigationFails:true,navigationGate:gate});
 const opening=h.openHandoff('handoff',workspaceSender);
 for(let i=0;i<60&&!h.events.includes('navigate');i++)await new Promise(r=>setTimeout(r,1));
 assert.ok(h.events.includes('navigate'));
 const sender={id:'extension',url:'https://chatgpt.com/',tab:{id:17,url:'https://chatgpt.com/'},documentId:'doc-one'};
 const claiming=h.claim(sender);
 release();
 await assert.rejects(opening,/TARGET_NAVIGATION_UNCONFIRMED/);
 assert.equal(await claiming,null,'a failed opening must never be overwritten by a stale claim');
 assert.equal(h.records.get('handoff').state,'injection_blocked');
 assert.equal(h.records.get('handoff').targetDocumentId,null);
});

test('trusted workspace explicitly retries a transient failed startup without replaying user operations',async()=>{
 const h=await harness({bootFailures:1});
 await assert.rejects(h.handle({type:'tl:sources'},workspaceSender),/IDB_UPGRADE_BLOCKED_CLOSE_OTHER_WINDOWS/);
 const [one,two]=await Promise.all([h.handle({type:'tl:retryBoot'},workspaceSender),h.handle({type:'tl:retryBoot'},workspaceSender)]);
 assert.equal(one.ready,true);assert.equal(two.ready,true);
 assert.deepEqual(await h.handle({type:'tl:sources'},workspaceSender),[]);
 await assert.rejects(h.handle({type:'tl:retryBoot'},{id:'other',url:workspaceSender.url}),/FOREIGN_EXTENSION/);
 await assert.rejects(h.handle({type:'tl:retryBoot'},{id:'extension',url:'https://chatgpt.com/'}),/WORKSPACE_ONLY/);
});
