import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
for(const name of ['tl-core','tl-passages','tl-context','tl-archive'])vm.runInThisContext(read('src/'+name+'.js'));
const C=TLCore,P=TLPassages,T=TLContext,A=TLArchive;
function fixture(text='prefix selected text suffix'){
 return C.normalizeConversation({conversation_id:'closure_conversation_01',title:'Closure fixture',current_node:'n2',mapping:{
  n1:{parent:null,children:['n2'],message:{id:'m1',author:{role:'user'},content:{parts:[text]}}},
  n2:{parent:'n1',children:[],message:{id:'m2',author:{role:'assistant'},content:{parts:['second message']}}}
 }},'https://chatgpt.com/c/closure_conversation_01');
}
function passage(s){return P.create({captureId:'capture-a',snapshot:s,message:s.messages[0],text:'selected text',startOffset:7,endOffset:20});}
test('passage creation refuses a foreign body with copied message and node IDs',()=>{
 const s=fixture(),message={...s.messages[0],text:'fabricated source text'};
 assert.throws(()=>P.create({captureId:'capture-a',snapshot:s,message,text:'fabricated',startOffset:0,endOffset:10}),/PASSAGE_SOURCE_MESSAGE_CHANGED/);
});
test('resolver rejects empty text and changed author role instead of claiming an anchor',()=>{
 const s=fixture(),p=passage(s),changed=structuredClone(s);changed.messages[0].role='assistant';
 assert.equal(P.resolve(p,changed).reason,'MESSAGE_ROLE_CHANGED');
 assert.throws(()=>P.resolve({...p,text:''},s),/INVALID_PASSAGE_TEXT/);
 assert.throws(()=>P.occurrences('some text',''),/INVALID_PASSAGE_TEXT/);
});
test('context provenance uses resolved offsets and current hashes while preserving original anchor',()=>{
 const old=fixture(),p=passage(old),changed=fixture('A longer prefix selected text suffix');
 const out=T.compile([{captureId:'capture-a',snapshot:changed,passages:[p]}],{passageMode:'passages'}),q=out.manifest.passages[0];
 assert.equal(q.startOffset,16);assert.equal(q.endOffset,29);
 assert.equal(changed.messages[0].text.slice(q.startOffset,q.endOffset),q.text);
 assert.equal(q.snapshotHash,P.snapshotHash(changed));assert.equal(q.messageHash,P.messageHash(changed.messages[0]));
 assert.equal(q.anchorAtSave.snapshotHash,p.snapshotHash);assert.equal(q.anchorAtSave.startOffset,7);
 assert.match(out.parts.join(''),/offset=16-29/);
});
test('full-message mode cannot accidentally add passages supplied by a caller',()=>{
 const s=fixture(),p={...passage(s),text:'NOT_SELECTED_PASSAGE',nodeId:'foreign'};
 const out=T.compile([{captureId:'capture-a',snapshot:s,passages:[p]}]);
 assert.equal(out.manifest.passages.length,0);assert.ok(!out.parts.join('').includes('NOT_SELECTED_PASSAGE'));
});
test('context rejects duplicate passage IDs and non-array branch selections',()=>{
 const s=fixture(),p=passage(s);
 assert.throws(()=>T.compile([{captureId:'capture-a',snapshot:s,passages:[p,p]}],{passageMode:'passages'}),/DUPLICATE_CONTEXT_PASSAGE/);
 assert.throws(()=>T.compile([{captureId:'capture-a',snapshot:s,activeNodes:'n2'}]),/INVALID_CONTEXT_BRANCH_PATH/);
});
test('branch compilation follows graph path rather than storage insertion order',()=>{
 const s=fixture();s.messages.reverse();
 const out=T.compile([{captureId:'capture-a',snapshot:s}]);
 const text=out.parts.join('');assert.ok(text.indexOf('selected text')<text.indexOf('second message'));
 assert.deepEqual(out.manifest.sources[0].messageIds,['m1','m2']);
});
test('content hash is reproducible and records excluded empty passage sources',()=>{
 const s=fixture(),p=passage(s),sources=[{captureId:'capture-empty',snapshot:s,passages:[]},{captureId:'capture-a',snapshot:s,passages:[p]}];
 const a=T.compile(sources,{passageMode:'passages'}),b=T.compile(sources,{passageMode:'passages'});
 assert.match(a.manifest.contentHash,/^[a-f0-9]{64}$/);assert.equal(a.manifest.contentHash,b.manifest.contentHash);
 assert.deepEqual(a.manifest.excludedSources,[{captureId:'capture-empty',reason:'NO_SELECTED_PASSAGES_AFTER_FILTER'}]);
});
test('archive permits shared content-addressed bytes but rejects conflicting sizes',()=>{
 const sha='a'.repeat(64),file={key:'one',messageId:'m1',nodeId:'n1',name:'one.bin',mime:'application/octet-stream',kind:'upload',origin:'user_uploaded',state:'saved',size:10,sha256:sha,path:'assets/'+sha+'.bin'};
 const manifest={schema:'chatflow.archive/1',formatVersion:1,app:{name:'ChatFlow',version:'0.2'},source:{provider:'chatgpt',conversationId:'closure_conversation_01',origin:'https://chatgpt.com'},snapshotPath:'conversation.json',snapshotSha256:sha,snapshotSchema:'threadline.snapshot/1',integrity:{state:'valid'},state:'ready',files:[file,{...file,key:'two',name:'two.bin'}]};
 assert.equal(A.validateManifest(manifest),manifest);
 manifest.files[1].size=11;assert.throws(()=>A.validateManifest(manifest),/CONFLICTING_MANIFEST_PATH/);
});
test('keyboard extension selects Unicode code points without changing message text',()=>{
 const source=read('workspace/app.js'),start=source.indexOf(' function selectMessageWithKeyboard('),end=source.indexOf(' function pathToNode(',start);
 const snippet=source.slice(start,end),context={};
 class Text {constructor(data){this.data=data;this.length=data.length;}}
 const text=new Text('A\ud83d\ude00B'),selection={anchorNode:text,focusNode:text,anchorOffset:1,focusOffset:1,setBaseAndExtent(a,x,b,y){this.anchorNode=a;this.anchorOffset=x;this.focusNode=b;this.focusOffset=y;}};
 context.Text=Text;context.window={getSelection:()=>selection};vm.createContext(context);vm.runInContext(snippet,context);
 let changes=0,prevented=0;context.selectMessageWithKeyboard({key:'ArrowRight',shiftKey:true,preventDefault(){prevented++;}},{firstChild:text},()=>changes++);
 assert.equal(selection.focusOffset,3);assert.equal(selection.anchorOffset,1);assert.equal(text.data,'A\ud83d\ude00B');
 context.selectMessageWithKeyboard({key:'a',ctrlKey:true,preventDefault(){prevented++;}},{firstChild:text},()=>changes++);
 assert.equal(selection.anchorOffset,0);assert.equal(selection.focusOffset,4);assert.equal(changes,2);assert.equal(prevented,2);
});
test('abandoned IndexedDB upgrade closes a late successful connection',async()=>{
 const requests=[],context={TLCore:{check:C.check},indexedDB:{open(){const r={result:{close(){r.closed=true;}}};requests.push(r);return r;}}};
 vm.createContext(context);vm.runInContext(read('src/tl-store.js'),context);
 const promise=context.TLStore.open('isolated');requests[0].onblocked();
 await assert.rejects(promise,/IDB_UPGRADE_BLOCKED/);requests[0].onsuccess();assert.equal(requests[0].closed,true);
});
