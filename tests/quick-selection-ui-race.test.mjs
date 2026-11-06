import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('workspace/flow.js','utf8');
const start=source.indexOf(' async function claimQuickSelection(knownWindow=null)');
const end=source.indexOf('\n chrome.storage.onChanged.addListener',start);
assert.ok(start>=0&&end>start);
const fn=source.slice(start,end);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const draft=(nonce,text,tabId=42)=>({windowId:7,tabId,url:'https://chatgpt.com/c/test-'+tabId,text,nonce,documentId:'doc-'+tabId,evidence:'confirmed',messageId:'m-'+tabId});
function fixture({initialText='',confirm=true}={}){
 let current=draft('a','selected A'),refresh=async()=>{},claimHook=null;
 const calls=[],text={value:initialText,focus:()=>calls.push(['focus'])},
  source={value:'84',options:[42,84].map(id=>({value:String(id),dataset:{sourceUrl:'https://chatgpt.com/c/test-'+id}}))};
 Object.defineProperty(source,'selectedOptions',{get:()=>source.options.filter(option=>option.value===source.value)});
 const ctx=vm.createContext({text,source,selectionStageLink:{hidden:false},
  currentWorkspaceWindow:async()=>({windowId:7,activeTabId:42}),
  call:async(type,data)=>{
   calls.push([type,data]);
   if(type==='tl:ackQuickSelection')return {acknowledged:true};
   if(claimHook){const hook=claimHook;claimHook=null;await hook();}
   return !data.nonce||data.nonce===current?.nonce?current:null;
  },
  refreshSources:()=>refresh(),selectionFeedback:(...args)=>calls.push(['feedback',...args]),
  confirm:()=>confirm,ChatFlowWorkspace:{show:()=>calls.push(['show'])},mode:()=>{},
  stopSelectionWatch:()=>{}
 });
 const ops=vm.runInContext('let quickSelectionEpoch=0,createEpoch=0,selectedFromWatch=null;function invalidateCreation(){createEpoch++;}\n'+fn+
  '\n({claimQuickSelection,edit(value){text.value=value;quickSelectionEpoch++;createEpoch++;},invalidateOldSource(){createEpoch++;},state(){return {text:text.value,source:source.value,selectedFromWatch};}})',ctx);
 return {...ops,calls,setDraft:d=>{current=d;},setRefresh:fn=>{refresh=fn;},setClaimHook:fn=>{claimHook=fn;}};
}
test('a slow older UI claim cannot overwrite a newer accepted selection',async()=>{
 const f=fixture(),gate=deferred(),entered=deferred();let n=0;
 f.setRefresh(async()=>{if(++n===1){entered.resolve();await gate.promise;}});
 const old=f.claimQuickSelection();await entered.promise;
 f.setDraft(draft('b','selected B',84));await f.claimQuickSelection();gate.resolve();await old;
 assert.equal(f.state().text,'selected B');assert.equal(f.state().source,'84');
 assert.deepEqual(f.calls.filter(x=>x[0]==='tl:ackQuickSelection').map(x=>x[1].nonce),['b']);
});
test('manual edits during IO survive without being replaced or acknowledged',async()=>{
 const f=fixture(),gate=deferred(),entered=deferred();
 f.setRefresh(async()=>{entered.resolve();await gate.promise;});
 const pending=f.claimQuickSelection();await entered.promise;
 f.edit('my edited draft');gate.resolve();await pending;
 assert.equal(f.state().text,'my edited draft');
 assert.equal(f.calls.filter(x=>x[0]==='tl:ackQuickSelection').length,0);
});
test('declining replacement keeps both draft text and original source',async()=>{
 const f=fixture({initialText:'existing draft',confirm:false});await f.claimQuickSelection();
 assert.equal(f.state().text,'existing draft');assert.equal(f.state().source,'84');
 assert.equal(f.calls.filter(x=>x[0]==='show').length,0);
 assert.equal(f.calls.find(x=>x[0]==='tl:ackQuickSelection')[1].nonce,'a');
 assert.equal(f.calls.find(x=>x[0]==='feedback')[3],'https://chatgpt.com/c/test-84');
});
test('a changed nonce after source refresh is not displayed',async()=>{
 const f=fixture();f.setRefresh(async()=>{f.setDraft(draft('b','newer'));});
 await f.claimQuickSelection();
 assert.equal(f.state().text,'');assert.equal(f.calls.filter(x=>x[0]==='show').length,0);
});
test('a draft belonging to another window never changes this task',async()=>{
 const f=fixture();f.setDraft({...draft('a','foreign'),windowId:8});await f.claimQuickSelection();
 assert.equal(f.state().text,'');assert.equal(f.calls.filter(x=>x[0]==='show').length,0);
});

test('source-list refresh may invalidate an old route without dropping the explicit new selection',async()=>{
 const f=fixture();f.setRefresh(async()=>{f.invalidateOldSource();});
 await f.claimQuickSelection();
 assert.equal(f.state().text,'selected A');assert.equal(f.state().source,'42');
 assert.equal(f.calls.filter(x=>x[0]==='tl:ackQuickSelection').length,1);
});

test('declining an existing draft does not refresh and auto-reassign its source',async()=>{
 const f=fixture({initialText:'keep this draft',confirm:false});
 let refreshCalls=0;f.setRefresh(async()=>{refreshCalls++;});
 await f.claimQuickSelection();
 assert.equal(refreshCalls,0);
 assert.equal(f.state().source,'84');
});
