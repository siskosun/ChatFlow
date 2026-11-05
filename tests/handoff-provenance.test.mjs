import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
vm.runInThisContext(fs.readFileSync(new URL('../src/tl-core.js',import.meta.url),'utf8'),{filename:'tl-core.js'});
const C=globalThis.TLCore;
function fixture(){
 const mapping={
  first:{parent:null,children:['second'],message:{id:'message-first',author:{role:'assistant'},content:{parts:['First attachment.']},metadata:{attachments:[{id:'file_first',name:'report.pdf'},{id:'file_same_message',name:'report.pdf'}]}}},
  second:{parent:'first',children:[],message:{id:'message-second',author:{role:'assistant'},content:{parts:['Revised attachment.']},metadata:{attachments:[{id:'file_second',name:'report.pdf'}]}}},
 };
 return C.normalizeConversation({conversation_id:'provenance_fixture_123',title:'Repeated filenames',current_node:'second',mapping},'https://chatgpt.com/c/provenance_fixture_123');
}
test('same-name files retain exact message, node and reference identity through handoff preparation',()=>{
 const snapshot=fixture(),rows=snapshot.assets.map((a,i)=>({...a,state:'saved',size:10+i,sha256:String(i+1).repeat(64)})),plan=C.handoff(snapshot,rows,rows.map(a=>a.key)),files=plan.files.filter(f=>f.kind==='asset');
 assert.equal(files.length,3);assert.equal(new Set(files.map(f=>f.key)).size,3);
 for(let i=0;i<rows.length;i++)assert.deepEqual([files[i].key,files[i].messageId,files[i].nodeId,files[i].sha256],[rows[i].key,rows[i].messageId,rows[i].nodeId,rows[i].sha256]);
 assert.ok(files.every(f=>f.name==='report.pdf'));
 const history=plan.files.filter(f=>f.kind==='history').map(f=>f.text).join('');
 for(const row of rows)assert.ok(history.includes('引用键：'+row.key));
 const firstSection=history.slice(history.indexOf('## assistant · message-first'),history.indexOf('## assistant · message-second'));
 assert.ok(firstSection.includes(rows[0].key));assert.ok(firstSection.includes(rows[1].key));assert.equal(firstSection.includes(rows[2].key),false);
});
test('missing same-name file stays missing and is never represented by another saved file',()=>{
 const snapshot=fixture(),rows=snapshot.assets.map((a,i)=>({...a,state:i?'unavailable':'saved',reason:i?'HTTP_404':null,size:i?0:10,sha256:i?null:'a'.repeat(64)})),plan=C.handoff(snapshot,rows,[rows[0].key]);
 assert.equal(plan.files.filter(f=>f.kind==='asset').length,1);assert.equal(plan.missing.length,2);
 assert.throws(()=>C.handoff(snapshot,rows,[rows[1].key]),/SELECTED_FILE_NOT_SAVED/);
 assert.ok(C.history(snapshot).includes(rows[1].key));
});
test('legacy asset rows without provenance remain explicitly unknown instead of guessed by filename',()=>{
 const snapshot=fixture(),row={key:'legacy-record',name:'report.pdf',state:'saved',size:2,sha256:'a'.repeat(64),mime:'application/pdf'},plan=C.handoff(snapshot,[row],[row.key]),file=plan.files.find(f=>f.kind==='asset');
 assert.equal(file.key,row.key);assert.equal(file.messageId,null);assert.equal(file.nodeId,null);
});
