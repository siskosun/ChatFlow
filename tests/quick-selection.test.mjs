import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/tl-service.js','utf8');
const start=source.indexOf("const QUICK_SELECTION_KEY = 'cfPendingSelectedTask';");
const end=source.indexOf('\nasync function handle(',start);
assert.ok(start>=0&&end>start,'Quick action source is required');
const functions=source.slice(start,end);
const url='https://chatgpt.com/c/test-1234';
const otherUrl='https://chatgpt.com/c/other-5678';
const workspaceSender={id:'ext',url:'chrome-extension://ext/workspace/index.html'};
const context={windowId:7,activeTabId:42};
const sender=(tabId=42,windowId=7,sourceUrl=url)=>({id:'ext',tab:{id:tabId,windowId,url:sourceUrl},url:sourceUrl,documentId:'doc-'+tabId});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
 const pending=new Map(),events=[],tabs=new Map([[42,{id:42,windowId:7,active:true,url}],[84,{id:84,windowId:8,active:true,url:otherUrl}]]);
 let nextNonce=0,now=Date.now(),open=()=>Promise.resolve(),probe=null;
 const C={check(ok,code){if(!ok)throw Error(code);},id:()=> 'nonce-'+(++nextNonce),
  chatUrl(value){const match=/^https:\/\/chatgpt\.com\/c\/([a-z0-9-]+)\/?$/.exec(value);
   if(!match)throw Error('NOT_CHATGPT');return {url:'https://chatgpt.com/c/'+match[1],conversationId:match[1]};}};
 const api={
  tabs:{get:async id=>{events.push('get-tab');if(!tabs.has(id))throw Error('TAB_CLOSED');return {...tabs.get(id)};}},
  sidePanel:{open({tabId}){events.push('open-panel');return open(tabId);}},
  storage:{session:{
   get:async key=>({[key]:pending.get(key)}),
   set:async value=>{events.push('persist');for(const [key,val]of Object.entries(value))pending.set(key,val);},
   remove:async key=>{events.push('remove');pending.delete(key);}
  }},
  scripting:{executeScript:async query=>{
   events.push('verify-document');
   if(probe){const run=probe;probe=null;await run(query);}
   const tab=tabs.get(query.target.tabId);
   return [{frameId:0,documentId:tab?.documentId||'doc-'+query.target.tabId,result:{url:tab?.url,generation:tab?.generation??0}}];
  }}
 };
 const ctx=vm.createContext({api,C,Date:{now:()=>now},trusted:caller=>caller.id==='ext',
  workspace:caller=>{if(caller.id!=='ext'||caller.url!==workspaceSender.url)throw Error('WORKSPACE_ONLY');},
  workspaceWindow:async(msg,caller)=>{
   if(Number.isInteger(caller.tab?.windowId))return caller.tab.windowId;
   const tab=tabs.get(msg?.activeTabId);
   if(!tab?.active||tab.windowId!==msg.windowId)throw Error('WORKSPACE_WINDOW_REQUIRED');
   return msg.windowId;
  }});
 const ops=vm.runInContext(functions+'\n({quickSelection,claimQuickSelection,ackQuickSelection})',ctx);
 return {...ops,events,api,tabs,pending,stored:(windowId=7)=>pending.get('cfPendingSelectedTask:'+windowId),
  setOpen:fn=>{open=fn;},setProbe:fn=>{probe=fn;},advance:ms=>{now+=ms;}};
}
test('inline action opens before awaits, preserves exact document, and never sends',async()=>{
 const f=fixture();const result=await f.quickSelection({text:'synthetic selected',url,evidence:'unverified',messageId:'untrusted',generation:0},sender());
 assert.equal(result.opened,true);
 assert.equal(f.events[0],'open-panel');
 assert.ok(f.events.indexOf('open-panel')<f.events.indexOf('persist'));
 assert.equal(f.stored().text,'synthetic selected');assert.equal(f.stored().windowId,7);
 assert.equal(f.stored().documentId,'doc-42');assert.equal(f.stored().messageId,null);
 assert.ok(!f.events.some(x=>x.includes('send')));
});
test('only current exact document and source generation can claim a pending draft',async()=>{
 const f=fixture();await f.quickSelection({text:'synthetic selected',url,evidence:'confirmed',messageId:'m99',generation:0},sender());
 const value=await f.claimQuickSelection(context,workspaceSender);
 assert.equal(value.documentId,'doc-42');assert.equal(value.messageId,'m99');
 f.tabs.get(42).documentId='doc-reloaded';
 assert.equal(await f.claimQuickSelection(context,workspaceSender),null);
 f.tabs.get(42).documentId='doc-42';f.tabs.get(42).generation=2;
 assert.equal(await f.claimQuickSelection(context,workspaceSender),null);
});
test('two windows retain independent drafts and acknowledgements',async()=>{
 const f=fixture();
 await f.quickSelection({text:'window seven',url},sender());
 await f.quickSelection({text:'window eight',url:otherUrl},sender(84,8,otherUrl));
 const a=await f.claimQuickSelection(context,workspaceSender);
 const b=await f.claimQuickSelection({windowId:8,activeTabId:84},workspaceSender);
 assert.equal(a.text,'window seven');assert.equal(b.text,'window eight');
 const wrong=await f.ackQuickSelection({...context,nonce:b.nonce},workspaceSender);
 assert.equal(wrong.acknowledged,false);assert.equal(f.stored(8).text,'window eight');
 const direct=await f.claimQuickSelection({windowId:8,activeTabId:84},{...workspaceSender,tab:{windowId:7}});
 assert.equal(direct.text,'window seven');
 const done=await f.ackQuickSelection({...context,nonce:a.nonce},workspaceSender);
 assert.equal(done.acknowledged,true);assert.equal(f.stored(),undefined);assert.equal(f.stored(8).text,'window eight');
});
test('a late failed open cannot remove a newer successful selection',async()=>{
 const f=fixture(),gate=deferred();let calls=0;
 f.setOpen(()=>++calls===1?gate.promise:Promise.resolve());
 const old=f.quickSelection({text:'old',url},sender()).catch(e=>e);
 await new Promise(setImmediate);
 await f.quickSelection({text:'new',url},sender());
 gate.reject(Error('panel unavailable'));
 assert.match((await old).message,/SELECTION_OPEN_FAILED/);
 assert.equal(f.stored().text,'new');
});
test('a late successful open cannot overwrite the newer selection',async()=>{
 const f=fixture(),gate=deferred();let calls=0;
 f.setOpen(()=>++calls===1?gate.promise:Promise.resolve());
 const old=f.quickSelection({text:'old',url},sender()).catch(e=>e);
 await new Promise(setImmediate);await f.quickSelection({text:'new',url},sender());
 gate.resolve();
 assert.match((await old).message,/QUICK_SELECTION_SUPERSEDED/);
 assert.equal(f.stored().text,'new');
});
test('slow claim and stale ack cannot return or consume a replaced nonce',async()=>{
 const f=fixture();await f.quickSelection({text:'old',url},sender());
 const oldNonce=f.stored().nonce,gate=deferred(),entered=deferred();
 f.setProbe(async()=>{entered.resolve();await gate.promise;});
 const oldClaim=f.claimQuickSelection(context,workspaceSender);await entered.promise;
 await f.quickSelection({text:'new',url},sender());gate.resolve();
 assert.equal(await oldClaim,null);
 assert.equal(await f.claimQuickSelection({...context,nonce:oldNonce},workspaceSender),null);
 assert.equal((await f.ackQuickSelection({...context,nonce:oldNonce},workspaceSender)).acknowledged,false);
 assert.equal(f.stored().text,'new');
});
test('moved tabs and foreign workspace context are not allowed to claim',async()=>{
 const f=fixture();await f.quickSelection({text:'selected',url},sender());
 f.tabs.get(42).windowId=8;
 assert.equal(await f.claimQuickSelection({}, {...workspaceSender,tab:{windowId:7}}),null);
 await assert.rejects(f.claimQuickSelection({windowId:7,activeTabId:84},workspaceSender),/WORKSPACE_WINDOW_REQUIRED/);
 await assert.rejects(f.claimQuickSelection(context,{...workspaceSender,id:'foreign'}),/WORKSPACE_ONLY/);
});
test('foreign senders, mismatched URLs, invalid text and expired drafts are rejected',async()=>{
 const f=fixture();
 await assert.rejects(f.quickSelection({text:'valid',url},{...sender(),id:'foreign'}),/SOURCE_LOCK_REQUIRED/);
 await assert.rejects(f.quickSelection({text:'valid',url:otherUrl},sender()),/TASK_SOURCE_CHANGED/);
 await assert.rejects(f.quickSelection({text:'',url},sender()),/TASK_TEXT_LIMIT/);
 await f.quickSelection({text:'valid',url},sender());f.advance(90001);
 assert.equal(await f.claimQuickSelection(context,workspaceSender),null);assert.equal(f.stored(),undefined);
});

test('starting a newer selection immediately blocks an old pending claim while open is unresolved',async()=>{
 const f=fixture();await f.quickSelection({text:'old',url},sender());
 const oldNonce=f.stored().nonce,gate=deferred();
 f.setOpen(()=>gate.promise);
 const next=f.quickSelection({text:'new',url},sender()).catch(e=>e);
 assert.equal(await f.claimQuickSelection({...context,nonce:oldNonce},workspaceSender),null);
 await new Promise(setImmediate);
 assert.equal(await f.claimQuickSelection(context,workspaceSender),null);
 gate.reject(Error('panel unavailable'));
 assert.match((await next).message,/SELECTION_OPEN_FAILED/);
 assert.equal(f.stored(),undefined,'failed new request must not resurrect older pending text');
});
test('a new in-flight request invalidates a document probe already claiming the old selection',async()=>{
 const f=fixture();await f.quickSelection({text:'old',url},sender());
 const probeGate=deferred(),entered=deferred(),openGate=deferred();
 f.setProbe(async()=>{entered.resolve();await probeGate.promise;});
 const claiming=f.claimQuickSelection(context,workspaceSender);await entered.promise;
 f.setOpen(()=>openGate.promise);
 const next=f.quickSelection({text:'new',url},sender());
 probeGate.resolve();assert.equal(await claiming,null);
 openGate.resolve();await next;
 assert.equal((await f.claimQuickSelection(context,workspaceSender)).text,'new');
});
