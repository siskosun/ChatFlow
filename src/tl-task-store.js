/* Task records share the archive database but never depend on a captured transcript. MIT. */
(() => {
 'use strict';
 const S=globalThis.TLStore,T=globalThis.TLTasks,C=globalThis.TLCore;
 const LIVE=['tasks','taskResults','taskSummaries','taskResultSummaries'];
 const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error||new Error('TASK_STORAGE_FAILED'));});
 async function transaction(names,mode,body){const db=await S.open();return new Promise((ok,no)=>{const t=db.transaction(names,mode),stores=Object.fromEntries(names.map(n=>[n,t.objectStore(n)]));let result,problem;t.oncomplete=()=>ok(result);t.onerror=()=>{};t.onabort=()=>no(problem||t.error||new Error('TASK_TRANSACTION_ABORTED'));Promise.resolve().then(()=>body(stores)).then(x=>result=x).catch(e=>{problem=e;try{t.abort();}catch{no(e);}});});}
 const tx=(mode,body)=>transaction(LIVE,mode,s=>body(s.tasks,s.taskResults,s.taskSummaries,s.taskResultSummaries));
 function walk(request,visit){return new Promise((ok,no)=>{request.onerror=()=>no(request.error||new Error('TASK_STORAGE_FAILED'));request.onsuccess=()=>{const cursor=request.result;if(!cursor)return ok();Promise.resolve().then(()=>visit(cursor.value,cursor)).then(stop=>{if(stop===false)ok();else cursor.continue();}).catch(no);};});}
 async function create(source,text){
  for(let i=0;i<4;i++){
   const t=T.createTask(source,text);
   try{return await tx('readwrite',async(a,b,s)=>{C.check(await req(a.count())<T.LIMITS.tasks,'TASK_STORAGE_LIMIT');if(await req(a.index('code').get(t.code)))throw new Error('TASK_CODE_COLLISION');await req(a.add(t));s.add(T.taskSummary(t));return t;});}
   catch(e){if(e.message!=='TASK_CODE_COLLISION')throw e;}
  }throw new Error('TASK_CODE_COLLISION');
 }
 // Compatibility APIs for old callers. Production lists use summary pages below.
 const list=()=>tx('readonly',a=>req(a.getAll()));
 const get=id=>tx('readonly',a=>req(a.get(id)));
 const getResult=id=>tx('readonly',(a,b)=>req(b.get(id)));
 const results=id=>tx('readonly',(a,b)=>id?req(b.index('task').getAll(id)):req(b.getAll()));
 async function match(text){const parsed=T.marker(text);if(parsed.state!=='valid')return{state:parsed.state,task:null};return tx('readonly',async a=>{const t=await req(a.index('code').get(parsed.code));return t?{state:'matched',task:T.validateTask(t)}:{state:'unknown',task:null};});}
 async function saveResult(taskId,text,manual=false){return tx('readwrite',async(a,b,s,r)=>{
  const raw=await req(a.get(taskId));C.check(raw,'TASK_NOT_FOUND');const t=T.validateTask(raw),m=T.marker(text);
  if(!manual)C.check(m.state==='valid'&&m.code===t.code,'TASK_MATCH_CONFLICT');
  const result=T.createResult(t,text,{manual}),prior=await req(b.index('content').get([taskId,result.textHash]));
  if(prior){const validated=T.validateResult(prior,t);C.check(validated.text===result.text&&validated.assignment===result.assignment,'TASK_RESULT_CONFLICT');return{result:validated,duplicate:true};}C.check(await req(b.count())<T.LIMITS.results,'TASK_RESULT_STORAGE_LIMIT');await req(b.add(result));r.add(T.resultSummary(result));s.put(T.taskSummary(t,await req(b.index('task').count(taskId))));return{result,duplicate:false};
 });}
 async function remove(id){return tx('readwrite',async(a,b,s,r)=>{a.delete(id);s.delete(id);for(const key of await req(b.index('task').getAllKeys(id))){b.delete(key);r.delete(key);}});}
 function pageOptions({limit=25,cursor=null}={}){C.check(Number.isInteger(limit)&&limit>=1&&limit<=100,'TASK_PAGE_LIMIT');if(cursor)C.check(Number.isSafeInteger(cursor.createdAt)&&cursor.createdAt>0&&typeof cursor.id==='string'&&cursor.id.length<=100,'TASK_PAGE_CURSOR_INVALID');return{limit,cursor};}
 async function listPage(options={}){const{limit,cursor}=pageOptions(options);return transaction(['taskSummaries'],'readonly',async s=>{const store=s.taskSummaries,items=[],total=await req(store.count()),range=cursor?IDBKeyRange.upperBound([cursor.createdAt,cursor.id],true):null;await walk(store.index('createdAt').openCursor(range,'prev'),row=>{items.push(row);return items.length<=limit;});const more=items.length>limit;if(more)items.pop();const last=items[items.length-1];return{items,total,nextCursor:more?{createdAt:last.createdAt,id:last.id}:null};});}
 async function resultPage(taskId,options={}){const{limit,cursor}=pageOptions(options);C.check(typeof taskId==='string'&&taskId.length<=100,'TASK_NOT_FOUND');return transaction(['taskResultSummaries'],'readonly',async s=>{const index=s.taskResultSummaries.index('task'),items=[],lo=[taskId,0,''],hi=[taskId,Number.MAX_SAFE_INTEGER,'\uffff'],all=IDBKeyRange.bound(lo,hi),total=await req(index.count(all)),range=cursor?IDBKeyRange.bound(lo,[taskId,cursor.createdAt,cursor.id],false,true):all;await walk(index.openCursor(range,'prev'),row=>{items.push(row);return items.length<=limit;});const more=items.length>limit;if(more)items.pop();const last=items[items.length-1];return{items,total,nextCursor:more?{createdAt:last.createdAt,id:last.id}:null};});}
 const taskChoices=()=>transaction(['taskSummaries'],'readonly',s=>req(s.taskSummaries.getAll()));
 async function bundle(){return tx('readonly',async(a,b)=>T.validateBundle({schema:'chatflow.task-bundle/1',tasks:await req(a.getAll()),results:await req(b.getAll())}));}
 // The entire export is one readonly IDB snapshot. Only one bounded record is
 // stringified at a time; Blob parts hold bytes, not a giant UTF-16 JSON string.
 async function exportBackup(){return transaction(['tasks','taskResults'],'readonly',async s=>{
  const counts={tasks:await req(s.tasks.count()),results:await req(s.taskResults.count())},parts=[],hash=new C.SHA256(),byId=new Map();
  function append(row,digest=true){const{bytes}=T.backupLine(row);parts.push(new Blob([bytes]));if(digest)hash.update(bytes);}
  append(T.backupHeader(counts.tasks,counts.results));
  await walk(s.tasks.openCursor(),raw=>{const t=T.validateTask(raw);byId.set(t.id,{id:t.id,code:t.code,createdAt:t.createdAt});append({kind:'task',record:t});});
  await walk(s.taskResults.openCursor(),raw=>{const t=byId.get(raw.taskId);C.check(t,'TASK_RESULT_ORPHAN');append({kind:'result',record:T.validateResult(raw,t)});});
  append({kind:'end',...counts,sha256:hash.hex()},false);return new Blob(parts,{type:'application/x-ndjson'});
 });}
 async function mergeTask(stores,t){const a=stores.tasks,s=stores.taskSummaries,old=await req(a.get(t.id)),code=await req(a.index('code').getKey(t.code));C.check(!old||JSON.stringify(T.validateTask(old))===JSON.stringify(t),'TASK_IMPORT_CONFLICT');C.check(code===undefined||code===t.id,'TASK_IMPORT_CONFLICT');if(old)return false;await req(a.add(t));s.add(T.taskSummary(t));return true;}
 async function mergeResult(stores,r){const b=stores.taskResults,old=await req(b.get(r.id)),same=await req(b.index('content').get([r.taskId,r.textHash]));if(old||same){const task=await req(stores.tasks.get(r.taskId));C.check(task,'TASK_RESULT_ORPHAN');const owner=T.validateTask(task);if(old)T.validateResult(old,owner);if(same)T.validateResult(same,owner);}C.check(!old||JSON.stringify(old)===JSON.stringify(r),'TASK_IMPORT_CONFLICT');if(same)C.check(same.text===r.text&&same.assignment===r.assignment,'TASK_IMPORT_CONFLICT');if(old||same)return false;await req(b.add(r));stores.taskResultSummaries.add(T.resultSummary(r));const t=await req(stores.taskSummaries.get(r.taskId));C.check(t,'TASK_RESULT_ORPHAN');stores.taskSummaries.put({...t,resultCount:t.resultCount+1});return true;}
 async function restore(raw){const data=T.validateBundle(raw);return transaction(LIVE,'readwrite',async s=>{let addTasks=0,addResults=0;const tasks=await req(s.tasks.count()),results=await req(s.taskResults.count());for(const t of data.tasks)if(await mergeTask(s,t)){addTasks++;C.check(tasks+addTasks<=T.LIMITS.tasks,'TASK_STORAGE_LIMIT');}for(const r of data.results)if(await mergeResult(s,r)){addResults++;C.check(results+addResults<=T.LIMITS.results,'TASK_STORAGE_LIMIT');}return{tasks:addTasks,results:addResults};});}
 const importLock='chatflow-task-import-v2';
 function locks(){const value=globalThis.navigator?.locks;C.check(value?.request,'TASK_IMPORT_LOCK_UNAVAILABLE');return value;}
 const clearStage=()=>transaction(['taskImportRows'],'readwrite',s=>req(s.taskImportRows.clear()));
 // A lock held for the whole import prevents another window from clearing an
 // active stage. Crash/page close releases it, so the next startup can clean up.
 async function cleanupImports(){return locks().request(importLock,{ifAvailable:true},lock=>lock?clearStage():undefined);}
 async function restoreBackup(blob){
  C.check(blob instanceof Blob&&blob.size>0&&blob.size<=T.LIMITS.backupBytes,'TASK_BUNDLE_LIMIT');
  const prefix=await blob.slice(0,4096).text(),first=prefix.split('\n',1)[0];let header;try{header=JSON.parse(first);}catch{}
  if(header?.schema!=='chatflow.task-backup/2'){C.check(blob.size<=T.LIMITS.bundle,'TASK_LEGACY_BACKUP_LIMIT');return restore(JSON.parse(await blob.text()));}
  return locks().request(importLock,async()=>{
   await clearStage();const sessionId=crypto.randomUUID();let batch=[];
   async function flush(){if(!batch.length)return;const rows=batch;batch=[];await transaction(['taskImportRows'],'readwrite',s=>{for(const row of rows)s.taskImportRows.add(row);});}
   try{
    const expected=await T.readBackup(blob,async(kind,record)=>{batch.push({sessionId,kind,id:record.id,record});if(batch.length===8)await flush();});await flush();
    return await transaction([...LIVE,'taskImportRows'],'readwrite',async s=>{
     let addTasks=0,addResults=0,seenTasks=0,seenResults=0;const tasks=await req(s.tasks.count()),results=await req(s.taskResults.count());
     const range=kind=>IDBKeyRange.bound([sessionId,kind,''],[sessionId,kind,'\uffff']);
     await walk(s.taskImportRows.openCursor(range('task')),async row=>{seenTasks++;if(await mergeTask(s,row.record)){addTasks++;C.check(tasks+addTasks<=T.LIMITS.tasks,'TASK_STORAGE_LIMIT');}});
     await walk(s.taskImportRows.openCursor(range('result')),async row=>{seenResults++;if(await mergeResult(s,row.record)){addResults++;C.check(results+addResults<=T.LIMITS.results,'TASK_STORAGE_LIMIT');}});
     C.check(seenTasks===expected.tasks&&seenResults===expected.results,'TASK_BACKUP_STAGE_INCOMPLETE');s.taskImportRows.clear();return{tasks:addTasks,results:addResults};
    });
   }finally{await clearStage();}
  });
 }
 globalThis.TLTaskStore=Object.freeze({create,list,get,getResult,results,match,saveResult,remove,listPage,resultPage,taskChoices,bundle,restore,exportBackup,restoreBackup,cleanupImports});
 // Opportunistic cleanup only; it cannot acquire the lock of an active import.
 if(globalThis.navigator?.locks)cleanupImports().catch(()=>{});
})();
