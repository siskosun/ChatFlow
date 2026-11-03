/* ChatFlow IndexedDB, extension origin only. MIT. */
(() => {
 'use strict';
 const C=globalThis.TLCore,NAME='chatflow-local-archive-v1',openings=new Map();
 const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('IDB_REQUEST_FAILED'));});
 function open(name=NAME){
  if(openings.has(name))return openings.get(name);
  const pending=new Promise((resolve,reject)=>{
   let abandoned=false;
   const r=indexedDB.open(name,3);
   r.onupgradeneeded=()=>{
    if(abandoned){r.transaction.abort();r.result.close();return;}
    const db=r.result;
    if(!db.objectStoreNames.contains('tasks')){const t=db.createObjectStore('tasks',{keyPath:'id'});t.createIndex('code','code',{unique:true});}
    if(!db.objectStoreNames.contains('taskResults')){const r=db.createObjectStore('taskResults',{keyPath:'id'});r.createIndex('task','taskId');r.createIndex('content',['taskId','textHash'],{unique:true});}
    if(!db.objectStoreNames.contains('captures'))db.createObjectStore('captures',{keyPath:'id'});
    if(!db.objectStoreNames.contains('assets')){const a=db.createObjectStore('assets',{keyPath:['captureId','key']});a.createIndex('capture','captureId');}
    if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'sha256'});
    if(!db.objectStoreNames.contains('chunks')){const ch=db.createObjectStore('chunks',{keyPath:['captureId','key','seq']});ch.createIndex('owner',['captureId','key']);ch.createIndex('capture','captureId');}
    if(!db.objectStoreNames.contains('handoffs'))db.createObjectStore('handoffs',{keyPath:'id'});
    if(!db.objectStoreNames.contains('passages')){const p=db.createObjectStore('passages',{keyPath:'passageId'});p.createIndex('capture','captureId');p.createIndex('createdAt','createdAt');p.createIndex('source',['captureId','conversationId','messageId','nodeId']);}
   };
   r.onerror=()=>{abandoned=true;openings.delete(name);reject(r.error||new Error('IDB_OPEN_FAILED'));};
   r.onblocked=()=>{abandoned=true;openings.delete(name);reject(new Error('IDB_UPGRADE_BLOCKED_CLOSE_OTHER_WINDOWS'));};
   r.onsuccess=()=>{if(abandoned){r.result.close();return;}r.result.onversionchange=()=>{r.result.close();openings.delete(name);};resolve(r.result);};
  });
  openings.set(name,pending);return pending;
 }
 async function transaction(names,mode,body){
  const db=await open();return new Promise((resolve,reject)=>{
   const t=db.transaction(names,mode),stores=Object.fromEntries(names.map(n=>[n,t.objectStore(n)]));let result,problem;
   t.oncomplete=()=>resolve(result);t.onabort=()=>reject(problem||t.error||new Error('IDB_TRANSACTION_ABORTED'));t.onerror=()=>{};
   Promise.resolve().then(()=>body(stores,t)).then(r=>result=r).catch(e=>{problem=e;try{t.abort();}catch{reject(e);}});
  });
 }
 const get=(store,key)=>transaction([store],'readonly',s=>request(s[store].get(key)));
 const all=store=>transaction([store],'readonly',s=>request(s[store].getAll()));
 async function set(store,value){
  if(store!=='handoffs')return transaction([store],'readwrite',s=>request(s[store].put(value)));
  // A prepared handoff must never commit pointers to files/source concurrently deleted.
  return transaction(['handoffs','captures','files'],'readwrite',async s=>{
   C.check(value&&typeof value.captureId==='string'&&Array.isArray(value.files),'INVALID_HANDOFF_RECORD');
   C.check(await request(s.captures.get(value.captureId)),'HANDOFF_SOURCE_DELETED');
   for(const f of value.files){C.check(/^[a-f0-9]{64}$/.test(f.sha256||'')&&f.size>0,'INVALID_HANDOFF_FILE');const row=await request(s.files.get(f.sha256));C.check(row?.blob instanceof Blob&&row.size===f.size&&row.blob.size===f.size,'LOCAL_FILE_MISSING');}
   return request(s.handoffs.put(value));
  });
 }
 const assets=captureId=>transaction(['assets'],'readonly',s=>request(s.assets.index('capture').getAll(captureId)));
 const passages=captureId=>transaction(['passages'],'readonly',s=>request(s.passages.index('capture').getAll(captureId)));
 const allPassages=()=>transaction(['passages'],'readonly',s=>request(s.passages.getAll()));
 async function putPassage(record){
  C.check(record?.schema==='chatflow.passage/1'&&typeof record.passageId==='string'&&record.passageId.length>0&&record.passageId.length<=100,'INVALID_PASSAGE_RECORD');
  C.check(typeof record.captureId==='string'&&record.captureId.length>0&&record.captureId.length<=100&&typeof record.conversationId==='string'&&record.conversationId.length>0&&record.conversationId.length<=200&&typeof record.messageId==='string'&&record.messageId.length>0&&record.messageId.length<=500&&typeof record.nodeId==='string'&&record.nodeId.length>0&&record.nodeId.length<=500,'INVALID_PASSAGE_SOURCE');
  C.check(typeof record.text==='string'&&record.text.length>0&&record.text.length<=5000&&typeof record.prefix==='string'&&record.prefix.length<=160&&typeof record.suffix==='string'&&record.suffix.length<=160&&Number.isSafeInteger(record.startOffset)&&Number.isSafeInteger(record.endOffset)&&record.startOffset>=0&&record.endOffset>record.startOffset,'INVALID_PASSAGE_RANGE');
  C.check(/^[a-f0-9]{64}$/.test(record.snapshotHash||'')&&/^[a-f0-9]{64}$/.test(record.messageHash||''),'INVALID_PASSAGE_HASH');
  C.check(['yellow','green','blue','pink'].includes(record.color)&&record.status==='anchored'&&Number.isFinite(record.createdAt)&&Number.isFinite(record.updatedAt)&&Number.isSafeInteger(record.occurrence)&&record.occurrence>=0,'INVALID_PASSAGE_METADATA');
  return transaction(['captures','passages'],'readwrite',async s=>{
   const capture=await request(s.captures.get(record.captureId));C.check(capture?.snapshot,'PASSAGE_SOURCE_CAPTURE_MISSING');
   C.check(capture.snapshot.source?.conversationId===record.conversationId,'PASSAGE_SOURCE_CONVERSATION_MISMATCH');
   C.check(globalThis.TLPassages.snapshotHash(capture.snapshot)===record.snapshotHash,'PASSAGE_SNAPSHOT_HASH_MISMATCH');
   const sourceMessage=capture.snapshot.messages.find(m=>m.id===record.messageId&&m.nodeId===record.nodeId);
   C.check(sourceMessage,'PASSAGE_SOURCE_MESSAGE_MISSING');
   C.check(globalThis.TLPassages.messageHash(sourceMessage)===record.messageHash&&sourceMessage.role===record.role&&sourceMessage.text.slice(record.startOffset,record.endOffset)===record.text&&record.endOffset-record.startOffset===record.text.length,'PASSAGE_MESSAGE_HASH_MISMATCH');
   const resolved=globalThis.TLPassages?.resolve?.(record,capture.snapshot);
   C.check(resolved?.status==='anchored'&&resolved.message?.id===sourceMessage.id,'PASSAGE_NOT_ANCHORED_TO_SOURCE');
   const prior=await request(s.passages.get(record.passageId));
   if(prior)C.check(prior.captureId===record.captureId&&prior.messageId===record.messageId&&prior.nodeId===record.nodeId&&prior.createdAt===record.createdAt,'PASSAGE_IDENTITY_IMMUTABLE');
   else C.check(await request(s.passages.index('capture').count(record.captureId))<5000,'PASSAGE_COUNT_LIMIT');
   s.passages.put({...record,updatedAt:Date.now()});return record.passageId;
  });
 }
 async function deletePassage(passageId){return transaction(['passages'],'readwrite',async s=>{const row=await request(s.passages.get(passageId));if(row)s.passages.delete(passageId);return row||null;});}
 async function updatePassageStatus(passageId,status,reason){
  C.check(['anchored','ambiguous','stale'].includes(status),'INVALID_PASSAGE_STATUS');
  return transaction(['passages'],'readwrite',async s=>{const row=await request(s.passages.get(passageId));if(!row)return null;const updated={...row,status,reason:reason||null,updatedAt:Date.now()};s.passages.put(updated);return updated;});
 }
 async function updatePassageColor(passageId,color){
  C.check(['yellow','green','blue','pink'].includes(color),'INVALID_PASSAGE_COLOR');
  return transaction(['passages'],'readwrite',async s=>{const row=await request(s.passages.get(passageId));if(!row)return null;const updated={...row,color,updatedAt:Date.now()};s.passages.put(updated);return updated;});
 }
 const chunks=(captureId,key)=>transaction(['chunks'],'readonly',s=>request(s.chunks.index('owner').getAll(IDBKeyRange.only([captureId,key]))));
 async function snapshot(captureId,model){
  C.check(model?.schema==='threadline.snapshot/1','INVALID_SNAPSHOT');const clean=C.persistedSnapshot(model),now=new Date().toISOString();
  await transaction(['captures','assets','chunks'],'readwrite',async s=>{
   const prev=await request(s.captures.get(captureId)),prevSource=prev?.snapshot?.source||prev?.source;
   if(prevSource)C.check(prevSource.conversationId===clean.source.conversationId&&prevSource.origin===clean.source.origin,'CAPTURE_SOURCE_CHANGED');
   const prior=await request(s.assets.index('capture').getAll(captureId)),old=new Map(prior.map(a=>[a.key,a])),current=new Set(clean.assets.map(a=>a.key));
   const replacementIdentity=new Set(clean.assets.filter(a=>a.ref?.scheme&&a.ref.scheme!=='unsupported').map(a=>JSON.stringify([a.messageId,a.nodeId,a.name])));
   for(const a of clean.assets){const p=old.get(a.key);if(p?.state==='saved'&&(a.expectedSize==null||a.expectedSize===p.size))s.assets.put({...p,name:a.name,mime:a.mime==='application/octet-stream'?p.mime:a.mime,inLatestSnapshot:true});else s.assets.put({...a,captureId,inLatestSnapshot:true,sha256:null,size:0,chunks:0,state:['unavailable','excluded'].includes(a.state)?a.state:'discovered',reason:a.reason||null});}
   for(const a of prior)if(!current.has(a.key)){
    // Drop only an unresolved, unsaved DOM placeholder when the SAME source
    // message, node and filename now have an explicit attachment reference.
    // Never guess that different names or saved bytes represent one file.
    const replaced=a.ref?.scheme==='unsupported'&&a.state!=='saved'&&replacementIdentity.has(JSON.stringify([a.messageId,a.nodeId,a.name]));
    if(replaced){
     s.assets.delete([captureId,a.key]);
     for(const key of await request(s.chunks.index('owner').getAllKeys(IDBKeyRange.only([captureId,a.key]))))s.chunks.delete(key);
    }else s.assets.put({...a,inLatestSnapshot:false});
   }
   s.captures.put({id:captureId,snapshot:clean,createdAt:prev?.createdAt||now,updatedAt:now,state:'capturing',live:!!prev?.live,saveScope:prev?.saveScope||'all'});
  });return get('captures',captureId);
 }
 async function beginAsset(captureId,key){
  await transaction(['captures','assets','chunks'],'readwrite',async s=>{
   C.check(await request(s.captures.get(captureId)),'CAPTURE_NOT_FOUND');
   const a=await request(s.assets.get([captureId,key]));C.check(a,'UNKNOWN_ASSET');if(a.state==='saved')return;C.check(a.state!=='excluded','ASSET_EXCLUDED_BY_SAVE_SCOPE');
   const old=await request(s.chunks.index('owner').getAllKeys(IDBKeyRange.only([captureId,key])));old.forEach(k=>s.chunks.delete(k));
   s.assets.put({...a,state:'downloading',size:0,chunks:0,reason:null});
  });
 }
 async function chunk(captureId,key,seq,bytes){
  C.check(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=262144,'INVALID_CHUNK');
  await transaction(['assets','chunks'],'readwrite',async s=>{
   const a=await request(s.assets.get([captureId,key]));C.check(a?.state==='downloading','ASSET_NOT_DOWNLOADING');C.check(Number.isSafeInteger(seq)&&seq===a.chunks,'CHUNK_SEQUENCE_MISMATCH');
   s.chunks.put({captureId,key,seq,blob:new Blob([bytes])});s.assets.put({...a,chunks:seq+1,size:a.size+bytes.length});
  });
 }
 async function finishAsset(captureId,key,mime){
  const a=await get('assets',[captureId,key]);C.check(a?.state==='downloading','ASSET_NOT_DOWNLOADING');
  const parts=await chunks(captureId,key),hash=new C.SHA256();let size=0;C.check(parts.length===a.chunks&&a.chunks>0,'MISSING_ASSET_CHUNKS');
  for(let i=0;i<parts.length;i++){C.check(parts[i].seq===i,'CHUNK_SEQUENCE_MISMATCH');const bytes=new Uint8Array(await parts[i].blob.arrayBuffer());hash.update(bytes);size+=bytes.length;}
  C.check(size>0&&size===a.size,'EMPTY_OR_TRUNCATED_ASSET');if(a.expectedSize!=null)C.check(a.expectedSize===size,'SOURCE_SIZE_MISMATCH');
  const sha256=hash.hex(),type=typeof mime==='string'&&/^[\w.+-]+\/[\w.+-]+/.test(mime)?mime.split(';')[0]:a.mime,blob=new Blob(parts.map(p=>p.blob),{type});
  await transaction(['files','assets','chunks'],'readwrite',async s=>{
   const current=await request(s.assets.get([captureId,key]));C.check(current?.state==='downloading'&&current.size===size&&current.chunks===a.chunks,'ASSET_CHANGED_DURING_COMMIT');
   const existing=await request(s.files.get(sha256));if(!existing)s.files.put({sha256,blob,size});
   s.assets.put({...current,mime:type,state:'saved',sha256,size,savedAt:new Date().toISOString(),reason:null});parts.forEach(p=>s.chunks.delete([captureId,key,p.seq]));
  });return get('assets',[captureId,key]);
 }
 async function failAsset(captureId,key,reason){
  await transaction(['assets','chunks'],'readwrite',async s=>{
   const a=await request(s.assets.get([captureId,key]));if(!a||a.state==='saved'||a.state==='excluded')return;
   const old=await request(s.chunks.index('owner').getAllKeys(IDBKeyRange.only([captureId,key])));old.forEach(k=>s.chunks.delete(k));
   s.assets.put({...a,state:'unavailable',reason:String(reason||'DOWNLOAD_UNCONFIRMED').slice(0,150),chunks:0,size:0,sha256:null});
  });
 }
 async function finishCapture(captureId,requested='ready'){
  const rows=(await assets(captureId)).filter(a=>a.inLatestSnapshot!==false),c=await get('captures',captureId);C.check(c?.snapshot,'CAPTURE_NOT_FOUND');
  const excluded=rows.filter(a=>a.state==='excluded').length,missing=rows.filter(a=>a.state!=='saved'&&a.state!=='excluded').length,saved=rows.filter(a=>a.state==='saved').length,state=requested==='ready'?(missing||c.snapshot.integrity.state!=='valid'?'partial':'ready'):requested;
  await set('captures',{...c,state,updatedAt:new Date().toISOString(),savedFiles:saved,missingFiles:missing,excludedFiles:excluded});return get('captures',captureId);
 }
 async function verifiedBlob(sha256){
  C.check(/^[0-9a-f]{64}$/.test(sha256),'INVALID_CONTENT_HASH');const row=await get('files',sha256);
  C.check(row?.blob instanceof Blob,'LOCAL_FILE_MISSING');C.check(row.blob.size===row.size,'LOCAL_FILE_SIZE_MISMATCH');C.check(await C.hashBlob(row.blob)===sha256,'LOCAL_FILE_HASH_MISMATCH');return row.blob;
 }
 async function putBlob(blob){
  C.check(blob instanceof Blob&&blob.size>0,'EMPTY_ASSET');const sha256=await C.hashBlob(blob);
  if(!await get('files',sha256))await set('files',{sha256,blob,size:blob.size});return{sha256,size:blob.size};
 }
 async function recover(activeIds=[]){
  const active=new Set(activeIds);
  for(const c of await all('captures'))if((c.state==='capturing'||c.live)&&!active.has(c.id)){
   const rows=await assets(c.id);for(const a of rows)if(a.state==='downloading')await failAsset(c.id,a.key,'INTERRUPTED_RETRY_EXPLICITLY');
   await set('captures',{...c,state:c.state==='capturing'?'interrupted':c.state,live:false,cacheStoppedReason:'BROWSER_OR_WORKER_RESTART',updatedAt:new Date().toISOString()});
  }
 }
 async function removeCapture(captureId){
  // Delete only this archive and its handoffs. Compute shared-blob references under
  // one transaction, not from a stale snapshot that races another capture commit.
  await transaction(['captures','assets','chunks','files','handoffs','passages'],'readwrite',async s=>{
   const current=await request(s.captures.get(captureId));if(!current)return;
   C.check(!current.live&&current.state!=='capturing','STOP_CAPTURE_BEFORE_DELETE');
   const removed=await request(s.assets.index('capture').getAll(captureId));
   for(const passage of await request(s.passages.index('capture').getAll(captureId)))s.passages.delete(passage.passageId);
   const candidateHashes=new Set(removed.map(a=>a.sha256).filter(Boolean));
   s.captures.delete(captureId);for(const a of removed)s.assets.delete([captureId,a.key]);
   for(const key of await request(s.chunks.index('capture').getAllKeys(captureId)))s.chunks.delete(key);
   const handoffs=await request(s.handoffs.getAll());
   for(const h of handoffs)if(h.captureId===captureId){s.handoffs.delete(h.id);for(const f of h.files||[])candidateHashes.add(f.sha256);}
   const references=new Set((await request(s.assets.getAll())).map(a=>a.sha256).filter(Boolean));
   for(const h of handoffs)if(h.captureId!==captureId)for(const f of h.files||[])references.add(f.sha256);
   for(const sha of candidateHashes)if(sha&&!references.has(sha))s.files.delete(sha);
  });
 }
 async function importCapture(snapshotData,items,blobs,state,saveScope='all',passageRows=[]){
  const captureId=C.id();for(const[sha,blob]of blobs)C.check(blob instanceof Blob&&blob.size>0&&await C.hashBlob(blob)===sha,'IMPORT_HASH_MISMATCH');
  const snapshotCopy=C.persistedSnapshot(snapshotData),importedPassages=passageRows.map(p=>({...p,originPassageId:p.originPassageId||p.passageId,passageId:C.id(),captureId}));
  await transaction(['captures','assets','passages','files'],'readwrite',s=>{
   for(const[sha,blob]of blobs)s.files.put({sha256:sha,blob,size:blob.size});
   s.captures.put({id:captureId,snapshot:snapshotCopy,state,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),imported:true,live:false,saveScope});for(const a of items)s.assets.put({...a,captureId});
   for(const p of importedPassages)s.passages.put(p);
  });return captureId;
 }
 globalThis.TLStore=Object.freeze({open,get,all,set,assets,passages,allPassages,putPassage,deletePassage,updatePassageStatus,updatePassageColor,snapshot,beginAsset,chunk,finishAsset,failAsset,finishCapture,verifiedBlob,putBlob,recover,removeCapture,importCapture});
})();
