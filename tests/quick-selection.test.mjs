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
const contentSender={id:'ext',tab:{id:42,url},url,documentId:'doc-42'};
function fixture({currentUrl=url,secondDocument='doc-42',storedAt=null}={}){
 let pending=null;const events=[];
 const C={check(ok,code){if(!ok)throw Error(code);},id:()=> 'nonce-1',
  chatUrl(value){const match=/^https:\/\/chatgpt\.com\/c\/([a-z0-9-]+)\/?$/.exec(value);
   if(!match)throw Error('NOT_CHATGPT');return {url:'https://chatgpt.com/c/'+match[1],conversationId:match[1]};}};
 const api={
  tabs:{get:async id=>{events.push('get-tab');assert.equal(id,42);return {id:42,url:currentUrl};}},
  sidePanel:{open({tabId}){events.push('open-panel');assert.equal(tabId,42);return Promise.resolve();}},
  storage:{session:{get:async()=>({cfPendingSelectedTask:pending}),set:async value=>{events.push('persist');pending=value.cfPendingSelectedTask;},remove:async()=>{events.push('remove');pending=null;}}},
  scripting:{executeScript:async query=>{events.push('verify-document');assert.equal(query.target.tabId,42);return [{frameId:0,documentId:secondDocument,result:currentUrl}];}}
 };
 const now=Date.now();
 const ctx=vm.createContext({api,C,Date:{now:()=>now},trusted:sender=>sender.id==='ext',workspace:sender=>{if(sender.url!=='chrome-extension://ext/workspace/index.html')throw Error('WORKSPACE_ONLY');},Number});
 const ops=vm.runInContext(functions+'\n({quickSelection,claimQuickSelection})',ctx);
 if(storedAt!==null)pending={tabId:42,documentId:'doc-42',url,text:'synthetic selected',at:storedAt,nonce:'nonce-1',evidence:'unverified'};
 return {...ops,events,api,C,stored:()=>pending,now};
}
test('inline selection opens panel on user action without sending, and retains exact source',async()=>{
 const f=fixture();const result=await f.quickSelection({text:'synthetic selected',url,evidence:'unverified',messageId:'untrusted'},contentSender);
 assert.equal(result.opened,true);
 assert.ok(f.events.indexOf('open-panel')>=0&&f.events.indexOf('open-panel')<f.events.indexOf('persist'));
 assert.equal(f.stored().text,'synthetic selected');
 assert.equal(f.stored().documentId,'doc-42');
 assert.equal(f.stored().evidence,'unverified');
 assert.equal(f.stored().messageId,null);
 assert.ok(!f.events.some(x=>x.includes('send')));
});
test('only current exact document can claim a pending inline selection',async()=>{
 const f=fixture();await f.quickSelection({text:'synthetic selected',url,evidence:'confirmed',messageId:'m99'},contentSender);
 const workspace={url:'chrome-extension://ext/workspace/index.html'};
 const value=await f.claimQuickSelection(workspace);
 assert.equal(value.documentId,'doc-42');assert.equal(value.messageId,'m99');
 const changed=fixture({secondDocument:'doc-reloaded'});
 await changed.quickSelection({text:'synthetic selected',url,evidence:'unverified'},contentSender);
 assert.equal(await changed.claimQuickSelection(workspace),null);
});
test('foreign callers, mismatched URLs, invalid text and expired drafts are rejected',async()=>{
 const f=fixture();
 await assert.rejects(f.quickSelection({text:'valid',url}, {...contentSender,id:'foreign'}),/SOURCE_LOCK_REQUIRED/);
 await assert.rejects(f.quickSelection({text:'valid',url:'https://chatgpt.com/c/other-chat'},contentSender),/TASK_SOURCE_CHANGED/);
 await assert.rejects(f.quickSelection({text:'',url},contentSender),/TASK_TEXT_LIMIT/);
 const old=fixture({storedAt:Date.now()-120000});
 assert.equal(await old.claimQuickSelection({url:'chrome-extension://ext/workspace/index.html'}),null);
 assert.equal(old.stored(),null);
});
