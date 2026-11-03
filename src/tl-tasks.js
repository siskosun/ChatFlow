/* ChatFlow lightweight task envelopes. Local routing hints, NOT authentication. MIT. */
(() => {
 'use strict';
 const C=globalThis.TLCore,check=C.check;
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 const CODE=/^CF-[A-HJ-NP-Z2-9]{12}$/;
 const LIMITS=Object.freeze({task:20000,result:262144,bundle:4*1024*1024,tasks:1000,results:2000});
 const digest=text=>new C.SHA256().update(text).hex();
 const plain=x=>C.record(x)&&Object.getPrototypeOf(x)!==Array.prototype;
 function source(raw){
  check(plain(raw)&&typeof raw.url==='string'&&raw.url.length<=2048,'TASK_SOURCE_REQUIRED');
  const u=new URL(raw.url),s=C.chatUrl(raw.url);
  check(!u.search&&!u.hash&&/^\/(?:g\/[A-Za-z0-9_-]+\/)?c\/[A-Za-z0-9_-]{8,200}\/?$/.test(u.pathname),'TASK_SOURCE_URL_INVALID');
  check(s.origin===raw.origin&&s.conversationId===raw.conversationId,'TASK_SOURCE_ID_MISMATCH');
  const optional=value=>value==null?null:(check(typeof value==='string'&&value.length>0&&value.length<=500,'TASK_ANCHOR_INVALID'),value);
  return {origin:s.origin,conversationId:s.conversationId,url:s.url,title:typeof raw.title==='string'?C.scrubText(raw.title).slice(0,300):'',messageId:optional(raw.messageId),nodeId:optional(raw.nodeId)};
 }
 function makeCode(){const a=new Uint8Array(12);crypto.getRandomValues(a);const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return'CF-'+Array.from(a,x=>chars[x%32]).join('');}
 function createTask(raw,text,{now=Date.now(),code=makeCode(),id=crypto.randomUUID()}={}){
  check(typeof text==='string'&&text.trim().length>0&&text.length<=LIMITS.task,'TASK_TEXT_LIMIT');
  return validateTask({schema:'chatflow.task/1',id,code,source:source(raw),text,textHash:digest(text),createdAt:now});
 }
 function validateTask(t){
  check(plain(t)&&t.schema==='chatflow.task/1'&&UUID.test(t.id||'')&&CODE.test(t.code||''),'TASK_RECORD_INVALID');
  check(typeof t.text==='string'&&!!t.text.trim()&&t.text.length<=LIMITS.task,'TASK_TEXT_LIMIT');
  check(t.textHash===digest(t.text)&&Number.isSafeInteger(t.createdAt)&&t.createdAt>0,'TASK_INTEGRITY_INVALID');
  return{schema:t.schema,id:t.id,code:t.code,source:source(t.source),text:t.text,textHash:t.textHash,createdAt:t.createdAt};
 }
 function envelope(task){const t=validateTask(task);return'['+t.code+']\n\n'+t.text+'\n\n\u8bf7\u5728\u56de\u590d\u9996\u884c\u539f\u6837\u4fdd\u7559 ['+t.code+']\u3002\u8be5\u6807\u8bb0\u4ec5\u7528\u4e8e\u5b9a\u4f4d\u539f\u4efb\u52a1\uff0c\u4e0d\u4ee3\u8868\u4efb\u52a1\u5df2\u9a8c\u6536\u3002';}
 function match(text,tasks){
  check(typeof text==='string'&&text.trim().length>0&&text.length<=LIMITS.result,'TASK_RESULT_LIMIT');
  // Only a standalone token line is authoritative. Quoted prompts/body text are not.
  const markerLines=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>/^\[CF-[^\]\s]+\]$/.test(s));
  const codes=[...new Set(markerLines.map(s=>s.slice(1,-1)))];
  const firstLine=text.split(/\r?\n/).map(s=>s.trim()).find(Boolean)||'';
  if(!/^\[CF-[^\]\s]+\]$/.test(firstLine))return{state:'missing',task:null};
  if(!codes.length)return{state:'missing',task:null};
  if(codes.length!==1)return{state:'conflict',task:null};
  if(!CODE.test(codes[0]))return{state:'invalid',task:null};
  const found=tasks.filter(t=>t.code===codes[0]);
  if(found.length!==1)return{state:found.length?'conflict':'unknown',task:null};
  return{state:'matched',task:validateTask(found[0])};
 }
 function createResult(task,text,{manual=false,now=Date.now(),id=crypto.randomUUID()}={}){
  const t=validateTask(task);check(typeof text==='string'&&!!text.trim()&&text.length<=LIMITS.result,'TASK_RESULT_LIMIT');
  const m=match(text,[t]);check(manual||m.state==='matched','TASK_MARKER_MISMATCH');
  return validateResult({schema:'chatflow.task-result/1',id,taskId:t.id,taskCode:t.code,text,textHash:digest(text),assignment:manual?'manual_assigned':'marker_matched',createdAt:now},t);
 }
 function validateResult(r,task){
  check(plain(r)&&r.schema==='chatflow.task-result/1'&&UUID.test(r.id||'')&&r.taskId===task.id&&r.taskCode===task.code,'TASK_RESULT_INVALID');
  check(typeof r.text==='string'&&!!r.text.trim()&&r.text.length<=LIMITS.result&&r.textHash===digest(r.text),'TASK_RESULT_INTEGRITY_INVALID');
  check(['marker_matched','manual_assigned'].includes(r.assignment)&&Number.isSafeInteger(r.createdAt)&&r.createdAt>=task.createdAt,'TASK_RESULT_METADATA_INVALID');
  if(r.assignment==='marker_matched')check(match(r.text,[task]).state==='matched','TASK_MARKER_MISMATCH');
  return{schema:r.schema,id:r.id,taskId:r.taskId,taskCode:r.taskCode,text:r.text,textHash:r.textHash,assignment:r.assignment,createdAt:r.createdAt};
 }
 function validateBundle(raw){
  check(plain(raw)&&raw.schema==='chatflow.task-bundle/1'&&Array.isArray(raw.tasks)&&Array.isArray(raw.results),'TASK_BUNDLE_INVALID');
  check(raw.tasks.length<=LIMITS.tasks&&raw.results.length<=LIMITS.results,'TASK_BUNDLE_LIMIT');
  check(new TextEncoder().encode(JSON.stringify(raw)).length<=LIMITS.bundle,'TASK_BUNDLE_LIMIT');
  const tasks=raw.tasks.map(validateTask),ids=new Set(),codes=new Set();
  for(const t of tasks){check(!ids.has(t.id)&&!codes.has(t.code),'TASK_BUNDLE_DUPLICATE');ids.add(t.id);codes.add(t.code);}
  const byId=new Map(tasks.map(t=>[t.id,t])),resultIds=new Set(),resultKeys=new Set();
  const results=raw.results.map(r=>{const t=byId.get(r.taskId);check(t,'TASK_RESULT_ORPHAN');const v=validateResult(r,t),key=v.taskId+':'+v.textHash;check(!resultIds.has(v.id)&&!resultKeys.has(key),'TASK_BUNDLE_DUPLICATE');resultIds.add(v.id);resultKeys.add(key);return v;});
  return{schema:raw.schema,tasks,results};
 }
 globalThis.TLTasks=Object.freeze({LIMITS,source,makeCode,createTask,validateTask,envelope,match,createResult,validateResult,validateBundle,digest});
})();
