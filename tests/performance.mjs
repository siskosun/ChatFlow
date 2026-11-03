// Synthetic algorithm budgets. These timings are not a user's browser latency.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {webcrypto,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const baseline=process.argv.find(x=>x.startsWith('--baseline='))?.split('=')[1],root=new URL('../',import.meta.url),runs=baseline?1:3;
const env=vm.createContext({console,URL,TextEncoder,TextDecoder,crypto:webcrypto,Uint8Array,Uint32Array,DataView,ArrayBuffer,Blob,atob,btoa,Date});
for(const file of ['tl-core','tl-passages','tl-context'])vm.runInContext(baseline?execFileSync('git',['show',baseline+':src/'+file+'.js'],{cwd:root,encoding:'utf8'}):fs.readFileSync(new URL('src/'+file+'.js',root),'utf8'),env);
const C=env.TLCore,P=env.TLPassages,X=env.TLContext,source='https://chatgpt.com/c/performance_fixture_20261103',cases=[];
function raw(count,shape='chain',bodySize=10){
 const mapping=Object.create(null);for(let i=0;i<count;i++)mapping['n'+i]={parent:i===0?null:shape==='wide'?'n0':'n'+(i-1),children:shape==='wide'?i===0?Array.from({length:count-1},(_,j)=>'n'+(j+1)):[]:i<count-1?['n'+(i+1)]:[],message:{id:'m'+i,author:{role:i%2?'assistant':'user'},content:{parts:['record-'+i+' '+'.'.repeat(bodySize)]},status:'finished_successfully'}};
 return{conversation_id:'performance_fixture_20261103',title:'Synthetic performance fixture',current_node:'n'+(count-1),mapping};
}
function measure(name,fn,budgetMs){
 const times=[];let value;for(let i=0;i<runs;i++){const start=performance.now();value=fn();times.push(performance.now()-start);}
 const sorted=[...times].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)],row={name,runs,timesMs:times.map(v=>+v.toFixed(2)),medianMs:+median.toFixed(2),budgetMs,status:baseline?'baseline':median<=budgetMs?'pass':'fail'};cases.push(row);console.log(JSON.stringify(row));if(!baseline)assert.ok(median<=budgetMs,name+' exceeded the CI algorithm budget');return value;
}
const wide=raw(50000,'wide'),chain=raw(50000);
const w=measure('normalize_50000_wide',()=>C.normalizeConversation(wide,source),2000);assert.equal(w.integrity.state,'valid');assert.equal(w.messages.length,50000);assert.equal(w.active.length,2);
const c=measure('normalize_50000_chain',()=>C.normalizeConversation(chain,source),2000);assert.equal(c.integrity.state,'valid');assert.equal(c.active.length,50000);
const snapshot=C.normalizeConversation(raw(1000,'chain',1000),source),hash=P.snapshotHash(snapshot),passages=snapshot.messages.slice(0,100).map((m,i)=>({schema:'chatflow.passage/1',passageId:'passage-'+i,captureId:'capture-performance',snapshotHash:hash,conversationId:snapshot.source.conversationId,messageId:m.id,nodeId:m.nodeId,messageHash:P.messageHash(m),role:m.role,text:m.text.slice(0,20),prefix:'',suffix:m.text.slice(20,180),startOffset:0,endOffset:20,occurrence:0,color:'yellow',status:'anchored',createdAt:1,updatedAt:1}));
const result=measure('compile_100_passages_from_1mb_snapshot',()=>X.compile([{captureId:'capture-performance',snapshot,passages}],{passageMode:'passages'}),750);
assert.equal(result.manifest.passages.length,100);assert.equal(result.manifest.sources[0].snapshotHash,hash);assert.ok(result.manifest.passages.every(p=>p.snapshotHash===hash));
const emptySources=Array.from({length:100},(_,i)=>({captureId:'empty-'+i,snapshot,passages:[]}));measure('compile_empty_passages_from_100_sources',()=>assert.throws(()=>X.compile(emptySources,{passageMode:'passages'}),/NO_SELECTED_CONTEXT_PASSAGES/),250);
// A later mutation must be reflected; no global mutable-object hash cache.
snapshot.title='Changed after previous compile';const changed=X.compile([{captureId:'capture-performance',snapshot,passages}],{passageMode:'passages'});assert.notEqual(changed.manifest.sources[0].snapshotHash,hash);assert.equal(changed.manifest.sources[0].snapshotHash,createHash('sha256').update(JSON.stringify(C.persistedSnapshot(snapshot))).digest('hex'));
const out=new URL('test-results/',root);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(new URL(baseline?'performance-baseline.json':'performance-report.json',out),JSON.stringify({scope:'node_synthetic_algorithms_not_real_user_library',runtime:process.version,source:baseline||'working_tree',snapshotBytes:Buffer.byteLength(JSON.stringify(snapshot)),budgets:'median of three isolated calls; baseline one call; same fixture',cases},null,2)+'\n');
