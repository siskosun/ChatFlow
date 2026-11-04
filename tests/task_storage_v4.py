"""Cloud-only task backup, pagination and v3->v4 migration on actual Chromium IDB.
Synthetic data only. No authenticated ChatGPT or user profile is used.
"""
import asyncio
import json
import os
import tempfile
import traceback
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)

CASES=r'''async()=>{
 const T=TLTasks,S=TLTaskStore,C=TLCore,report=[];
 const read=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 function check(value,message){if(!value)throw Error(message);}
 async function rejects(fn,code){let found='';try{await fn();}catch(e){found=e.message;}check(found===code,'Expected '+code+', got '+found);}
 const source=i=>({origin:'https://chatgpt.com',conversationId:'conversation_task_storage_'+i,url:'https://chatgpt.com/c/conversation_task_storage_'+i,title:'Synthetic task '+i});
 async function rawTx(names,mode,body,db=null){db=db||await TLStore.open();return new Promise((ok,no)=>{const tx=db.transaction(names,mode),stores=Object.fromEntries(names.map(n=>[n,tx.objectStore(n)]));let value,problem;tx.oncomplete=()=>ok(value);tx.onerror=()=>{};tx.onabort=()=>no(problem||tx.error);Promise.resolve().then(()=>body(stores)).then(r=>value=r).catch(e=>{problem=e;tx.abort();});});}
 const counts=()=>rawTx(['tasks','taskResults','taskImportRows'],'readonly',async s=>({tasks:await read(s.tasks.count()),results:await read(s.taskResults.count()),stage:await read(s.taskImportRows.count())}));
 const clearLive=()=>rawTx(['tasks','taskResults','taskSummaries','taskResultSummaries'],'readwrite',s=>{for(const store of Object.values(s))store.clear();});
 function fixtureBackup(tasks,results){const h=new C.SHA256(),parts=[];const append=(row,hash=true)=>{const{bytes}=T.backupLine(row);parts.push(bytes);if(hash)h.update(bytes);};append(T.backupHeader(tasks.length,results.length));for(const t of tasks)append({kind:'task',record:t});for(const r of results)append({kind:'result',record:r});append({kind:'end',tasks:tasks.length,results:results.length,sha256:h.hex()},false);return new Blob(parts);}
 await S.cleanupImports();await clearLive();
 // Migrate persisted v3 records in a separate real DB, without loading a giant
 // array during migration or deleting either original object store.
 const oldTask=T.createTask(source('migration'),'Existing task',{now:1000});
 const oldReceipt=T.createResult(oldTask,'Existing result',{manual:true,now:2000});
 const opening=indexedDB.open('chatflow-task-v3-fixture',3);
 opening.onupgradeneeded=()=>{const d=opening.result,a=d.createObjectStore('tasks',{keyPath:'id'});a.createIndex('code','code',{unique:true});const b=d.createObjectStore('taskResults',{keyPath:'id'});b.createIndex('task','taskId');b.createIndex('content',['taskId','textHash'],{unique:true});};
 const oldDb=await read(opening);await rawTx(['tasks','taskResults'],'readwrite',s=>{s.tasks.add(oldTask);s.taskResults.add(oldReceipt);},oldDb);oldDb.close();
 const migrated=await TLStore.open('chatflow-task-v3-fixture');check(migrated.version===TLStore.DB_VERSION,'Wrong upgraded DB version');
 const proof=await rawTx(['tasks','taskResults','taskSummaries','taskResultSummaries'],'readonly',async s=>({task:await read(s.tasks.get(oldTask.id)),result:await read(s.taskResults.get(oldReceipt.id)),summary:await read(s.taskSummaries.get(oldTask.id)),resultSummary:await read(s.taskResultSummaries.get(oldReceipt.id))}),migrated);
 check(JSON.stringify(proof.task)===JSON.stringify(oldTask)&&JSON.stringify(proof.result)===JSON.stringify(oldReceipt),'Migration changed original records');check(proof.summary.resultCount===1&&proof.summary.text===undefined&&proof.resultSummary.text===undefined,'Migration summaries lost count or copied full body');
 report.push({name:'v3_to_v4_preserves_task_and_receipt_with_body_free_summaries',result:'pass'});
 const legacy=await S.restoreBackup(new Blob([JSON.stringify({schema:'chatflow.task-bundle/1',tasks:[oldTask],results:[oldReceipt]})]));check(legacy.tasks===1&&legacy.results===1,'Legacy JSON restore failed');await S.remove(oldTask.id);
 report.push({name:'legacy_v1_json_backup_remains_importable',result:'pass'});
 const task=await S.create(source('large16'),'Test 16 near-limit results'),expected=[];
 for(let i=0;i<16;i++){const text=String(i).padStart(2,'0')+'x'.repeat(T.LIMITS.result-2),saved=await S.saveResult(task.id,text,true);expected.push({id:saved.result.id,hash:saved.result.textHash,text});}
 const backup=await S.exportBackup();check(backup.size>4*1024*1024,'Fixture did not cross old 4 MiB cap');await S.remove(task.id);const imported=await S.restoreBackup(backup);check(imported.tasks===1&&imported.results===16,'Large task backup counts changed');
 for(const row of expected){const got=await S.getResult(row.id);check(got.text===row.text&&got.textHash===row.hash,'Large receipt was truncated or changed');}
 check((await S.listPage()).items[0].resultCount===16,'Restored result summary count lost');
 report.push({name:'real_export_restore_16_maximum_results_above_4mib_preserves_bytes',result:'pass',backupBytes:backup.size});
 // Existing duplicate content must still validate its owning task and metadata.
 const goodReceipt=await S.getResult(expected[0].id),damaged={...goodReceipt,taskCode:'CF-ABCDEFGHJKLM'};
 if(damaged.taskCode===goodReceipt.taskCode)damaged.taskCode='CF-NPQRSTUVWXYZ';
 await rawTx(['taskResults'],'readwrite',s=>s.taskResults.put(damaged));
 await rejects(()=>S.saveResult(task.id,goodReceipt.text,true),'TASK_RESULT_INVALID');
 await rejects(()=>S.restoreBackup(backup),'TASK_RESULT_INVALID');
 check((await S.getResult(goodReceipt.id)).taskCode===damaged.taskCode,'Failed validation silently repaired or overwrote a damaged receipt');
 await rawTx(['taskResults'],'readwrite',s=>s.taskResults.put(goodReceipt));
 report.push({name:'duplicate_save_and_restore_refuse_damaged_existing_receipt',result:'pass'});
 // TextEncoder preserves the existing hash contract but maps unpaired UTF-16
 // surrogates to U+FFFD. Exact text comparison must prevent false deduplication.
 const surrogateTask=await S.create(source('surrogate'),'Exact text deduplication');
 const surrogateReceipt=await S.saveResult(surrogateTask.id,'\ud800',true);
 check((await S.saveResult(surrogateTask.id,'\ud800',true)).duplicate,'Identical receipt was not deduplicated');
 await rejects(()=>S.saveResult(surrogateTask.id,'\ud801',true),'TASK_RESULT_CONFLICT');
 await rejects(()=>S.saveResult(surrogateTask.id,'\ufffd',true),'TASK_RESULT_CONFLICT');
 check((await S.getResult(surrogateReceipt.result.id)).text==='\ud800'&&(await S.resultPage(surrogateTask.id)).total===1,'Conflicting text changed the saved receipt');
 await S.remove(surrogateTask.id);
 report.push({name:'same_utf8_hash_with_different_utf16_text_is_rejected_without_loss',result:'pass'});

 // A fully staged file with a bad final digest never changes live data.
 const second=T.createTask(source('badfooter'),'Must remain absent');
 const valid=fixtureBackup([second],[]),text=await valid.text(),bad=new Blob([text.replace(/("sha256":")[a-f0-9]{64}/,'$1'+'0'.repeat(64))]),before=await counts();
 await rejects(()=>S.restoreBackup(bad),'TASK_BACKUP_INTEGRITY_INVALID');check(!await S.get(second.id),'Bad footer committed an earlier task');check(JSON.stringify(await counts())===JSON.stringify(before),'Bad footer changed counts or retained staging');
 // A late live-data conflict rolls back even records inserted earlier in the
 // final transaction. The test's new UUID sorts before the conflicting UUID.
 const first=T.createTask(source('atomic'),'Atomic new task',{id:'00000000-0000-4000-8000-000000000001'}),conflict={...task,source:{...task.source,title:'Changed source title'}};
 await rejects(()=>S.restoreBackup(fixtureBackup([first,conflict],[])),'TASK_IMPORT_CONFLICT');check(!await S.get(first.id),'Final transaction left partial task');check(JSON.stringify(await counts())===JSON.stringify(before),'Conflict changed counts');
 report.push({name:'bad_footer_and_late_live_conflict_leave_no_partial_data',result:'pass'});
 // Crashed imports are removable; an active window's lock prevents cleanup.
 const stageRow={sessionId:'fixture',kind:'task',id:first.id,record:first};
 await navigator.locks.request('chatflow-task-import-v2',async()=>{await rawTx(['taskImportRows'],'readwrite',s=>s.taskImportRows.add(stageRow));await S.cleanupImports();check((await counts()).stage===1,'Cleanup removed an active import');});
 await S.cleanupImports();check((await counts()).stage===0,'Interrupted import was not cleaned');
 report.push({name:'import_cleanup_respects_active_lock_and_clears_abandoned_stage',result:'pass'});
 // Full record counts with representative task/result sizes (about 10 MiB of
 // text), plus the separate maximum-record fixture above. No private content.
 await clearLive();const tasks=[],results=[];for(let i=0;i<T.LIMITS.tasks;i++)tasks.push(T.createTask(source('scale_'+i),'Task '+i+' '+ 't'.repeat(2040),{now:1000+i}));
 for(let i=0;i<T.LIMITS.results;i++)results.push(T.createResult(tasks[i%tasks.length],'Result '+i+' '+ 'r'.repeat(4080),{manual:true,now:5000+i}));
 await S.restore({schema:'chatflow.task-bundle/1',tasks,results});
 const snapshot=await S.exportBackup();await clearLive();const started=performance.now(),full=await S.restoreBackup(snapshot),restoreMs=performance.now()-started;check(full.tasks===1000&&full.results===2000,'Full-count roundtrip changed record count');check(restoreMs<60000,'10 MiB full-count restore exceeded 60s cloud budget');
 // Hard invariant: ordinary lists cannot read full task/result stores, at any
 // body size. Ten metadata pages also have explicit runner-level timing gates.
 const originals={},blocked=[];for(const key of ['get','getAll','openCursor']){originals[key]=IDBObjectStore.prototype[key];IDBObjectStore.prototype[key]=function(...args){if(['tasks','taskResults'].includes(this.name)){blocked.push(this.name+'.'+key);throw Error('FULL_BODY_LIST_READ');}return originals[key].apply(this,args);};}
 const times=[];let one,two,receiptPage,choices;
 try{for(let i=0;i<10;i++){const now=performance.now();one=await S.listPage({limit:25});times.push(performance.now()-now);}two=await S.listPage({limit:25,cursor:one.nextCursor});receiptPage=await S.resultPage(tasks[0].id,{limit:1});choices=await S.taskChoices();}
 finally{for(const[key,method]of Object.entries(originals))IDBObjectStore.prototype[key]=method;}
 check(blocked.length===0&&one.items.length===25&&two.items.length===25&&one.total===1000,'Paged task summaries failed');check(!two.items.some(x=>one.items.some(y=>y.id===x.id)),'Cursor repeated a task');check(receiptPage.items.length===1&&receiptPage.total===2&&receiptPage.nextCursor,'Receipt page count failed');check(choices.length===1000&&choices.every(x=>x.text===undefined),'Task choices read full bodies');
 const sorted=times.slice().sort((a,b)=>a-b),p95=sorted[Math.ceil(sorted.length*.95)-1];check(times[0]<1500&&p95<500,'Summary query exceeded cloud performance budget');
 const r=await S.getResult(receiptPage.items[0].id);check(r.text.length>4000,'Detail load lost body');const matched=await S.match('['+tasks[0].code+']\nReturn');check(matched.task.id===tasks[0].id,'Indexed marker lookup failed');
 report.push({name:'1000_tasks_2000_receipts_roundtrip_and_paginate_without_body_reads',result:'pass',backupBytes:snapshot.size,restoreMs,firstPageMs:times[0],pageP95Ms:p95,budget:{coldPageMs:1500,p95PageMs:500,restoreMs:60000}});
 await rejects(()=>S.saveResult(tasks[0].id,'One receipt beyond capacity',true),'TASK_RESULT_STORAGE_LIMIT');check((await counts()).results===2000,'Over-capacity save changed record count');
 report.push({name:'result_capacity_failure_preserves_existing_2000_receipts',result:'pass'});
 return report;
}'''

async def main():
    report={'scope':'actual_chromium_indexeddb_synthetic_task_storage_v4','status':'fail','cases':[]}
    async with async_playwright() as pw:
      with tempfile.TemporaryDirectory(prefix='chatflow-task-v4-') as profile:
        context=await pw.chromium.launch_persistent_context(profile,channel='chromium',executable_path=os.environ.get('CHATFLOW_CHROMIUM'),headless=False,args=['--disable-extensions-except='+str(ROOT/'dist/edge'),'--load-extension='+str(ROOT/'dist/edge'),'--no-sandbox'])
        try:
            await context.route('http://**',lambda route:route.abort());await context.route('https://**',lambda route:route.abort())
            worker=context.service_workers[0] if context.service_workers else await context.wait_for_event('serviceworker')
            extension=worker.url.split('/')[2];page=await context.new_page();await page.goto('chrome-extension://'+extension+'/workspace/index.html')
            await page.wait_for_function('typeof TLTaskStore!=="undefined"')
            report['cases']=await page.evaluate(CASES);report['status']='pass'
            for case in report['cases']:print('PASS',case['name'],flush=True)
        except Exception as e:
            report['error']={'message':str(e),'traceback':traceback.format_exc()};raise
        finally:
            (OUT/'task-storage-v4-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False),flush=True);await context.close()
if __name__=='__main__':asyncio.run(main())
