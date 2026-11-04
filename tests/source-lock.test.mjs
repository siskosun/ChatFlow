import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const A='https://chatgpt.com/c/source_conversation_A',B='https://chatgpt.com/c/source_conversation_B';
async function harness(){
 const records=new Map(),events=[],page={id:7,url:A,title:'A',documentId:'document-A'},listeners={};
 const event=()=>({addListener(){}}),store={get:async(_,key)=>structuredClone(records.get(key)),all:async()=>[],assets:async()=>[],set:async(_,v)=>{records.set(v.id,structuredClone(v));events.push(['write',v]);},recover:async()=>{}};
 const api={runtime:{id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener(fn){listeners.service=fn;}}},action:{onClicked:event()},sidePanel:{setPanelBehavior:async()=>{}},storage:{session:{get:async()=>({}),set:async()=>{}}},
  tabs:{get:async()=>({...page}),query:async()=>[{...page}],onUpdated:event(),onRemoved:event(),sendMessage:async(id,msg,options)=>{events.push(['send',msg,options]);assert.equal(id,7);if(options.documentId!==page.documentId)throw Error('SOURCE_DOCUMENT_CHANGED');if(msg.expectedSource?.url!==page.url)return{ok:false,code:'SOURCE_CONVERSATION_CHANGED'};return{ok:true};}},
  scripting:{executeScript:async options=>{events.push(['probe',options.target]);if(options.target.documentIds&&!options.target.documentIds.includes(page.documentId))throw Error('missing document');return[{frameId:0,documentId:page.documentId,result:page.url}];}}
 };
 const env=vm.createContext({console,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,ArrayBuffer,Blob,AbortController,setTimeout,clearTimeout,crypto:webcrypto,atob,btoa,chrome:api,TLStore:store,ChatFlowExperimentService:{handle:async()=>undefined,recover:async()=>{}},importScripts(){},structuredClone});
 for(const name of ['tl-core','tl-provider'])vm.runInContext(read('src/'+name+'.js'),env);
 vm.runInContext(read('src/tl-service.js')+'\n globalThis.h={handle,freezeSource,startCapture,sourceRun,stopCapture,boot,runs};',env);await env.h.boot;
 return{...env.h,records,events,page,api,store};
}
const sender={id:'extension',url:'chrome-extension://extension/workspace/index.html'};
test('ordinary capture requires a frozen source before creating any archive',async()=>{
 const h=await harness();await assert.rejects(h.startCapture({tabId:7}),/SOURCE_LOCK_REQUIRED/);assert.equal(h.records.size,0);
 await assert.rejects(h.handle({type:'tl:freezeSource',tabId:7,expectedUrl:A},{id:'extension',url:A}),/WORKSPACE_ONLY/);
});
test('A-to-B change while asynchronous UI work runs cannot save B',async()=>{
 const h=await harness(),locked=await h.freezeSource({tabId:7,expectedUrl:A});h.page.url=B;
 await assert.rejects(h.startCapture(locked),/SOURCE_CONVERSATION_CHANGED/);assert.equal(h.records.size,0);assert.equal(h.events.some(x=>x[0]==='send'),false);
});
test('a stale selection is refused even before the initial source freeze',async()=>{
 const h=await harness();h.page.url=B;await assert.rejects(h.freezeSource({tabId:7,expectedUrl:A}),/SOURCE_CONVERSATION_CHANGED/);assert.equal(h.records.size,0);
});
test('same conversation reloaded in a different document cannot inherit a capture',async()=>{
 const h=await harness(),locked=await h.freezeSource({tabId:7,expectedUrl:A});h.page.documentId='replacement-document';
 await assert.rejects(h.startCapture(locked),/SOURCE_DOCUMENT_CHANGED/);assert.equal(h.records.size,0);
});
test('navigation after metadata persistence is rejected at the exact-document content boundary',async()=>{
 const h=await harness(),locked=await h.freezeSource({tabId:7,expectedUrl:A}),set=h.store.set;
 h.store.set=async(...args)=>{await set(...args);h.page.url=B;};
 await assert.rejects(h.startCapture(locked),/SOURCE_CONVERSATION_CHANGED/);
 assert.equal(h.runs.size,0);const records=[...h.records.values()];assert.equal(records.length,1);assert.equal(records[0].source.url,A);assert.equal(records[0].snapshot,null);assert.equal(records[0].lastError,'SOURCE_CONVERSATION_CHANGED');
});
test('successful capture pins identity and document and serializes competing starts',async()=>{
 const h=await harness(),locked=await h.freezeSource({tabId:7,expectedUrl:A});
 const result=await Promise.allSettled([h.startCapture(locked),h.startCapture(locked)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.match(result.find(r=>r.status==='rejected').reason.message,/SOURCE_ALREADY_RUNNING/);
 const send=h.events.find(x=>x[0]==='send');assert.equal(send[1].expectedSource.url,A);assert.equal(send[2].documentId,'document-A');assert.equal([...h.runs.values()][0].documentId,'document-A');
});
test('a source lookup that resolves after Stop cannot resurrect a cancelled capture',async()=>{
 const h=await harness(),locked=await h.freezeSource({tabId:7,expectedUrl:A}),{captureId}=await h.startCapture(locked),run=[...h.runs.values()][0];
 let release,entered;const barrier=new Promise(r=>{release=r;}),lookup=new Promise(r=>{entered=r;});h.api.tabs.get=async()=>{entered();await barrier;return{...h.page};};
 const pending=h.sourceRun({nonce:run.nonce},{id:'extension',url:A,tab:{id:7,url:A},documentId:'document-A'});await lookup;await h.stopCapture(captureId);release();
 await assert.rejects(pending,/CAPTURE_SESSION_NOT_FOUND/);assert.equal(h.records.get(captureId).state,'cancelled');assert.equal(h.runs.size,0);
});
test('Stop drains an in-flight snapshot write before committing cancelled state',async()=>{
 const h=await harness(),locked=await h.freezeSource({tabId:7,expectedUrl:A}),{captureId}=await h.startCapture(locked),run=[...h.runs.values()][0];
 let release,entered;const barrier=new Promise(r=>{release=r;}),writing=new Promise(r=>{entered=r;});
 h.store.snapshot=async(id,snapshot)=>{entered();await barrier;h.records.set(id,{...h.records.get(id),snapshot,state:'capturing'});};
 const pending=h.handle({type:'tl:snapshot',nonce:run.nonce,snapshot:{source:locked.source}},{id:'extension',url:A,tab:{id:7,url:A},documentId:'document-A'});await writing;
 const stop=h.stopCapture(captureId);release();await Promise.all([pending,stop]);assert.equal(h.records.get(captureId).state,'cancelled');assert.equal(h.runs.size,0);
});
