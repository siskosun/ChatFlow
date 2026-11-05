import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const file of ['tl-core.js','tl-passages.js','tl-archive.js','tl-context.js','toolkit-port.js'])
 vm.runInThisContext(fs.readFileSync('src/'+file,'utf8'),{filename:file});
const C=TLCore,A=TLArchive,source='https://chatgpt.com/c/citation-roundtrip';
const marker='\uE200cite\uE202turn0search0\uE201';
function snapshot(url='https://example.com/report'){
 return C.normalizeConversation({conversation_id:'citation-roundtrip',title:'Synthetic references',current_node:'a',mapping:{
  u:{parent:null,children:['a'],message:{id:'user-1',author:{role:'user'},content:{parts:['A synthetic question']}}},
  a:{parent:'u',children:[],message:{id:'assistant-1',author:{role:'assistant'},content:{parts:['Source-backed answer '+marker]},
   metadata:{content_references:[{matched_text:marker,items:[{title:'Report',url}]}]}}}
 }},source);
}
test('references survive archive projection without changing raw text or passage offsets',()=>{
 const s=snapshot(),raw=C.persistedSnapshot(s),m=s.messages[1],restored=A.validatedSnapshot(raw);
 assert.ok(m.sourceReferences?.length,'fixture must contain projected sources');
 assert.deepEqual(restored.messages[1].sourceReferences,m.sourceReferences);
 assert.equal(restored.messages[1].text,m.text);
 assert.equal(TLPassages.messageHash(restored.messages[1]),TLPassages.messageHash(m));
 assert.match(C.history(restored),/https:\/\/example\.com\/report/);
});
test('legacy archives without references remain restorable and keep opaque source markers',()=>{
 const legacy=C.persistedSnapshot(snapshot());delete legacy.messages[1].sourceReferences;
 legacy.integrity={...legacy.integrity,state:'valid',issues:[]};
 const restored=A.validatedSnapshot(legacy);
 assert.equal(restored.integrity.state,'valid');
 assert.equal(restored.messages[1].text,legacy.messages[1].text);
 assert.ok(C.history(restored).includes(marker));
});
test('malformed or altered backup references cannot be silently dropped during restore',()=>{
 for(const mutate of [
  s=>{s.messages[1].sourceReferences[0].links[0].url='javascript:alert(1)';},
  s=>{s.messages[1].sourceReferences[0].marker='not in the message';},
  s=>{s.messages[1].sourceReferences.push(s.messages[1].sourceReferences[0]);},
  s=>{s.messages[1].role='user';},
  s=>{s.messages[1].sourceReferences[0].links[0].url='https://example.com/?token=secret';}
 ]){
  const s=C.persistedSnapshot(snapshot());mutate(s);
  assert.throws(()=>A.validatedSnapshot(s),/INVALID_MESSAGE_REFERENCE/);
 }
});
test('Markdown and text turn exports include sources while JSON retains raw text and references',()=>{
 const s=snapshot(),ids=CFToolkit.groupExportMessagesIntoTurns(s.messages).map(t=>t.id);
 for(const format of ['md','txt']){
  const out=CFToolkit.exportSelected(s.messages,ids,s.source,s.title,format);
  assert.match(out,/https:\/\/example\.com\/report/);
 }
 const json=JSON.parse(CFToolkit.exportSelected(s.messages,ids,s.source,s.title,'json'));
 assert.equal(json.messages[1].text,s.messages[1].text);
 assert.deepEqual(json.messages[1].sourceReferences,s.messages[1].sourceReferences);
});
test('context compilation does not deduplicate changed references with identical visible text',()=>{
 const first=snapshot(),second=snapshot('https://example.org/updated-report');
 const out=TLContext.compile([{captureId:'first',snapshot:first,assetRows:[]},{captureId:'second',snapshot:second,assetRows:[]}]);
 assert.equal(out.manifest.conflictingVersions.length,1);
 assert.match(out.parts.join(''),/https:\/\/example\.com\/report/);
 assert.match(out.parts.join(''),/https:\/\/example\.org\/updated-report/);
});
