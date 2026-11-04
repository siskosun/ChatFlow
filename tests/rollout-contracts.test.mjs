import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
const read=f=>fs.readFileSync(new URL('../src/'+f,import.meta.url),'utf8');
function core(){
 const ctx=vm.createContext({URL,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,ArrayBuffer,Blob,crypto:webcrypto,atob,btoa});
 vm.runInContext(read('tl-core.js'),ctx);vm.runInContext(read('tl-evidence.js'),ctx);return ctx;
}
function navFixture(reverse=false,total=1000){
 let clock=0,active=true;const style=new Map([['overflow-anchor','auto']]);
 const box={scrollTop:reverse?0:(total-8)*100,scrollHeight:total*100,clientHeight:600,
   style:{getPropertyValue:k=>style.get(k)||'',getPropertyPriority:()=>'',setProperty:(k,v)=>style.set(k,v),removeProperty:k=>style.delete(k)},
   scrollTo({top}){box.scrollTop=top;},getBoundingClientRect:()=>({top:0,height:600})};
 const logical=()=>box.scrollTop+(reverse?box.scrollHeight-box.clientHeight:0);
 const elements=new Map();
 const element=i=>{if(!elements.has(i))elements.set(i,{i,getBoundingClientRect:()=>({top:i*100-logical(),height:90,bottom:i*100-logical()+90})});return elements.get(i);};
 const rows=()=>{const first=Math.max(0,Math.floor(logical()/100)-1);return Array.from({length:Math.min(9,total-first)},(_,j)=>({index:first+j,el:element(first+j)}));};
 const ctx=vm.createContext({getComputedStyle:()=>({flexDirection:reverse?'column-reverse':'column'}),setTimeout,clearTimeout});
 vm.runInContext(read('tl-navigation.js'),ctx);
 return{N:ctx.TLNavigation,box,style,rows,element,advance:n=>{clock+=n;},stop:()=>{active=false;},
  options:index=>({targetIndex:index,total,resolve:()=>rows().some(r=>r.index===index)?{el:element(index),confidence:'verified_message_id'}:null,
   mounted:rows,scrollContainer:()=>box,assertCurrent:()=>{if(!active)throw Error('PAGE_SCOPE_CHANGED');},now:()=>clock,wait:async()=>{clock+=16;}})};
}
for(const reverse of [false,true])test(`264 and 1000-message exact navigation, reverse=${reverse}`,async()=>{
 for(const count of [264,1000])for(const index of [0,7,Math.floor(count/2),count-1]){
  const f=navFixture(reverse,count),r=await f.N.navigate(f.options(index));
  assert.equal(r.state,'matched',`${count}:${index}`);assert.equal(r.el.i,index);
  assert.ok(r.stats.writes<=60&&r.stats.scans<=128&&r.stats.elapsedMs<=12000);
  assert.equal(f.style.get('overflow-anchor'),'auto');
 }
});
test('cancel after a scroll performs no later write and restores overflow-anchor',async()=>{
 const f=navFixture(),controller=new AbortController();let writes=0;
 f.box.scrollTo=()=>{writes++;controller.abort();};const r=await f.N.navigate({...f.options(0),signal:controller.signal});
 assert.equal(r.state,'cancelled');assert.equal(writes,1);assert.equal(f.style.get('overflow-anchor'),'auto');
});
test('source replacement aborts before a late frame can certify a target',async()=>{
 const f=navFixture(),options=f.options(0);options.wait=async()=>{f.stop();};
 await assert.rejects(f.N.navigate(options),/PAGE_SCOPE_CHANGED/);assert.equal(f.style.get('overflow-anchor'),'auto');
});
test('missing targets and expired budgets do not become matched messages',async()=>{
 const f=navFixture(),options=f.options(0);options.resolve=()=>null;options.wait=async()=>f.advance(6001);
 assert.equal((await f.N.navigate(options)).state,'timeout');
 const g=navFixture();assert.equal((await g.N.navigate({...g.options(0),mounted:()=>[]})).state,'not_found');
});
test('observed DOM nodes remain observed, not ID-verified',async()=>{
 const f=navFixture(),o=f.options(999),resolve=o.resolve;o.resolve=()=>{const r=resolve();return r?{...r,confidence:'observed_dom_node'}:null;};
 assert.equal((await f.N.navigate(o)).state,'observed');
});
function view(C){return {capture:{state:'partial',saveScope:'all',snapshot:C.normalizeConversation({id:'rollout_source_12345',current_node:'n1',mapping:{n1:{parent:null,children:[],message:{id:'m1',author:{role:'user'},content:{parts:['synthetic']}}}}},'https://chatgpt.com/c/rollout_source_12345')},assets:[],passages:[]};}
test('backup and restore evidence are separate, bounded to snapshot and file versions',()=>{
 const{TLCore:C,TLEvidence:E}=core(),v=view(C),key=E.subject(v);
 assert.equal(E.report(v).backup.state,'not_checked');
 v.capture.verifications=[{schema:'chatflow.verification/1',kind:'backup',status:'passed',subject:key,archiveSha256:'a'.repeat(64),archiveBytes:1024,version:'0.3',checkedAt:1,imported:false}];
 assert.equal(E.report(v).local,'partial');assert.equal(E.report(v).backup.state,'passed');assert.equal(E.report(v).restore.state,'not_checked');
 v.capture.snapshot.title='changed';assert.equal(E.report(v).backup.state,'stale');
});
test('receipts cannot claim database recovery without an actual import flag',()=>{
 const {TLEvidence:E}=core();assert.throws(()=>E.validateReceipt({schema:'chatflow.verification/1',kind:'restore',status:'passed',subject:'a'.repeat(64),archiveSha256:null,archiveBytes:0,checkedAt:1,version:'0.3'}),/RESTORE_IMPORT_NOT_EXECUTED/);
});
test('per-file evidence validates batch indexes, attempt and exact ready basis',()=>{
 const {TLEvidence:E}=core(),h={attemptId:'attempt-1',targetDocumentId:'document-1',evidenceVersion:1,batches:[[0,1]],files:[{name:'report.pdf',sha256:'a'.repeat(64),size:1},{name:'other.pdf',sha256:'b'.repeat(64),size:2}]};
 h.fileEvidence=E.validateFileEvidence(h,[{index:0,state:'page_ready',basis:'exact_filename_ready'},{index:1,state:'unknown'}]);
 assert.equal(E.fileReport(h,0).state,'page_ready');assert.equal(E.fileReport(h,1).state,'unknown');
 h.attemptId='another';assert.equal(E.fileReport(h,0).state,'unknown');
 assert.throws(()=>E.validateFileEvidence(h,[{index:0,state:'page_ready'},{index:1,state:'unknown'}]),/INVALID_FILE_EVIDENCE_BASIS/);
 assert.throws(()=>E.validateFileEvidence(h,[{index:0,state:'prepared'},{index:0,state:'prepared'}]),/INVALID_FILE_EVIDENCE_INDEX/);
 delete h.evidenceVersion;delete h.fileEvidence;h.state='upload_confirmed';assert.equal(E.fileReport(h,0).state,'legacy_unverified');
});
test('diagnostics retain no raw error text or URLs and stay within 50 records',async()=>{
 let data={};const ctx=vm.createContext({chrome:{storage:{local:{get:async()=>data,set:async x=>{data=x;}}}}});vm.runInContext(read('tl-diagnostics.js'),ctx);
 for(let i=0;i<55;i++)await ctx.TLDiagnostics.record('capture-stop',new TypeError('PRIVATE_TOKEN https://private.example body'));
 const result=await ctx.TLDiagnostics.list();assert.equal(result.rows.length,50);assert.ok(!JSON.stringify(result).includes('PRIVATE_TOKEN'));assert.ok(!JSON.stringify(result).includes('private.example'));
 await ctx.TLDiagnostics.record('private-user-data',new Error());assert.equal((await ctx.TLDiagnostics.list()).rows.length,50);
});
