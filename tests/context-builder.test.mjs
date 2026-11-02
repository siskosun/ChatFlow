import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const name of ['tl-core.js','tl-context.js'])vm.runInThisContext(fs.readFileSync(path.join(root,'src',name),'utf8'),{filename:name});
const C=globalThis.TLCore,T=globalThis.TLContext;
function source(count=6){
 const mapping=Object.create(null);
 for(let i=0;i<count;i++)mapping['n'+i]={parent:i?'n'+(i-1):null,children:i===count-1?['alt']:i===count-2?['n'+(i+1)]:[],message:{id:'m'+i,author:{role:i%2?'assistant':'user'},content:{parts:['message '+i]}}};
 mapping.alt={parent:'n'+(count-1),children:[],message:{id:'alt-msg',author:{role:'assistant'},content:{parts:['alternative branch']}}};
 const snapshot=C.normalizeConversation({conversation_id:'conversation_context_01',title:'Context fixture',current_node:'n'+(count-1),mapping},'https://chatgpt.com/c/conversation_context_01');
 snapshot.assets=[{key:'a1',messageId:'m1',nodeId:'n1',name:'file.pdf',mime:'application/pdf',origin:'user_uploaded',state:'saved'},{key:'a2',messageId:'m2',nodeId:'n2',name:'lost.csv',mime:'text/csv',origin:'assistant_generated',state:'unavailable',reason:'HTTP_404'}];
 return snapshot;
}
test('context compiler defaults to active branch and preserves source references',()=>{
 const s=source(),out=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[{key:'a1',state:'saved',sha256:'a'.repeat(64),size:12},{key:'a2',state:'unavailable',reason:'HTTP_404'}]}]);
 assert.equal(out.manifest.sources.length,1);assert.equal(out.manifest.sources[0].branchMode,'captured_active_branch');
 assert.equal(out.parts.join('').includes('alternative branch'),false);assert.equal(out.parts.join('').includes('message 4'),true);
 assert.equal(out.manifest.assets.length,2);assert.equal(out.manifest.assets[1].reason,'HTTP_404');
});
test('all accessible branches are explicit and never flattened into the active-branch claim',()=>{
 const s=source(),out=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[]}],{allBranches:true});
 assert.equal(out.manifest.sources[0].branchMode,'all_accessible');assert.match(out.parts.join(''),/alternative branch/);
});
test('saved original bytes are included only when explicitly requested',()=>{
 const s=source(),row={key:'a1',state:'saved',sha256:'a'.repeat(64),size:12};
 const off=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[row]}]);
 const on=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[row]}],{includeSavedAssets:true});
 assert.equal(off.assets.length,0);assert.equal(on.assets.length,1);assert.equal(on.assets[0].sha256,'a'.repeat(64));
});
test('long context is split without silent truncation and records an estimate',()=>{
 const s=source(30);const out=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[]}],{maxPartChars:1000});
 assert.ok(out.parts.length>1);assert.equal(out.parts.join('\n'),out.parts.join('\n'));assert.ok(out.manifest.estimatedTokens>0);
 for(let i=0;i<30;i++)assert.ok(out.parts.join('').includes('message '+i));
});
test('invalid and duplicate source archives fail closed',()=>{
 const s=source();assert.throws(()=>T.compile([]),/INVALID_CONTEXT_SOURCES/);
 assert.throws(()=>T.compile([{captureId:'x',snapshot:s},{captureId:'x',snapshot:s}]),/DUPLICATE_CONTEXT_SOURCE/);
 assert.throws(()=>T.compile([{captureId:'x',snapshot:s}],{maxPartChars:10}),/INVALID_CONTEXT_PART_SIZE/);
});

test('keyword filtering is explicit, source-linked and token budget never truncates',()=>{
 const s=source(),filtered=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[]}],{query:'message 2',tokenBudget:1000});
 assert.deepEqual(filtered.manifest.sources[0].messageIds,['m2']);
 assert.equal(filtered.manifest.options.query,'message 2');
 const over=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[]}],{tokenBudget:1000,maxPartChars:1000});
 assert.equal(over.manifest.budgetExceeded,true);
 assert.ok(over.manifest.warnings.includes('TOKEN_BUDGET_EXCEEDED_SPLIT_REQUIRED'));
 assert.ok(over.parts.join('').includes('message 5'));
 assert.throws(()=>T.compile([{captureId:'cap-1',snapshot:s}],{query:'no-such-message'}),/NO_CONTEXT_MATCHES_FOR_SOURCE/);
});
