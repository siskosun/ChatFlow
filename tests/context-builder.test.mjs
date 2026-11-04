import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const name of ['tl-core.js','tl-passages.js','tl-context.js'])vm.runInThisContext(fs.readFileSync(path.join(root,'src',name),'utf8'),{filename:name});
const C=globalThis.TLCore,T=globalThis.TLContext;
function source(count=6){
 const mapping=Object.create(null);
 for(let i=0;i<count;i++)mapping['n'+i]={parent:i?'n'+(i-1):null,children:i===count-1?['alt']:i===count-2?['n'+(i+1)]:[],message:{id:'m'+i,author:{role:i%2?'assistant':'user'},content:{parts:[i===2?'unique phrase 2':'message '+i]}}};
 mapping.alt={parent:'n'+(count-1),children:[],message:{id:'alt-msg',author:{role:'assistant'},content:{parts:['alternative branch']}}};
 const snapshot=C.normalizeConversation({conversation_id:'conversation_context_01',title:'Context fixture',current_node:'n'+(count-1),mapping},'https://chatgpt.com/c/conversation_context_01');
 snapshot.assets=[{key:'a1',messageId:'m1',nodeId:'n1',name:'file.pdf',mime:'application/pdf',origin:'user_uploaded',state:'saved'},{key:'a2',messageId:'m2',nodeId:'n2',name:'lost.csv',mime:'text/csv',origin:'assistant_generated',state:'unavailable',reason:'HTTP_404'}];
 return snapshot;
}
test('context compiler defaults to active branch and preserves source references',()=>{
 const s=source(),out=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[{key:'a1',state:'saved',sha256:'a'.repeat(64),size:12},{key:'a2',state:'unavailable',reason:'HTTP_404'}]}]);
 assert.equal(out.manifest.sources.length,1);assert.equal(out.manifest.sources[0].branchMode,'selected_branch');
 assert.deepEqual(out.manifest.sources[0].branchNodeIds,s.active);
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
 const s=source(500),filtered=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[]}],{query:'unique phrase 2',tokenBudget:1000});
 assert.deepEqual(filtered.manifest.sources[0].messageIds,['m2']);
 assert.equal(filtered.manifest.options.query,'unique phrase 2');
 const over=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[]}],{tokenBudget:1000,maxPartChars:1000});
 assert.equal(over.manifest.budgetExceeded,true);
 assert.ok(over.manifest.warnings.includes('TOKEN_BUDGET_EXCEEDED_SPLIT_REQUIRED'));
 assert.ok(over.parts.join('').includes('message 5'));
 assert.throws(()=>T.compile([{captureId:'cap-1',snapshot:s}],{query:'no-such-message'}),/NO_CONTEXT_MATCHES_FOR_SOURCE/);
});

test('exact duplicate messages across copies of the same conversation are deduplicated with source trace',()=>{
 const s=source(6),first=T.compile([{captureId:'copy-a',snapshot:s,assetRows:[]}]);
 const second=T.compile([{captureId:'copy-a',snapshot:s,assetRows:[]},{captureId:'copy-b',snapshot:s,assetRows:[]}]);
 assert.equal(second.manifest.sources.length,2);
 assert.equal(second.manifest.sources[1].duplicateMessageIds.length,6);
 assert.equal(second.manifest.duplicateMessages.length,6);
 assert.equal(second.parts.join('').split('message 0').length-1,1);
 assert.ok(second.index.includes('copy-b'));
});
test('different archived versions of the same message are both preserved and flagged',()=>{
 const s=source(6),changed=structuredClone(s);
 changed.messages[0].text='revised message text';
 const out=T.compile([{captureId:'copy-a',snapshot:s,assetRows:[]},{captureId:'copy-b',snapshot:changed,assetRows:[]}]);
 assert.equal(out.manifest.conflictingVersions.length,1);
 assert.ok(out.parts.join('').includes('message 0'));
 assert.ok(out.parts.join('').includes('revised message text'));
 assert.ok(out.manifest.warnings.includes('CONFLICTING_ARCHIVE_VERSIONS_PRESERVED'));
});

test('identical saved asset bytes across selected archives are packaged once with all source references retained',()=>{
 const s1=source(),s2=source(),row={key:'a1',state:'saved',sha256:'a'.repeat(64),size:12};
 const out=T.compile([{captureId:'cap-a',snapshot:s1,assetRows:[row]},{captureId:'cap-b',snapshot:s2,assetRows:[row]}],{includeSavedAssets:true});
 assert.equal(out.manifest.assets.filter(a=>a.includeBytes).length,2);
 assert.equal(out.manifest.includedAssetReferenceCount,2);
 assert.equal(out.manifest.includedAssetCount,1);
 assert.equal(out.assets.length,1);
 assert.equal(out.assets[0].sha256,'a'.repeat(64));
 assert.ok(out.index.includes('来源引用：2'));
});
test('conflicting sizes for the same content hash fail closed',()=>{
 const s1=source(),s2=source();
 assert.throws(()=>T.compile([
  {captureId:'cap-a',snapshot:s1,assetRows:[{key:'a1',state:'saved',sha256:'a'.repeat(64),size:12}]},
  {captureId:'cap-b',snapshot:s2,assetRows:[{key:'a1',state:'saved',sha256:'a'.repeat(64),size:13}]}
 ],{includeSavedAssets:true}),/CONFLICTING_ASSET_HASH_SIZE/);
});

test('passage-only context includes only explicitly selected anchored excerpts and complete provenance',()=>{
 const s=source(),message=s.messages.find(m=>m.id==='m2'),text='unique phrase 2',start=message.text.indexOf(text);
 const passage=TLPassages.create({captureId:'cap-1',snapshot:s,message,text,startOffset:start,endOffset:start+text.length});
 const out=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[],passages:[passage]}],{passageMode:'passages'});
 assert.equal(out.manifest.options.passageMode,'passages');
 assert.equal(out.manifest.passages.length,1);
 assert.equal(out.manifest.passages[0].passageId,passage.passageId);
 assert.ok(out.parts.join('').includes(text));
 assert.ok(out.parts.join('').includes('snapshot_sha256='+passage.snapshotHash));
 assert.equal(out.parts.join('').includes('message 0'),false);
 assert.equal(out.manifest.sources[0].messageIds.length,0);
});
test('mixed context retains full messages and separately bounded passage excerpts',()=>{
 const s=source(),message=s.messages.find(m=>m.id==='m2'),text='unique phrase 2',start=message.text.indexOf(text);
 const passage=TLPassages.create({captureId:'cap-1',snapshot:s,message,text,startOffset:start,endOffset:start+text.length});
 const out=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[],passages:[passage]}],{passageMode:'mixed'});
 assert.ok(out.parts.join('').includes('message 0'));
 assert.ok(out.parts.join('').includes('### 重点片段 '+passage.passageId));
 assert.equal(out.manifest.passages.length,1);
});
test('passage context refuses ambiguous or stale anchors instead of guessing',()=>{
 const s=source(),message=s.messages.find(m=>m.id==='m2'),text='unique phrase 2',start=message.text.indexOf(text);
 const passage=TLPassages.create({captureId:'cap-1',snapshot:s,message,text,startOffset:start,endOffset:start+text.length});
 const changed=structuredClone(s);changed.messages.find(m=>m.id==='m2').text='replacement';
 assert.throws(()=>T.compile([{captureId:'cap-1',snapshot:changed,assetRows:[],passages:[passage]}],{passageMode:'passages'}),/CONTEXT_PASSAGE_NOT_ANCHORED/);
 assert.throws(()=>T.compile([{captureId:'cap-1',snapshot:s,assetRows:[],passages:[]}],{passageMode:'passages'}),/EMPTY_CONTEXT_SOURCE|NO_SELECTED_CONTEXT_PASSAGES/);
});

test('passage-only mode skips selected archives without selected passages but retains their absence in no source list',()=>{
 const s=source(),message=s.messages.find(m=>m.id==='m2'),text='unique phrase 2',start=message.text.indexOf(text);
 const passage=TLPassages.create({captureId:'cap-2',snapshot:s,message,text,startOffset:start,endOffset:start+text.length});
 const out=T.compile([{captureId:'cap-1',snapshot:s,assetRows:[],passages:[]},{captureId:'cap-2',snapshot:s,assetRows:[],passages:[passage]}],{passageMode:'passages'});
 assert.equal(out.manifest.sources.length,1);assert.equal(out.manifest.sources[0].captureId,'cap-2');
 assert.equal(out.manifest.passages.length,1);
});

test('passage-only context respects active-branch scope unless all branches are explicitly enabled',()=>{
 const s=source(),alt=s.messages.find(m=>m.text==='alternative branch');
 const passage=TLPassages.create({captureId:'cap-alt',snapshot:s,message:alt,text:'alternative branch',startOffset:0,endOffset:'alternative branch'.length});
 assert.throws(()=>T.compile([{captureId:'cap-alt',snapshot:s,assetRows:[],passages:[passage]}],{passageMode:'passages'}),/CONTEXT_PASSAGE_OUTSIDE_BRANCH_SCOPE/);
 const all=T.compile([{captureId:'cap-alt',snapshot:s,assetRows:[],passages:[passage]}],{passageMode:'passages',allBranches:true});
 assert.equal(all.manifest.passages.length,1);
});

test('Context Builder uses an explicitly selected accessible branch and records its node path',()=>{
 const s=source(),alt=s.messages.find(m=>m.text==='alternative branch');
 const path=['n0','n1','n2','n3','n4','n5','alt'];
 const out=T.compile([{captureId:'cap-branch',snapshot:s,activeNodes:path,assetRows:[]}]);
 assert.equal(out.manifest.sources[0].branchMode,'selected_branch');
 assert.deepEqual(out.manifest.sources[0].branchNodeIds,path);
 assert.equal(out.parts.join('').includes('alternative branch'),true);
 assert.equal(out.parts.join('').includes('message 0'),true);
 assert.throws(()=>T.compile([{captureId:'cap-invalid',snapshot:s,activeNodes:['n0','n5'],assetRows:[]}]),/INVALID_CONTEXT_BRANCH_PATH/);
 assert.throws(()=>T.compile([{captureId:'cap-duplicate',snapshot:s,activeNodes:['n0','n1','n1'],assetRows:[]}]),/INVALID_CONTEXT_BRANCH_PATH/);
 assert.throws(()=>T.compile([{captureId:'cap-orphan',snapshot:s,activeNodes:['n5'],assetRows:[]}]),/INVALID_CONTEXT_BRANCH_PATH/);
});
