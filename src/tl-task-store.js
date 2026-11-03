/* Task records share the archive database but never depend on a captured transcript. MIT. */
(() => {
 'use strict';
 const S=globalThis.TLStore,T=globalThis.TLTasks,C=globalThis.TLCore;
 const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error||new Error('TASK_STORAGE_FAILED'));});
 async function tx(mode,body){const db=await S.open();return new Promise((ok,no)=>{const t=db.transaction(['tasks','taskResults'],mode),a=t.objectStore('tasks'),b=t.objectStore('taskResults');let result,problem;t.oncomplete=()=>ok(result);t.onerror=()=>{};t.onabort=()=>no(problem||t.error||new Error('TASK_TRANSACTION_ABORTED'));Promise.resolve().then(()=>body(a,b)).then(x=>result=x).catch(e=>{problem=e;try{t.abort();}catch{no(e);}});});}
 async function create(source,text){
  for(let i=0;i<4;i++){
   const t=T.createTask(source,text);
   try{return await tx('readwrite',async a=>{C.check(await req(a.count())<T.LIMITS.tasks,'TASK_STORAGE_LIMIT');if(await req(a.index('code').get(t.code)))throw new Error('TASK_CODE_COLLISION');await req(a.add(t));return t;});}
   catch(e){if(e.message!=='TASK_CODE_COLLISION')throw e;}
  }throw new Error('TASK_CODE_COLLISION');
 }
 const list=()=>tx('readonly',a=>req(a.getAll()));
 const get=id=>tx('readonly',a=>req(a.get(id)));
 const results=id=>tx('readonly',(a,b)=>id?req(b.index('task').getAll(id)):req(b.getAll()));
 async function saveResult(taskId,text,manual=false){return tx('readwrite',async(a,b)=>{
  const t=await req(a.get(taskId));C.check(t,'TASK_NOT_FOUND');const all=await req(a.getAll()),m=T.match(text,all);
  if(!manual)C.check(m.state==='matched'&&m.task.id===taskId,'TASK_MATCH_CONFLICT');
  const r=T.createResult(t,text,{manual}),prior=await req(b.index('content').get([taskId,r.textHash]));
  if(prior)return{result:prior,duplicate:true};C.check(await req(b.count())<T.LIMITS.results,'TASK_RESULT_STORAGE_LIMIT');await req(b.add(r));return{result:r,duplicate:false};
 });}
 async function remove(id){return tx('readwrite',async(a,b)=>{a.delete(id);for(const key of await req(b.index('task').getAllKeys(id)))b.delete(key);});}
 async function bundle(){return tx('readonly',async(a,b)=>T.validateBundle({schema:'chatflow.task-bundle/1',tasks:await req(a.getAll()),results:await req(b.getAll())}));}
 async function restore(raw){const data=T.validateBundle(raw);return tx('readwrite',async(a,b)=>{
  const existing=await req(a.getAll()),oldResults=await req(b.getAll());let addTasks=0,addResults=0;
  const ids=new Map(existing.map(t=>[t.id,t])),codes=new Map(existing.map(t=>[t.code,t.id])),rs=new Map(oldResults.map(r=>[r.id,r])),rk=new Map(oldResults.map(r=>[r.taskId+':'+r.textHash,r]));
  for(const t of data.tasks){const old=ids.get(t.id);C.check(!old||JSON.stringify(T.validateTask(old))===JSON.stringify(t),'TASK_IMPORT_CONFLICT');C.check(!codes.has(t.code)||codes.get(t.code)===t.id,'TASK_IMPORT_CONFLICT');if(!old)addTasks++;}
  for(const r of data.results){const old=rs.get(r.id),same=rk.get(r.taskId+':'+r.textHash);C.check(!old||JSON.stringify(old)===JSON.stringify(r),'TASK_IMPORT_CONFLICT');if(same)C.check(same.text===r.text&&same.assignment===r.assignment,'TASK_IMPORT_CONFLICT');if(!old&&!same)addResults++;}
  C.check(existing.length+addTasks<=T.LIMITS.tasks&&oldResults.length+addResults<=T.LIMITS.results,'TASK_STORAGE_LIMIT');
  for(const t of data.tasks)if(!ids.has(t.id))a.add(t);
  for(const r of data.results)if(!rs.has(r.id)&&!rk.has(r.taskId+':'+r.textHash))b.add(r);
  return{tasks:addTasks,results:addResults};
 });}
 globalThis.TLTaskStore=Object.freeze({create,list,get,results,saveResult,remove,bundle,restore});
})();
