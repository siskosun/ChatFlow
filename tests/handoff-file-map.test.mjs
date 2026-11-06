import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
vm.runInThisContext(fs.readFileSync('src/tl-core.js','utf8'));
const C=TLCore,service=fs.readFileSync('src/tl-service.js','utf8');
const start=service.indexOf('async function prepareHandoff(msg){'),end=service.indexOf('\nasync function announce(',start);
assert.ok(start>=0&&end>start);
async function fixture({identical=false}={}){
 const mapping={};for(let i=0;i<4;i++)mapping['n'+i]={parent:i?'n'+(i-1):null,children:i<3?['n'+(i+1)]:[],message:{
  id:'m'+i,author:{role:i%2?'assistant':'user'},content:{parts:['Synthetic message '+i]},metadata:{
   attachments:[{id:'file-'+i,name:['report.pdf','report.pdf','conversation_history_001.md','handoff_index.md'][i]}]
  }
 }};
 const snapshot=C.normalizeConversation({conversation_id:'file-map-fixture',title:'Attachment sources',current_node:'n3',mapping},'https://chatgpt.com/c/file-map-fixture');
 const blobs=new Map(),rows=[];
 for(const asset of snapshot.assets){
  const blob=new Blob([identical?'same bytes':'bytes '+asset.key]),sha256=await C.hashBlob(blob);blobs.set(sha256,blob);
  rows.push({...asset,state:'saved',size:blob.size,sha256,mime:'application/octet-stream'});
 }
 const records=[],capture={id:'capture-files',state:'ready',snapshot};
 const S={get:async(store,id)=>store==='captures'&&id===capture.id?capture:null,assets:async()=>rows,
  all:async store=>store==='handoffs'?records:[],
  handoffsForCapture:async id=>records.filter(x=>x.captureId===id),
  pruneHandoffs:async()=>0,
  verifiedBlob:async hash=>{assert.ok(blobs.has(hash));return blobs.get(hash);},
  putBlob:async blob=>{const sha256=await C.hashBlob(blob);blobs.set(sha256,blob);return {sha256,size:blob.size};},
  set:async(store,row)=>{assert.equal(store,'handoffs');const prior=records.findIndex(x=>x.id===row.id);if(prior>=0)records[prior]=row;else records.push(row);return row;}};
 const prepare=vm.runInNewContext(service.slice(start,end)+'\nprepareHandoff',{C,S,Blob});
 return {prepare,rows,capture,blobs,records,msg:{captureId:capture.id,keys:rows.map(r=>r.key),instructions:'Continue',batchLimit:10}};
}
test('same names and reserved history/index names map to exact message and attachment references',async()=>{
 const f=await fixture(),h=await f.prepare(f.msg),assets=h.files.filter(x=>x.kind==='asset');
 assert.equal(new Set(h.files.map(x=>x.uploadName.toLowerCase())).size,h.files.length);
 assert.deepEqual(Array.from(assets.slice(0,2),x=>x.uploadName),['report.pdf','2_report.pdf']);
 assert.equal(assets[2].uploadName,'2_conversation_history_001.md');
 assert.equal(assets[3].uploadName,'2_handoff_index.md');
 const index=await f.blobs.get(h.files[0].sha256).text();
 for(const asset of assets){
  assert.ok(asset.messageId&&asset.nodeId&&asset.key);
  assert.ok(index.includes(JSON.stringify(asset.uploadName)));
  assert.ok(index.includes(JSON.stringify(asset.key)));
  assert.ok(index.includes(JSON.stringify(asset.messageId)));
  assert.ok(index.includes(JSON.stringify(asset.nodeId)));
 }
 const history=(await Promise.all(h.files.filter(x=>x.kind==='history').map(x=>f.blobs.get(x.sha256).text()))).join('');
 for(const asset of assets)assert.ok(history.includes(asset.key)||history.includes(JSON.stringify(asset.key)));
});
test('identical bytes at different source messages retain every source reference',async()=>{
 const f=await fixture({identical:true}),h=await f.prepare(f.msg),assets=h.files.filter(x=>x.kind==='asset');
 assert.equal(new Set(assets.map(x=>x.sha256)).size,1);
 assert.equal(new Set(assets.map(x=>x.key)).size,4);
 assert.equal(new Set(assets.map(x=>x.messageId)).size,4);
});
test('new mapping format does not reuse an older prepared handoff without source mappings',async()=>{
 const f=await fixture();
 const snapshotHash=new C.SHA256().update(JSON.stringify(C.persistedSnapshot(f.capture.snapshot))).hex();
 const oldFingerprint=new C.SHA256().update(JSON.stringify([f.capture.id,snapshotHash,f.capture.snapshot.active,[...new Set(f.msg.keys)],f.msg.instructions,f.msg.batchLimit])).hex();
 f.records.push({id:'legacy-prepared',state:'prepared',captureId:f.capture.id,snapshotHash,prepareFingerprint:oldFingerprint});
 const fresh=await f.prepare(f.msg);assert.notEqual(fresh.id,'legacy-prepared');
 const repeat=await f.prepare(f.msg);assert.equal(repeat.id,fresh.id);
});
\ntest('explicit blocked retry uses original identity and detaches the prior tab',async()=>{
 const f=await fixture(),prepared=await f.prepare(f.msg);
 const stored=f.records.find(x=>x.id===prepared.id);
 stored.state='injection_blocked';stored.targetTabId=123;stored.targetDocumentId='doc-old';
 const same=await f.prepare({...f.msg,retryBlocked:true});
 assert.equal(same.id,prepared.id);
 assert.equal(same.state,'prepared');
 assert.equal(same.targetTabId,null);
 assert.equal(same.targetDocumentId,null);
 assert.equal(same.retryCount,1);
 assert.equal(f.records.filter(x=>x.id===prepared.id).length,1);
});\n