/* ChatFlow IndexedDB, extension origin only. MIT. */
(() => {
 'use strict';
 const C=globalThis.TLCore,NAME='chatflow-local-archive-v1',openings=new Map();
 const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('IDB_REQUEST_FAILED'));});
 function captureSummary(c){return{id:c.id,title:c.snapshot?.title||c.title||'未完成采集',titleSearch:String(c.snapshot?.title||c.title||'').toLocaleLowerCase(),source:c.snapshot?.source||c.source||null,hasSnapshot:!!c.snapshot,messageCount:c.snapshot?.messages?.length||0,integrityState:c.snapshot?.integrity?.state||null,state:c.state,live:!!c.live,saveScope:c.saveScope||'all',createdAt:c.createdAt||'',updatedAt:c.updatedAt||c.createdAt||'',lastError:c.lastError||null,savedFiles:c.savedFiles||0,missingFiles:c.missingFiles||0,excludedFiles:c.excludedFiles||0};}
 function putCapture(stores,capture){stores.captures.put(capture);stores.captureSummaries.put(captureSummary(capture));}
 // Version 5 repairs v2 -> v4 databases whose existing passages store missed indexes.
 // No records, keys, archive formats or blob references are rewritten.
 const DB_VERSION = 5;
 const schema = {
  tasks: ['id', [['code','code',true]]],
  taskResults: ['id', [['task','taskId'], ['content',['taskId','textHash'],true]]],
  captures: ['id', []],
  assets: [['captureId','key'], [['capture','captureId']]],
  files: ['sha256', []],
  chunks: [['captureId','key','seq'], [['owner',['captureId','key']], ['capture','captureId']]],
  handoffs: ['id', []],
  passages: ['passageId', [['capture','captureId'], ['createdAt','createdAt'], ['source',['captureId','conversationId','messageId','nodeId']]]],
  captureSummaries: ['id', [['updatedAt',['updatedAt','id']], ['sourceScope',['source.origin','source.conversationId','saveScope']]]],
  taskSummaries: ['id', [['createdAt',['createdAt','id']]]],
  taskResultSummaries: ['id', [['task',['taskId','createdAt','id']], ['createdAt',['createdAt','id']]]],
  taskImportRows: [['sessionId','kind','id'], [['session','sessionId']]]
 };
 /** Convergent, atomic schema repair. Index creation errors abort the whole upgrade. */
 function upgrade(db, tx, oldVersion) {
  C.check(Number.isInteger(oldVersion) && oldVersion >= 0 && oldVersion < DB_VERSION, 'IDB_INVALID_OLD_VERSION');
  const hadCaptureSummaries = db.objectStoreNames.contains('captureSummaries');
  const hadTaskSummaries = db.objectStoreNames.contains('taskSummaries');
  const hadResultSummaries = db.objectStoreNames.contains('taskResultSummaries');
  for (const [name, [keyPath, indexes]] of Object.entries(schema)) {
   const store = db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, {keyPath});
   C.check(JSON.stringify(store.keyPath) === JSON.stringify(keyPath), 'IDB_SCHEMA_KEY_CONFLICT');
   for (const [indexName, path, unique = false] of indexes) {
    if (store.indexNames.contains(indexName)) {
     const prior = store.index(indexName);
     if (JSON.stringify(prior.keyPath) === JSON.stringify(path) && prior.unique === unique && !prior.multiEntry) continue;
     store.deleteIndex(indexName);
    }
    store.createIndex(indexName, path, {unique});
   }
  }
  if (!hadCaptureSummaries) {
   const cursor = tx.objectStore('captures').openCursor();
   cursor.onsuccess = () => {const row = cursor.result; if (row) {tx.objectStore('captureSummaries').put(captureSummary(row.value)); row.continue();}};
  }
  if (!hadTaskSummaries || !hadResultSummaries) {
   const summaries = tx.objectStore('taskSummaries'), results = tx.objectStore('taskResultSummaries');
   summaries.clear(); results.clear();
   const cursor = tx.objectStore('tasks').openCursor();
   cursor.onsuccess = () => {
    const row = cursor.result;
    if (row) {
     const t = row.value;
     summaries.put({id:t.id,code:t.code,source:t.source,preview:String(t.text||'').replace(/\s+/g,' ').slice(0,180),textHash:t.textHash,createdAt:t.createdAt,resultCount:0});
     row.continue(); return;
    }
    const receipts = tx.objectStore('taskResults').openCursor();
    receipts.onsuccess = () => {
     const receipt = receipts.result;
     if (!receipt) return;
     const v = receipt.value;
     results.put({id:v.id,taskId:v.taskId,taskCode:v.taskCode,textHash:v.textHash,assignment:v.assignment,createdAt:v.createdAt});
     const task = summaries.get(v.taskId);
     task.onsuccess = () => {if (task.result) summaries.put({...task.result,resultCount:task.result.resultCount+1}); receipt.continue();};
    };
   };
  }
 }
 function open(name=NAME){
  if(openings.has(name))return openings.get(name);
  const pending=new Promise((resolve,reject)=>{
   let abandoned=false, migrationError=null;
   const r=indexedDB.open(name,DB_VERSION);
   r.onupgradeneeded=event=>{
    if(abandoned){r.transaction.abort();r.result.close();return;}
    try{upgrade(r.result,r.transaction,event.oldVersion);}
    catch(error){migrationError=error;r.transaction.abort();}
   };
   r.onerror=()=>{abandoned=true;openings.delete(name);reject(migrationError||r.error||new Error('IDB_OPEN_FAILED'));};
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
  if(store==='captures')return transaction(['captures','captureSummaries'],'readwrite',s=>{putCapture(s,value);return value.id;});
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
 const readArchive=captureId=>transaction(['captures','assets','passages'],'readonly',async s=>{
  const [capture,assets,passages]=await Promise.all([request(s.captures.get(captureId)),request(s.assets.index('capture').getAll(captureId)),request(s.passages.index('capture').getAll(captureId))]);return{capture,assets,passages};
 });
 async function listCaptures({query='',cursor=null,limit=50}={}){
  C.check(typeof query==='string'&&query.length<=500&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'INVALID_ARCHIVE_PAGE');
  C.check(cursor===null||(Array.isArray(cursor)&&cursor.length===2&&cursor.every(v=>typeof v==='string')),'INVALID_ARCHIVE_CURSOR');
  const q=query.trim().toLocaleLowerCase();return transaction(['captureSummaries'],'readonly',s=>new Promise((resolve,reject)=>{
   const rows=[],keys=[],r=s.captureSummaries.index('updatedAt').openCursor(cursor?IDBKeyRange.upperBound(cursor,true):null,'prev');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c){resolve({items:rows,nextCursor:null});return;}if(!q||c.value.titleSearch.includes(q)){if(rows.length===limit){resolve({items:rows,nextCursor:keys.at(-1)});return;}rows.push(c.value);keys.push(c.key);}c.continue();};
  }));
 }
 async function findCapture(source,scope='all',preferredId=null){
  const rows=await transaction(['captureSummaries'],'readonly',s=>request(s.captureSummaries.index('sourceScope').getAll(IDBKeyRange.only([source.origin,source.conversationId,scope]))));
  const matches=rows.filter(c=>c.hasSnapshot||['error','interrupted','cancelled'].includes(c.state)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))),chosen=matches.find(c=>c.id===preferredId)||matches[0];return chosen?get('captures',chosen.id):null;
 }
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
  await transaction(['captures','captureSummaries','assets','chunks'],'readwrite',async s=>{
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
   putCapture(s,{id:captureId,snapshot:clean,createdAt:prev?.createdAt||now,updatedAt:now,state:'capturing',live:!!prev?.live,saveScope:prev?.saveScope||'all'});
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
  C.check(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=C.TRANSFER_CHUNK_BYTES,'INVALID_CHUNK');
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
  for(const summary of await all('captureSummaries'))if((summary.state==='capturing'||summary.live)&&!active.has(summary.id)){
   const c=await get('captures',summary.id);if(!c)continue;
   const rows=await assets(c.id);for(const a of rows)if(a.state==='downloading')await failAsset(c.id,a.key,'INTERRUPTED_RETRY_EXPLICITLY');
   await set('captures',{...c,state:c.state==='capturing'?'interrupted':c.state,live:false,cacheStoppedReason:'BROWSER_OR_WORKER_RESTART',updatedAt:new Date().toISOString()});
  }
 }
 async function removeCapture(captureId){
  // Delete only this archive and its handoffs. Compute shared-blob references under
  // one transaction, not from a stale snapshot that races another capture commit.
  await transaction(['captures','captureSummaries','assets','chunks','files','handoffs','passages'],'readwrite',async s=>{
   const current=await request(s.captures.get(captureId));if(!current)return;
   C.check(!current.live&&current.state!=='capturing','STOP_CAPTURE_BEFORE_DELETE');
   const removed=await request(s.assets.index('capture').getAll(captureId));
   for(const passage of await request(s.passages.index('capture').getAll(captureId)))s.passages.delete(passage.passageId);
   const candidateHashes=new Set(removed.map(a=>a.sha256).filter(Boolean));
   s.captures.delete(captureId);s.captureSummaries.delete(captureId);for(const a of removed)s.assets.delete([captureId,a.key]);
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
  await transaction(['captures','captureSummaries','assets','passages','files'],'readwrite',s=>{
   for(const[sha,blob]of blobs)s.files.put({sha256:sha,blob,size:blob.size});
   putCapture(s,{id:captureId,snapshot:snapshotCopy,state,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),imported:true,live:false,saveScope});for(const a of items)s.assets.put({...a,captureId});
   for(const p of importedPassages)s.passages.put(p);
  });return captureId;
 }
 /** Persist evidence only if the capture still has the exact verified contents. */
 async function recordVerification(captureId,receipt){
  const E=globalThis.TLEvidence,clean=E.validateReceipt(receipt);
  return transaction(['captures','captureSummaries','assets','passages'],'readwrite',async stores=>{
   const capture=await request(stores.captures.get(captureId));
   C.check(capture?.snapshot,'CAPTURE_NOT_FOUND');
   const assets=await request(stores.assets.index('capture').getAll(captureId));
   const passages=await request(stores.passages.index('capture').getAll(captureId));
   if(E.subject({capture,assets,passages})!==clean.subject)return false;
   const verifications=[...(capture.verifications||[]),clean].slice(-10);
   putCapture(stores,{...capture,verifications});return true;
  });
 }
 globalThis.TLStore=Object.freeze({DB_VERSION,recordVerification,open,get,all,set,assets,readArchive,listCaptures,findCapture,passages,allPassages,putPassage,deletePassage,updatePassageStatus,updatePassageColor,snapshot,beginAsset,chunk,finishAsset,failAsset,finishCapture,verifiedBlob,putBlob,recover,removeCapture,importCapture});
})();
