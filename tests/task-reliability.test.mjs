import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const ctx=vm.createContext({console,crypto:webcrypto,URL,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,ArrayBuffer,Blob,atob,btoa});
for(const f of ['tl-core.js','tl-tasks.js'])vm.runInContext(fs.readFileSync(new URL('../src/'+f,import.meta.url),'utf8'),ctx);
const T=ctx.TLTasks,C=ctx.TLCore;
const source={origin:'https://chatgpt.com',conversationId:'conversation_task_backup_fixture',url:'https://chatgpt.com/c/conversation_task_backup_fixture',title:'Synthetic backup fixture'};
const task=T.createTask(source,'A bounded task',{now:1000});
function backup(tasks,results,{footer=true}={}){const hash=new C.SHA256(),parts=[];function line(value,digest=true){const b=T.backupLine(value).bytes;parts.push(new Blob([b]));if(digest)hash.update(b);}line(T.backupHeader(tasks.length,results.length));for(const t of tasks)line({kind:'task',record:t});for(const r of results)line({kind:'result',record:r});if(footer)line({kind:'end',tasks:tasks.length,results:results.length,sha256:hash.hex()},false);return new Blob(parts,{type:'application/x-ndjson'});}
const result=(text,id=webcrypto.randomUUID())=>T.createResult(task,text,{manual:true,now:2000,id});

test('sixteen near-limit results exceed the old 4 MiB cap and roundtrip without truncation',async()=>{
 const results=Array.from({length:16},(_,i)=>result(String(i).padStart(2,'0')+'x'.repeat(T.LIMITS.result-2)));
 const old=T.validateBundle({schema:'chatflow.task-bundle/1',tasks:[task],results});assert.equal(old.results.length,16);
 const file=backup([task],results);assert.ok(file.size>4*1024*1024);
 const seen=[];const counts=await T.readBackup(file,(kind,r)=>{if(kind==='result')seen.push({id:r.id,length:r.text.length,hash:r.textHash});});
 assert.equal(counts.results,16);assert.deepEqual(seen,results.map(r=>({id:r.id,length:r.text.length,hash:r.textHash})));
});

test('record budget covers the maximum accepted UTF-16 text including worst JSON escaping',async()=>{
 for(const char of ['\u0000','\ud800','汉']){
  const r=result(char.repeat(T.LIMITS.result));const bytes=T.backupLine({kind:'result',record:r}).bytes;
  assert.ok(bytes.length-1<=T.LIMITS.backupRecordBytes);
  let recovered;await T.readBackup(backup([task],[r]),(kind,row)=>{if(kind==='result')recovered=row.text;});assert.equal(recovered,r.text);
 }
});

test('all 2000 allowed receipts have a backup path; excess count is rejected at the header',async()=>{
 const rows=Array.from({length:T.LIMITS.results},(_,i)=>result('Result '+i));const file=backup([task],rows);let seen=0;
 assert.equal((await T.readBackup(file,kind=>{if(kind==='result')seen++;})).results,T.LIMITS.results);assert.equal(seen,T.LIMITS.results);
 assert.throws(()=>T.backupHeader(1,T.LIMITS.results+1),/TASK_BUNDLE_LIMIT/);
});

test('missing footer, modified footer and appended records cannot finish restore validation',async()=>{
 const r=result('Original'),file=backup([task],[r]);
 await assert.rejects(T.readBackup(backup([task],[r],{footer:false})),/TASK_BACKUP_INCOMPLETE/);
 const text=await file.text();const bad=text.replace(/("sha256":")[a-f0-9]/,'$1z');await assert.rejects(T.readBackup(new Blob([bad])),/TASK_BACKUP_INTEGRITY_INVALID/);
 await assert.rejects(T.readBackup(new Blob([file,'{}\n'])),/TASK_BACKUP_TRAILING_DATA/);
});

test('orphan and duplicate records are rejected even with a valid whole-file digest',async()=>{
 const r=result('One');await assert.rejects(T.readBackup(backup([], [r])),/TASK_RESULT_ORPHAN/);
 await assert.rejects(T.readBackup(backup([task,task], [])),/TASK_BUNDLE_DUPLICATE/);
 await assert.rejects(T.readBackup(backup([task], [r,{...r,id:webcrypto.randomUUID()}])),/TASK_BUNDLE_DUPLICATE/);
});

test('oversized records and malformed UTF-8 fail before unbounded parsing',async()=>{
 await assert.rejects(T.readBackup(new Blob(['x'.repeat(T.LIMITS.backupRecordBytes+1)])),/TASK_BACKUP_RECORD_LIMIT/);
 await assert.rejects(T.readBackup(new Blob([new Uint8Array([0xff,0x0a])])),/TASK_BACKUP_UTF8_INVALID/);
});

test('summary records contain bounded previews and never hold result body text',()=>{
 const summary=T.taskSummary(task,3),receipt=T.resultSummary(result('Private synthetic body'));
 assert.equal(summary.text,undefined);assert.ok(summary.preview.length<=180);assert.equal(summary.resultCount,3);
 assert.equal(receipt.text,undefined);assert.equal(receipt.taskId,task.id);assert.ok(receipt.textHash);
});
