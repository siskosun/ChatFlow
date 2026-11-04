import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
function env(){
 const ctx=vm.createContext({URL,Blob,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,DataView,crypto:webcrypto,structuredClone,atob,btoa});
 vm.runInContext(fs.readFileSync(new URL('../src/tl-core.js',import.meta.url),'utf8'),ctx);
 ctx.TLStore={};ctx.TLArchive={};vm.runInContext(fs.readFileSync(new URL('../src/tl-evidence.js',import.meta.url),'utf8'),ctx);
 const C=ctx.TLCore,cid='conversation_evidence_unit';
 const snapshot=C.normalizeConversation({conversation_id:cid,title:'Evidence',current_node:'n',mapping:{n:{parent:null,children:[],message:{id:'m',author:{role:'user'},content:{parts:['hello']},metadata:{}}}}},'https://chatgpt.com/c/'+cid);
 return{E:ctx.TLEvidence,view:{capture:{snapshot,state:'ready',saveScope:'all'},assets:[],passages:[]}};
}
test('save success without ZIP or import proof cannot imply backup or restored',()=>{
 const {E,view}=env(),s=E.summary(view);assert.equal(s.local,'ready');assert.equal(s.backup.state,'not_executed');assert.equal(s.restore.state,'not_executed');
});
test('proofs bind exact content versions and cannot be promoted from older booleans',()=>{
 const {E,view}=env();view.capture.restoreValidated=true;assert.equal(E.summary(view).restore.state,'not_executed');
 const key=E.versionOf(view);view.capture.evidenceHistory=[{schema:'chatflow.evidence/1',kind:'backup',status:'validated',sourceKey:key}];
 assert.equal(E.summary(view).backup.state,'validated');
 view.capture.snapshot.title='Changed';assert.equal(E.summary(view).backup.state,'stale');
 assert.equal(E.summary(view).restore.state,'not_executed');
});
test('process states are not collapsed into success or error',()=>{
 const {E,view}=env();for(const state of ['capturing','cancelled','interrupted','error','partial']){view.capture.state=state;assert.equal(E.summary(view).local,state);}
});
test('attachment references and exclusion state participate in evidence version',()=>{
 const {E,view}=env(),a={key:'one',messageId:'m',nodeId:'n',name:'same.txt',state:'unavailable',reason:'MISSING'};
 view.assets=[a];const old=E.versionOf(view);view.assets.push({...a,key:'two',messageId:'other'});assert.notEqual(E.versionOf(view),old);
 const two=E.versionOf(view);view.assets[0].state='excluded';assert.notEqual(E.versionOf(view),two);
});
