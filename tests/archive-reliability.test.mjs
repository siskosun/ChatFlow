import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const installedVersion=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).version;
const MiB=1024**2;

function environment(){
 const records=new Map(),payloads=new Map(),imports=[];
 let reads=0;
 const context=vm.createContext({Blob,TextEncoder,TextDecoder,URL,Uint8Array,ArrayBuffer,DataView,DecompressionStream,crypto:webcrypto,structuredClone,console,chrome:{runtime:{getManifest:()=>({version:installedVersion})}}});
 vm.runInContext(fs.readFileSync(path.join(root,'src/tl-core.js'),'utf8'),context);
 const C=context.TLCore;
 context.TLStore={
  readArchive:async id=>structuredClone(records.get(id)||{capture:null,assets:[],passages:[]}),
  verifiedBlob:async sha=>{reads++;const blob=payloads.get(sha);C.check(blob instanceof Blob,'LOCAL_FILE_MISSING');C.check(await C.hashBlob(blob)===sha,'LOCAL_FILE_HASH_MISMATCH');return blob;},
  importCapture:async(snapshot,files,blobs,state,saveScope,passages)=>{imports.push({snapshot,files,blobs,state,saveScope,passages});return'import-'+imports.length;}
 };
 vm.runInContext(fs.readFileSync(path.join(root,'src/tl-passages.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'src/tl-archive.js'),'utf8'),context);
 function put({size=4,blob=new Blob(['data']),state='saved',captureState='ready',live=false,reason=null}={}){
  const id='capture_fixture',cid='conversation_archive_reliability';
  const snapshot=C.normalizeConversation({conversation_id:cid,title:'Synthetic archive',current_node:'n1',mapping:{n1:{parent:null,children:[],message:{id:'m1',author:{role:'user'},content:{parts:['Synthetic file only']},metadata:{attachments:[{id:'file_backup123',name:'fixture.bin',mime_type:'application/octet-stream',size}]}}}}},'https://chatgpt.com/c/'+cid);
  const sha=createHash('sha256').update('data').digest('hex');
  const asset={...snapshot.assets[0],state,size,sha256:state==='saved'?sha:null,reason,inLatestSnapshot:true};
  records.set(id,{capture:{id,snapshot,state:captureState,createdAt:'2026-11-03T00:00:00.000Z',updatedAt:'2026-11-03T00:00:00.000Z',saveScope:'all',live},assets:[asset],passages:[]});
  payloads.set(sha,blob);return{id,asset,view:records.get(id)};
 }
 return{C,A:context.TLArchive,records,payloads,imports,put,get reads(){return reads;}};
}

test('65 MiB file exports as bounded parts and restores exact bytes through production code',async()=>{
 const e=environment(),block=new Uint8Array(MiB);for(let i=0;i<block.length;i++)block[i]=(i*31+17)%251;
 const blob=new Blob(Array(65).fill(block)),hash=createHash('sha256');for(let i=0;i<65;i++)hash.update(block);
 const sha=hash.digest('hex'),{id,asset}=e.put({size:blob.size,blob});asset.sha256=sha;e.payloads.set(sha,blob);
 const out=await e.A.exportCapture(id);
 assert.equal(out.manifest.schema,'chatflow.archive/2');assert.equal(out.manifest.app.version,installedVersion);
 assert.equal(out.verification.restoreValidated,true);assert.equal(e.imports.length,0,'export validation must not import a second capture');
 assert.equal(out.manifest.files[0].parts.length,2);assert.deepEqual(Array.from(out.manifest.files[0].parts,p=>p.size),[64*MiB,MiB]);
 const entries=await e.A.readZip(out.blob);assert.ok([...entries.values()].every(x=>x.size<=64*MiB));
 await e.A.restore(out.blob);const restored=e.imports[0];assert.equal(restored.state,'ready');assert.equal(restored.files[0].size,65*MiB);
 assert.equal(restored.blobs.get(sha).size,65*MiB);
 const actual=createHash('sha256'),reader=restored.blobs.get(sha).stream().getReader();while(true){const r=await reader.read();if(r.done)break;actual.update(r.value);}reader.releaseLock();assert.equal(actual.digest('hex'),sha);
 // Canonical part order and sizes are required; a re-ordered list cannot be
 // repaired silently even when each ZIP entry has a valid CRC.
 const bad=structuredClone(out.manifest);bad.files[0].parts.reverse();assert.throws(()=>e.A.validateManifest(bad),/INVALID_ASSET_PART/);
 const missing=[];for(const entry of entries.values())if(entry.name!==out.manifest.files[0].parts[1].path)missing.push({name:entry.name,blob:await entry.blob()});
 const missingZip=await e.A.buildZip(missing);await assert.rejects(()=>e.A.restore(missingZip),/ARCHIVE_FILE_MISSING/);assert.equal(e.imports.length,1);
});

test('capture, live caching and partial download all block export before reading payloads',async()=>{
 for(const options of [{captureState:'capturing'},{live:true},{state:'downloading',size:262144,captureState:'partial'}]){
  const e=environment(),{id}=e.put(options);await assert.rejects(()=>e.A.exportCapture(id),/ARCHIVE_BUSY/);assert.equal(e.reads,0);assert.equal(e.imports.length,0);
 }
});

test('completed partial archive preserves missing status and restores without inventing bytes',async()=>{
 const e=environment(),{id,asset}=e.put({state:'unavailable',captureState:'partial',size:0,reason:'DOWNLOAD_INTERRUPTED'});
 // A stale progress counter is not part of the recoverable payload.
 asset.size=12345;
 const out=await e.A.exportCapture(id);assert.equal(out.manifest.state,'partial');assert.equal(out.manifest.files[0].size,0);assert.equal(out.manifest.files[0].sha256,null);
 await e.A.restore(out.blob);assert.equal(e.imports[0].state,'partial');assert.equal(e.imports[0].files[0].state,'unavailable');assert.equal(e.imports[0].files[0].reason,'DOWNLOAD_INTERRUPTED');assert.equal(e.imports[0].blobs.size,0);
});

test('export rejects total capacity over 256 MiB before hashing and never labels corrupt bytes backed up',async()=>{
 const big=environment(),{id}=big.put({size:256*MiB+1});await assert.rejects(()=>big.A.exportCapture(id),/ARCHIVE_EXPORT_LIMIT/);assert.equal(big.reads,0);assert.equal(big.imports.length,0);
 const corrupt=environment(),bad=corrupt.put({blob:new Blob(['evil'])});await assert.rejects(()=>corrupt.A.exportCapture(bad.id),/LOCAL_FILE_INTEGRITY_FAILED/);assert.equal(corrupt.imports.length,0);
});

test('same-content references are exported once and restore validation remains atomic on tampering',async()=>{
 const e=environment(),{id,asset,view}=e.put();view.assets.push({...asset,key:'asset_second',name:'second.bin'});view.capture.snapshot.assets.push({...view.capture.snapshot.assets[0],key:'asset_second',name:'second.bin'});
 const out=await e.A.exportCapture(id);assert.equal(e.reads,1);
 const entries=await e.A.readZip(out.blob);assert.equal([...entries.keys()].filter(n=>n.startsWith('assets/')).length,1);
 const bad=[];for(const entry of entries.values())bad.push({name:entry.name,blob:entry.name.startsWith('assets/')?new Blob(['evil']):await entry.blob()});
 const badZip=await e.A.buildZip(bad);await assert.rejects(()=>e.A.restore(badZip),/ARCHIVE_FILE_HASH_MISMATCH/);assert.equal(e.imports.length,0);
});

test('legacy single-entry archive/1 and ThreadLine backups remain readable',async()=>{
 const e=environment(),{id}=e.put(),out=await e.A.exportCapture(id),entries=await e.A.readZip(out.blob);
 for(const schema of ['chatflow.archive/1','threadline.archive/1']){
  const manifest=structuredClone(out.manifest);manifest.schema=schema;manifest.formatVersion=1;manifest.app.version='0.2';
  const packed=[];for(const entry of entries.values())packed.push({name:entry.name,blob:entry.name==='manifest.json'?new Blob([JSON.stringify(manifest)]):await entry.blob()});
  await e.A.restore(await e.A.buildZip(packed));
 }
 assert.equal(e.imports.length,2);assert.ok(e.imports.every(x=>x.state==='ready'));
});

test('archive source labels must agree with the hash-checked snapshot before import',async()=>{
 const e=environment(),{id}=e.put(),out=await e.A.exportCapture(id),entries=await e.A.readZip(out.blob);
 const manifest=structuredClone(out.manifest);manifest.source.conversationId='another_conversation123';
 const packed=[];for(const entry of entries.values())packed.push({name:entry.name,blob:entry.name==='manifest.json'?new Blob([JSON.stringify(manifest)]):await entry.blob()});
 const changed=await e.A.buildZip(packed);await assert.rejects(()=>e.A.restore(changed),/ARCHIVE_SOURCE_MISMATCH/);assert.equal(e.imports.length,0);
});
