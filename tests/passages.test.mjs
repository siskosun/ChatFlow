import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const name of ['tl-core.js','tl-passages.js'])vm.runInThisContext(fs.readFileSync(path.join(root,'src',name),'utf8'),{filename:name});
const C=globalThis.TLCore,P=globalThis.TLPassages;
function snapshot(text='Alpha important phrase omega'){
 const mapping={n1:{parent:null,children:[],message:{id:'message-1',author:{role:'assistant'},content:{parts:[text]}}}};
 return C.normalizeConversation({conversation_id:'passage_conversation_01',title:'Passage fixture',current_node:'n1',mapping},'https://chatgpt.com/c/passage_conversation_01');
}
function make(text='Alpha important phrase omega',selected='important phrase'){
 const s=snapshot(text),m=s.messages[0],start=m.text.indexOf(selected);
 return{snapshot:s,message:m,record:P.create({captureId:'capture-1',snapshot:s,message:m,text:selected,startOffset:start,endOffset:start+selected.length})};
}
test('creates source-bound passage with snapshot and message hashes plus local offsets',()=>{
 const {record,message}=make();
 assert.equal(record.schema,'chatflow.passage/1');assert.equal(record.captureId,'capture-1');
 assert.equal(record.conversationId,'passage_conversation_01');assert.equal(record.messageId,message.id);assert.equal(record.nodeId,message.nodeId);
 assert.match(record.snapshotHash,/^[a-f0-9]{64}$/);assert.match(record.messageHash,/^[a-f0-9]{64}$/);
 assert.equal(record.text,'important phrase');assert.equal(record.status,'anchored');
});
test('restores exact message hash and offset without searching another message',()=>{
 const x=make(),result=P.resolve(x.record,x.snapshot);
 assert.equal(result.status,'anchored');assert.equal(result.reason,'EXACT_MESSAGE_HASH_AND_OFFSET');
 assert.equal(x.message.text.slice(result.startOffset,result.endOffset),x.record.text);
});
test('allows unique exact passage recovery when surrounding message changes',()=>{
 const x=make(),changed=snapshot('New prefix. Alpha important phrase omega. New suffix.');
 const result=P.resolve(x.record,changed);
 assert.equal(result.status,'anchored');assert.equal(result.reason,'UNIQUE_EXACT_TEXT_IN_SOURCE_MESSAGE');
});
test('uses prefix and suffix to disambiguate duplicate text only inside the same message',()=>{
 const x=make('Before A target phrase B middle Before C target phrase D','target phrase');
 const changed=snapshot('Before A target phrase B middle and more Before C target phrase D');
 const result=P.resolve(x.record,changed);
 assert.equal(result.status,'anchored');assert.equal(result.start,changed.messages[0].text.indexOf('target phrase'));
});
test('marks repeated text ambiguous when context cannot distinguish candidates',()=>{
 const x=make('same target phrase and same target phrase','target phrase');
 const changed=snapshot('same target phrase and same target phrase');
 const altered={...x.record,messageHash:'0'.repeat(64),prefix:'',suffix:'',startOffset:0,endOffset:12};
 const result=P.resolve(altered,changed);
 assert.equal(result.status,'ambiguous');assert.equal(result.reason,'MULTIPLE_UNRESOLVED_OCCURRENCES');
});
test('marks missing source message, changed conversation and missing text stale',()=>{
 const x=make();
 const missing={...x.snapshot,messages:[]};
 assert.equal(P.resolve(x.record,missing).status,'stale');
 const other=structuredClone(x.snapshot);other.source.conversationId='another_conversation_01';
 assert.equal(P.resolve(x.record,other).reason,'CONVERSATION_CHANGED');
 const changed=snapshot('The source message has been replaced.');
 assert.equal(P.resolve(x.record,changed).status,'stale');
});
test('rejects invalid offsets, wrong selected text and message identity outside snapshot',()=>{
 const x=make();
 assert.throws(()=>P.create({captureId:'capture-1',snapshot:x.snapshot,message:x.message,text:'wrong',startOffset:0,endOffset:5}),/PASSAGE_TEXT_OFFSET_MISMATCH/);
 assert.throws(()=>P.create({captureId:'capture-1',snapshot:x.snapshot,message:{...x.message,nodeId:'foreign-node'},text:'important',startOffset:6,endOffset:15}),/PASSAGE_MESSAGE_NOT_IN_SNAPSHOT/);
 assert.throws(()=>P.create({captureId:'capture-1',snapshot:x.snapshot,message:x.message,text:'important',startOffset:-1,endOffset:8}),/INVALID_PASSAGE_RANGE/);
});

test('records overlapping repeated occurrences without skipping the selected offset',()=>{
 const s=snapshot('aaaa'),message=s.messages[0],record=P.create({captureId:'capture-1',snapshot:s,message,text:'aa',startOffset:1,endOffset:3});
 assert.equal(record.occurrence,1);
 assert.equal(P.resolve(record,snapshot('aaaa')).startOffset,1);
});

test('same-message manual reselection creates a new anchor while retaining the passage identity',()=>{
 const x=make(),changed=snapshot('The source message was edited and the previous excerpt removed.');
 assert.equal(P.resolve(x.record,changed).status,'stale');
 const message=changed.messages[0],text='source message',start=message.text.indexOf(text);
 const repairedAt=x.record.createdAt+1000,repaired=P.create({passageId:x.record.passageId,captureId:x.record.captureId,snapshot:changed,message,text,startOffset:start,endOffset:start+text.length,createdAt:x.record.createdAt,updatedAt:repairedAt,reanchoredAt:repairedAt,previousMessageHash:x.record.messageHash});
 assert.equal(repaired.passageId,x.record.passageId);
 assert.equal(repaired.createdAt,x.record.createdAt);
 assert.equal(repaired.updatedAt,repairedAt);
 assert.equal(repaired.reanchoredAt,repairedAt);
 assert.equal(repaired.previousMessageHash,x.record.messageHash);
 assert.equal(P.resolve(repaired,changed).status,'anchored');
});
test('a matching phrase in a different branch node cannot satisfy a passage anchor',()=>{
 const x=make(),other=structuredClone(x.snapshot);
 other.messages=[{...other.messages[0],id:'other-message',nodeId:'other-node'}];
 assert.equal(P.resolve(x.record,other).reason,'MESSAGE_NOT_FOUND');
});
