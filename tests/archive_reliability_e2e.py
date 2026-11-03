"""Installed MV3 + real IndexedDB archive reliability, synthetic data only.

No account, ChatGPT network request or user file is used. Run after build.py.
The Node tests cover malformed archive boundaries; this script verifies actual
browser Blob/IndexedDB behavior for large files and interrupted downloads.
"""
import asyncio
import json
import os
import tempfile
import traceback
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)

CASES = r'''async()=>{
 const C=TLCore,S=TLStore,A=TLArchive,report=[],MiB=1024**2;
 function check(ok,message){if(!ok)throw Error(message);}
 async function rejects(fn,expected){let code='',out;try{out=await fn();}catch(e){code=e.message;}check(code===expected,'Expected '+expected+'; got '+code);check(out===undefined,'Rejected operation returned an archive');}
 function model(label,size){
  const cid='conversation_archive_browser_'+label;
  return C.normalizeConversation({conversation_id:cid,title:'Synthetic '+label,current_node:'n',mapping:{n:{parent:null,children:[],message:{id:'m',author:{role:'user'},content:{parts:['SYNTHETIC_ARCHIVE_'+label]},metadata:{attachments:[{id:'file_'+label,name:label+'.bin',mime_type:'application/octet-stream',size}]}}}}},'https://chatgpt.com/c/'+cid);
 }
 const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 async function count(store){const db=await S.open(),tx=db.transaction(store,'readonly');return request(tx.objectStore(store).count());}
 async function view(id){const v=await S.readArchive(id);return JSON.stringify(v);}
 async function seed(label,bytes){const id=C.id(),snapshot=model(label,bytes.length);await S.snapshot(id,snapshot);const key=snapshot.assets[0].key;await S.beginAsset(id,key);for(let i=0,seq=0;i<bytes.length;i+=262144,seq++)await S.chunk(id,key,seq,bytes.subarray(i,i+262144));const row=await S.finishAsset(id,key,'application/octet-stream');await S.finishCapture(id);return{id,key,row};}

 // Keep an unrelated archive to detect unexpected rewrites during export or
 // failed restore. All content in this isolated profile is synthetic.
 const sentinel=await seed('sentinel',new TextEncoder().encode('SYNTHETIC_SENTINEL_DO_NOT_CHANGE'));
 const sentinelBefore=await view(sentinel.id),sentinelHash=sentinel.row.sha256;

 // This uses the actual chunk persistence path, not a fake store or a metadata
 // row claiming a size. A separate native WebCrypto digest is the reference.
 const bytes=new Uint8Array(65*MiB);for(let i=0;i<bytes.length;i++)bytes[i]=(i*17+29)%251;
 const expected=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const started=performance.now(),large=await seed('large65',bytes),largeBefore=await view(large.id),capturesBefore=await count('captures'),filesBefore=await count('files');
 check(large.row.size===65*MiB&&large.row.sha256===expected,'Stored 65 MiB file differs from native reference');
 const exported=await A.exportCapture(large.id);
 check(exported.manifest.app.version===chrome.runtime.getManifest().version,'Archive records a stale application version');
 check(exported.manifest.schema==='chatflow.archive/2'&&exported.verification.restoreValidated===true,'Export was not validated for restore');
 const parts=exported.manifest.files[0].parts;check(parts.length===2&&parts[0].size===64*MiB&&parts[1].size===MiB,'Large attachment did not use bounded entries');
 check(await count('captures')===capturesBefore&&await count('files')===filesBefore,'Export verification wrote to IndexedDB');
 check(await view(large.id)===largeBefore,'Export mutated the source archive');
 const restored=await A.restore(exported.blob),copy=await S.get('captures',restored),copyAssets=await S.assets(restored),stored=await S.verifiedBlob(copyAssets[0].sha256);
 const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await stored.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
 check(copy.state==='ready'&&copyAssets.length===1&&copyAssets[0].size===65*MiB&&actual===expected,'Large archive did not restore exact bytes');
 check(await count('captures')===capturesBefore+1&&await count('files')===filesBefore,'Restore duplicated bytes or replaced an original capture');
 check(await view(large.id)===largeBefore&&await view(sentinel.id)===sentinelBefore,'Round trip changed an original archive');
 report.push({name:'65_mib_real_indexeddb_chunk_store_export_restore',result:'pass',bytes:65*MiB,sha256:actual,parts:parts.map(p=>p.size),elapsedMs:Math.round(performance.now()-started)});
 report.push({name:'export_restore_check_has_no_database_writes_and_uses_runtime_version',result:'pass',version:exported.manifest.app.version});

 // At least one persisted chunk must exist while the file remains unfinished.
 const pendingId=C.id(),pending=model('pending',MiB),pendingKey=pending.assets[0].key;
 await S.snapshot(pendingId,pending);await S.beginAsset(pendingId,pendingKey);await S.chunk(pendingId,pendingKey,0,new Uint8Array(262144).fill(9));
 const pendingBefore=await view(pendingId),pendingChunks=await count('chunks'),beforeBusy=await count('captures');
 check((await S.assets(pendingId))[0].size===262144&&pendingChunks>0,'Fixture did not persist a partial download');
 await rejects(()=>A.exportCapture(pendingId),'ARCHIVE_BUSY');
 check(await view(pendingId)===pendingBefore&&await count('chunks')===pendingChunks&&await count('captures')===beforeBusy,'Rejected export changed a download or source record');
 report.push({name:'export_with_persisted_downloading_chunk_is_rejected_without_mutation',result:'pass'});

 // Use the user-stop service operation, which clears unfinished chunks while
 // preserving already saved files. No background capture run is fabricated.
 const stopped=await chrome.runtime.sendMessage({type:'tl:stop',captureId:pendingId});check(stopped.ok,'Stop failed: '+stopped.code);
 const stoppedAsset=(await S.assets(pendingId))[0],stoppedBefore=await view(pendingId);
 check(stoppedAsset.state==='unavailable'&&stoppedAsset.size===0&&stoppedAsset.sha256===null,'Stop left progress bytes marked recoverable');
 const partial=await A.exportCapture(pendingId);check(partial.manifest.state==='partial','Stopped archive was presented as complete');
 const partialId=await A.restore(partial.blob),partialCapture=await S.get('captures',partialId),partialAssets=await S.assets(partialId);
 check(partialCapture.state==='partial'&&partialAssets[0].state==='unavailable'&&partialAssets[0].size===0&&partialAssets[0].sha256===null,'Partial restore invented saved attachment bytes');
 check(await view(pendingId)===stoppedBefore&&await view(sentinel.id)===sentinelBefore,'Partial round trip changed an original archive');
 report.push({name:'explicit_stop_then_partial_backup_restores_missing_state',result:'pass'});

 const live=await S.get('captures',sentinel.id);await S.set('captures',{...live,live:true});const liveBefore=await view(sentinel.id);
 await rejects(()=>A.exportCapture(sentinel.id),'ARCHIVE_BUSY');check(await view(sentinel.id)===liveBefore,'Live export rejection changed archive state');
 await S.set('captures',live);check(await view(sentinel.id)===sentinelBefore,'Clearing synthetic live flag changed the sentinel');
 check(await C.hashBlob(await S.verifiedBlob(sentinelHash))===sentinelHash,'Unrelated archive file changed');
 report.push({name:'live_capture_export_is_blocked_and_original_bytes_preserved',result:'pass'});
 return report;
}'''


async def main():
    result = {'scope': 'installed_mv3_real_indexeddb_synthetic_only',
              'cases': [], 'status': 'fail'}
    async with async_playwright() as pw:
        with tempfile.TemporaryDirectory(prefix='chatflow-archive-reliability-') as profile:
            context = None
            try:
                context = await pw.chromium.launch_persistent_context(
                    profile, channel='chromium',
                    executable_path=os.environ.get('CHATFLOW_CHROMIUM'),
                    headless=False,
                    args=['--disable-extensions-except='+str(ROOT/'dist/edge'),
                          '--load-extension='+str(ROOT/'dist/edge'), '--no-sandbox'])
                await context.route('http://**', lambda route: route.abort())
                await context.route('https://**', lambda route: route.abort())
                worker = context.service_workers[0] if context.service_workers else await context.wait_for_event('serviceworker')
                extension = worker.url.split('/')[2]
                page = await context.new_page()
                await page.goto('chrome-extension://'+extension+'/workspace/index.html')
                await page.wait_for_function('typeof TLArchive!=="undefined" && typeof TLStore!=="undefined"')
                ready = await page.evaluate('chrome.runtime.sendMessage({type:"tl:sessions"})')
                assert ready['ok'], ready
                result['browser'] = context.browser.version
                result['cases'] = await asyncio.wait_for(page.evaluate(CASES), timeout=240)
                result['status'] = 'pass'
                for case in result['cases']:
                    print('PASS', case['name'], flush=True)
            except Exception as exc:
                result['error'] = {'message': str(exc), 'traceback': traceback.format_exc()}
                raise
            finally:
                (OUT/'archive-reliability-report.json').write_text(
                    json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps(result, ensure_ascii=False), flush=True)
                if context:
                    await context.close()


if __name__ == '__main__':
    asyncio.run(main())
