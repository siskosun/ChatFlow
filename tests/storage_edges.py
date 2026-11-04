"""Cloud-only IndexedDB regression on the actual MV3 extension origin.
No ChatGPT connection, account, user files, or in-memory database substitute.
"""
import asyncio
import os
import json
import tempfile
import traceback
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)

CASES=r'''async()=>{
 const C=TLCore,S=TLStore,report=[];
 function check(ok,message){if(!ok)throw Error(message);}
 async function rejects(fn,expected){let found='';try{await fn();}catch(e){found=e.message;}check(found===expected,'Expected '+expected+'; received '+found);}
 function model(label,size=null){
  const conversation_id='conversation_storage_'+label;
  return C.normalizeConversation({conversation_id,title:'Synthetic storage '+label,current_node:'n',mapping:{n:{parent:null,children:[],message:{id:'m',author:{role:'user'},content:{parts:['synthetic source']},metadata:{attachments:[{id:'file_shared',name:'data.bin',mime_type:'application/octet-stream',...(size===null?{}:{size})}]}}}}},'https://chatgpt.com/c/'+conversation_id);
 }
 async function save(label,bytes){
  const id=C.id(),snapshot=model(label,bytes.length);await S.snapshot(id,snapshot);
  const key=snapshot.assets[0].key;await S.beginAsset(id,key);await S.chunk(id,key,0,bytes);
  const asset=await S.finishAsset(id,key,'application/octet-stream');await S.finishCapture(id);
  return{id,key,asset};
 }
 const passageCapture=await save('passage',new TextEncoder().encode('passage-source'));
 const passageSnapshot=(await S.get('captures',passageCapture.id)).snapshot,passageMessage=passageSnapshot.messages[0],originalSnapshotHash=TLPassages.snapshotHash(passageSnapshot);
 const passage=TLPassages.create({captureId:passageCapture.id,snapshot:passageSnapshot,message:passageMessage,text:'synthetic source',startOffset:0,endOffset:'synthetic source'.length});
 await S.putPassage(passage);
 check((await S.passages(passageCapture.id)).length===1,'Passage was not persisted');
 await S.updatePassageColor(passage.passageId,'green');
 const auditAt=passage.createdAt+1000;
 await S.putPassage({...passage,color:'green',updatedAt:auditAt,reanchoredAt:auditAt,previousMessageHash:'b'.repeat(64)});
 check((await S.passages(passageCapture.id))[0].color==='green','Passage color did not persist');
 check(TLPassages.snapshotHash((await S.get('captures',passageCapture.id)).snapshot)===originalSnapshotHash,'Passage metadata mutated the original archive snapshot');
 check(TLPassages.resolve(passage,passageSnapshot).status==='anchored','New passage did not resolve');
 const passageArchive=await TLArchive.exportCapture(passageCapture.id),restoredCaptureId=await TLArchive.restore(passageArchive.blob),restoredPassages=await S.passages(restoredCaptureId);
 check(restoredPassages.length===1&&restoredPassages[0].captureId===restoredCaptureId&&restoredPassages[0].color==='green'&&restoredPassages[0].reanchoredAt===auditAt&&restoredPassages[0].previousMessageHash==='b'.repeat(64),'Passage metadata did not survive archive round trip');
 check(TLPassages.resolve(restoredPassages[0],(await S.get('captures',restoredCaptureId)).snapshot).status==='anchored','Restored passage no longer resolves');
 const restoredAgain=await TLArchive.restore(passageArchive.blob),secondPassages=await S.passages(restoredAgain);
 check(secondPassages.length===1&&secondPassages[0].passageId!==restoredPassages[0].passageId&&secondPassages[0].originPassageId===passage.passageId,'Repeated ZIP restore overwrote an existing passage or lost origin identity');
 check((await S.passages(restoredCaptureId)).length===1,'Repeated ZIP restore changed the first imported passage');
 const zipEntries=await TLArchive.readZip(passageArchive.blob),tamperedManifest=JSON.parse(await(await zipEntries.get('manifest.json').blob()).text());
 tamperedManifest.passages[0].nodeId='foreign-node';
 const tamperedZip=await TLArchive.buildZip(await Promise.all([...zipEntries.values()].map(async e=>({name:e.name,blob:e.name==='manifest.json'?new Blob([JSON.stringify(tamperedManifest)],{type:'application/json'}):await e.blob()}))));
 await rejects(()=>TLArchive.restore(tamperedZip),'INVALID_ARCHIVE_PASSAGE_SOURCE');
 check((await S.passages(restoredCaptureId)).length===1,'Tampered ZIP altered an existing passage');
 await rejects(()=>S.putPassage({...passage,captureId:'missing-capture'}),'PASSAGE_SOURCE_CAPTURE_MISSING');
 check((await S.get('captures',passageCapture.id)).snapshot.messages.length===1,'Passage operation changed original snapshot');
 await S.deletePassage(passage.passageId);
 check((await S.passages(passageCapture.id)).length===0&&!!await S.get('captures',passageCapture.id),'Deleting passage affected its source archive');
 report.push({name:'passage_crud_is_source_bound_and_does_not_mutate_archive',result:'pass'});
 const bytes=new TextEncoder().encode('shared-file-byte-proof'),a=await save('a',bytes),b=await save('b',bytes);
 check(a.asset.sha256===b.asset.sha256,'Identical files must be content-addressed');
 const exclusive=await S.putBlob(new Blob(['only-handoff-a']));
 const common={name:'data.bin',mime:'application/octet-stream',sha256:a.asset.sha256,size:bytes.length};
 await S.set('handoffs',{id:'ha',captureId:a.id,state:'prepared',files:[common,{name:'history.md',mime:'text/markdown',...exclusive}],batches:[[0,1]]});
 await S.set('handoffs',{id:'hb',captureId:b.id,state:'prepared',files:[common],batches:[[0]]});
 await S.removeCapture(a.id);
 check(!await S.get('captures',a.id),'Deleted capture remains');
 check(!await S.get('handoffs','ha'),'Deleted capture handoff remains');
 check(!!await S.get('handoffs','hb'),'Other capture handoff was deleted');
 check((await S.verifiedBlob(a.asset.sha256)).size===bytes.length,'Shared file was lost');
 check(!await S.get('files',exclusive.sha256),'Exclusive deleted-handoff file was retained');
 report.push({name:'delete_archive_invalidates_its_handoffs_and_preserves_shared_bytes',result:'pass'});
 await rejects(()=>S.set('handoffs',{id:'ha-late',captureId:a.id,state:'prepared',files:[common]}),'HANDOFF_SOURCE_DELETED');
 await rejects(()=>S.set('handoffs',{id:'missing-file',captureId:b.id,state:'prepared',files:[{name:'missing',sha256:'f'.repeat(64),size:5}]}),'LOCAL_FILE_MISSING');
 check(!await S.get('handoffs','ha-late')&&!await S.get('handoffs','missing-file'),'Failed transaction wrote a dangling handoff');
 report.push({name:'handoff_commit_rejects_missing_source_or_missing_binary',result:'pass'});
 await S.removeCapture(b.id);
 check(!await S.get('handoffs','hb')&&!await S.get('files',b.asset.sha256),'Last reference deletion did not remove file');
 report.push({name:'last_reference_removal_reclaims_file_without_global_stale_gc',result:'pass'});
 const c=await save('race',bytes);
 await Promise.allSettled([S.removeCapture(c.id),S.set('handoffs',{id:'race-handoff',captureId:c.id,state:'prepared',files:[common]})]);
 check(!await S.get('captures',c.id)&&!await S.get('handoffs','race-handoff'),'Concurrent deletion left an active handoff');
 check(!await S.get('files',c.asset.sha256),'Concurrent deletion left a referenced orphan');
 report.push({name:'concurrent_handoff_commit_and_archive_deletion_are_serialized',result:'pass'});
 const id=C.id(),snapshot=model('active');await S.snapshot(id,snapshot);const key=snapshot.assets[0].key;
 await rejects(()=>S.removeCapture(id),'STOP_CAPTURE_BEFORE_DELETE');
 check(!!await S.get('captures',id),'Active capture was removed');
 await S.beginAsset(id,key);await rejects(()=>S.finishAsset(id,key,'application/octet-stream'),'MISSING_ASSET_CHUNKS');
 await rejects(()=>S.chunk(id,key,0,new Uint8Array()),'INVALID_CHUNK');
 await rejects(()=>S.chunk(id,key,0,new Uint8Array(262145)),'INVALID_CHUNK');
 await S.chunk(id,key,0,new Uint8Array([1,2,3]));
 await rejects(()=>S.chunk(id,key,0,new Uint8Array([4])),'CHUNK_SEQUENCE_MISMATCH');
 await S.recover([]);const interrupted=(await S.assets(id))[0];
 check(interrupted.state==='unavailable'&&interrupted.sha256===null,'Interrupted file was falsely marked saved');
 report.push({name:'active_delete_empty_chunks_duplicate_sequence_and_interruption_fail_closed',result:'pass'});
 const mismatchId=C.id(),mismatch=model('mismatch',100);await S.snapshot(mismatchId,mismatch);const mk=mismatch.assets[0].key;
 await S.beginAsset(mismatchId,mk);await S.chunk(mismatchId,mk,0,new Uint8Array([1,2,3]));
 await rejects(()=>S.finishAsset(mismatchId,mk,'application/octet-stream'),'SOURCE_SIZE_MISMATCH');
 await S.failAsset(mismatchId,mk,'SOURCE_SIZE_MISMATCH');
 check((await S.assets(mismatchId))[0].state==='unavailable','Size mismatch became saved');
 report.push({name:'declared_source_size_mismatch_never_creates_saved_asset',result:'pass'});
 const d=await save('corruption',bytes);
 await S.set('files',{sha256:d.asset.sha256,blob:new Blob([new Uint8Array(bytes.length)]),size:bytes.length});
 await rejects(()=>S.verifiedBlob(d.asset.sha256),'LOCAL_FILE_HASH_MISMATCH');
 report.push({name:'same_size_local_corruption_is_rejected_before_upload',result:'pass'});
 // Store writes require exact saved source hashes, not just any text match.
 const safeId=await save('validation',new TextEncoder().encode('valid-source'));
 const safeSnapshot=(await S.get('captures',safeId.id)).snapshot,m=safeSnapshot.messages[0];
 const safePassage=TLPassages.create({captureId:safeId.id,snapshot:safeSnapshot,message:m,text:'synthetic',startOffset:0,endOffset:9});
 await rejects(()=>S.putPassage({...safePassage,messageHash:'0'.repeat(64)}),'PASSAGE_MESSAGE_HASH_MISMATCH');
 check((await S.passages(safeId.id)).length===0,'Forged passage persisted');
 report.push({name:'forged_passage_message_hash_rejected_without_write',result:'pass'});
 // A rejected import must not leave verified first blobs behind.
 const goodBlob=new Blob(['uncommitted-first-import-payload']),goodHash=await C.hashBlob(goodBlob);
 const filesBefore=(await S.all('files')).length,capturesBefore=(await S.all('captures')).length;
 await rejects(()=>S.importCapture(safeSnapshot,[],new Map([[goodHash,goodBlob],['f'.repeat(64),new Blob(['wrong'])]]),'ready'),'IMPORT_HASH_MISMATCH');
 check((await S.all('files')).length===filesBefore&&(await S.all('captures')).length===capturesBefore&&!await S.get('files',goodHash),'Failed import left partial data');
 report.push({name:'failed_import_leaves_no_partial_blobs_or_capture',result:'pass'});
 // Multiple references to identical bytes are valid and restore once.
 const dupId=await save('sharedrefs',new TextEncoder().encode('two-references-one-file'));
 const dupCapture=await S.get('captures',dupId.id),first=(await S.assets(dupId.id))[0],second={...first,key:'second-reference',name:'second-copy.bin'};
 dupCapture.snapshot.assets.push({...dupCapture.snapshot.assets[0],key:second.key,name:second.name});
 dupCapture.snapshot.messages[0].assetKeys.push(second.key);
 await S.set('captures',dupCapture);await S.set('assets',second);
 const dupArchive=await TLArchive.exportCapture(dupId.id),dupRestored=await TLArchive.restore(dupArchive.blob);
 check((await S.assets(dupRestored)).filter(x=>x.state==='saved').length===2,'Shared asset references failed to restore');
 check((await TLArchive.readZip(dupArchive.blob)).has('assets/'+first.sha256+'.bin'),'Shared payload missing');
 report.push({name:'duplicate_content_addressed_asset_references_roundtrip',result:'pass'});
 // A removed source remains an explicitly stale quotation through backup.
 await S.putPassage(safePassage);
 const orphan=await S.get('captures',safeId.id);
 orphan.snapshot.messages[0]={...orphan.snapshot.messages[0],id:'new-source-message'};
 orphan.snapshot.nodes.n.messageId='new-source-message';orphan.snapshot.assets=[];orphan.snapshot.messages[0].assetKeys=[];
 // Avoid orphan asset references in this synthetic source: use a text-only copy.
 const textOnly=await S.importCapture(orphan.snapshot,[],new Map(),'ready','all',[{...safePassage,status:'stale',reason:'MESSAGE_NOT_FOUND'}]);
 const orphanZip=await TLArchive.exportCapture(textOnly),orphanRestore=await TLArchive.restore(orphanZip.blob);
 check((await S.passages(orphanRestore))[0].status==='stale','Backup falsely revived a removed source');
 report.push({name:'missing_source_passage_remains_stale_across_backup',result:'pass'});
 // The live source may replace a DOM-only placeholder with a definitive file
 // reference on the same original message. Do not keep a duplicate missing row.
 function assetConversation(id,attachment){
  return C.normalizeConversation({conversation_id:id,title:'Asset refresh',current_node:'n',mapping:{n:{parent:null,children:[],message:{id:'m',author:{role:'user'},content:{parts:['stable source']},metadata:attachment?{attachments:[attachment]}:{}}}}},'https://chatgpt.com/c/'+id);
 }
 const refreshId='conversation_storage_placeholder_reconciliation',refreshCapture=C.id();
 const placeholder=assetConversation(refreshId,{name:'later.csv',mime_type:'text/csv'}),recognized=assetConversation(refreshId,{id:'file_knownLater123',name:'later.csv',mime_type:'text/csv'});
 check(placeholder.assets.length===1&&placeholder.assets[0].ref.scheme==='unsupported','Placeholder fixture did not exercise unknown reference');
 check(recognized.assets.length===1&&recognized.assets[0].ref.scheme!=='unsupported','Recognized fixture missing reference');
 await S.snapshot(refreshCapture,placeholder);await S.snapshot(refreshCapture,recognized);
 let currentAssets=await S.assets(refreshCapture);
 check(currentAssets.length===1&&currentAssets[0].key===recognized.assets[0].key&&currentAssets[0].inLatestSnapshot,'Definitive attachment did not replace unsaved placeholder');
 await S.beginAsset(refreshCapture,currentAssets[0].key);await S.chunk(refreshCapture,currentAssets[0].key,0,new TextEncoder().encode('latest bytes'));
 await S.finishAsset(refreshCapture,currentAssets[0].key,'text/csv');await S.finishCapture(refreshCapture);
 const refreshArchive=await TLArchive.exportCapture(refreshCapture),refreshRestored=await TLArchive.restore(refreshArchive.blob);
 check(refreshArchive.manifest.state==='ready'&&(await S.assets(refreshRestored)).length===1,'Reconciled live snapshot cannot roundtrip as ready');
 report.push({name:'live_dom_placeholder_is_replaced_by_same_message_definitive_attachment',result:'pass'});
 // A genuinely disappeared, previously saved file is different: keep its
 // bytes and provenance without inventing a live attachment.
 const historicId='conversation_storage_historical_attachment',historicCapture=C.id(),oldSnapshot=assetConversation(historicId,{id:'file_oldHistory456',name:'historical.txt',mime_type:'text/plain',size:3});
 const noAttachment=assetConversation(historicId,null);
 await S.snapshot(historicCapture,oldSnapshot);const originalKey=oldSnapshot.assets[0].key;
 await S.beginAsset(historicCapture,originalKey);await S.chunk(historicCapture,originalKey,0,new Uint8Array([65,66,67]));
 const originalFile=await S.finishAsset(historicCapture,originalKey,'text/plain');
 await S.snapshot(historicCapture,noAttachment);currentAssets=await S.assets(historicCapture);
 check(currentAssets.length===1&&currentAssets[0].inLatestSnapshot===false&&currentAssets[0].state==='saved','Historical saved file was discarded');
 await S.finishCapture(historicCapture);
 const historicArchive=await TLArchive.exportCapture(historicCapture);
 check(historicArchive.manifest.files[0].inLatestSnapshot===false&&historicArchive.manifest.state==='ready','Historical-only row falsely made current snapshot partial');
 const restoredHistory=await TLArchive.restore(historicArchive.blob),historicRows=await S.assets(restoredHistory);
 check(historicRows.length===1&&historicRows[0].inLatestSnapshot===false&&historicRows[0].sha256===originalFile.sha256,'Historical saved file failed to restore');
 check((await S.verifiedBlob(historicRows[0].sha256)).size===3,'Historical bytes disappeared');
 report.push({name:'historical_attachment_row_roundtrips_even_if_latest_snapshot_omits_it',result:'pass'});
 // Source warnings must survive ZIP restore: derived visible text alone would
 // otherwise make a previously partial capture look complete.
 const integrityId='conversation_storage_integrity_stale',integrityCapture=C.id(),rawIntegrity=assetConversation(integrityId,null);
 rawIntegrity.integrity.state='partial';
 rawIntegrity.integrity.issues=[{code:'UNSUPPORTED_CONTENT_PART',nodeId:'n'},{code:'VISIBLE_ATTACHMENT_NOT_IN_API',nodeId:'n'}];
 await S.snapshot(integrityCapture,rawIntegrity);await S.finishCapture(integrityCapture);
 const integrityZip=await TLArchive.exportCapture(integrityCapture),integrityRestored=await TLArchive.restore(integrityZip.blob),integrityCaptureRow=await S.get('captures',integrityRestored);
 check(integrityCaptureRow.state==='partial'&&integrityCaptureRow.snapshot.integrity.state==='partial','Partial snapshot was falsely marked valid');
 check(integrityCaptureRow.snapshot.integrity.issues.some(x=>x.code==='UNSUPPORTED_CONTENT_PART')&&integrityCaptureRow.snapshot.integrity.issues.some(x=>x.code==='VISIBLE_ATTACHMENT_NOT_IN_API'),'Original source integrity issues were lost');
 report.push({name:'source_integrity_issues_survive_zip_restore_without_laundering',result:'pass'});
 return report;
}'''

async def main():
    result={'scope':'real_chromium_indexeddb_synthetic_data_only','cases':[],'status':'fail'}
    async with async_playwright() as pw:
      with tempfile.TemporaryDirectory(prefix='threadline-storage-') as profile:
        context=await pw.chromium.launch_persistent_context(profile,channel='chromium',executable_path=os.environ.get('CHATFLOW_CHROMIUM'),headless=False,args=['--disable-extensions-except='+str(ROOT/'dist/edge'),'--load-extension='+str(ROOT/'dist/edge'),'--no-sandbox'])
        try:
            await context.route('http://**',lambda route:route.abort())
            await context.route('https://**',lambda route:route.abort())
            worker=context.service_workers[0] if context.service_workers else await context.wait_for_event('serviceworker')
            extension=worker.url.split('/')[2]
            page=await context.new_page();await page.goto('chrome-extension://'+extension+'/manifest.json')
            await page.evaluate("""async()=>{const req=indexedDB.open('chatflow-migration-test',1);const db=await new Promise((resolve,reject)=>{req.onupgradeneeded=()=>{const d=req.result;d.createObjectStore('captures',{keyPath:'id'});const a=d.createObjectStore('assets',{keyPath:['captureId','key']});a.createIndex('capture','captureId');d.createObjectStore('files',{keyPath:'sha256'});const ch=d.createObjectStore('chunks',{keyPath:['captureId','key','seq']});ch.createIndex('owner',['captureId','key']);ch.createIndex('capture','captureId');d.createObjectStore('handoffs',{keyPath:'id'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});const tx=db.transaction('captures','readwrite');tx.objectStore('captures').put({id:'legacy-v1-record',state:'ready',snapshot:null});await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}""")
            await page.evaluate("""async()=>{const req=indexedDB.open('chatflow-v2-migration-test',2);const db=await new Promise((resolve,reject)=>{req.onupgradeneeded=()=>{req.result.createObjectStore('captures',{keyPath:'id'});const p=req.result.createObjectStore('passages',{keyPath:'passageId'});p.createIndex('capture','captureId');p.createIndex('message',['captureId','messageId','nodeId']);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});const tx=db.transaction(['captures','passages'],'readwrite');tx.objectStore('captures').put({id:'v2-capture',state:'ready'});tx.objectStore('passages').put({passageId:'v2-passage',captureId:'v2-capture',text:'existing original excerpt'});await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}""")
            await page.goto('chrome-extension://'+extension+'/workspace/index.html')
            await page.wait_for_function('typeof TLStore!=="undefined"')
            migration=await page.evaluate("""async()=>{const db=await TLStore.open('chatflow-migration-test'),record=await new Promise((resolve,reject)=>{const tx=db.transaction('captures','readonly'),r=tx.objectStore('captures').get('legacy-v1-record');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return{version:db.version,stores:Array.from(db.objectStoreNames),record};}""")
            assert migration['version']==5 and {'passages','tasks','taskResults','captureSummaries','taskSummaries','taskResultSummaries','taskImportRows'}.issubset(migration['stores']) and migration['record']['id']=='legacy-v1-record',migration
            print('PASS indexeddb_v1_to_v5_migration_preserves_existing_records',flush=True)
            v2=await page.evaluate("""async()=>{const db=await TLStore.open('chatflow-v2-migration-test');const tx=db.transaction(['captures','passages'],'readonly'),read=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const capture=await read(tx.objectStore('captures').get('v2-capture')),passage=await read(tx.objectStore('passages').get('v2-passage'));return{version:db.version,capture,passage,stores:Array.from(db.objectStoreNames)};}""")
            assert v2['version']==5 and v2['capture']['id']=='v2-capture' and v2['passage']['text']=='existing original excerpt' and {'tasks','taskResults'}.issubset(v2['stores']),v2
            ready=await page.evaluate('chrome.runtime.sendMessage({type:"tl:sessions"})')
            assert ready['ok'],ready
            result['cases']=[{'name':'indexeddb_v1_to_v5_migration_preserves_existing_records','result':'pass'},{'name':'indexeddb_v2_to_v5_preserves_archives_and_passages','result':'pass'}]+await page.evaluate(CASES)
            result['status']='pass'
            for case in result['cases']:print('PASS',case['name'],flush=True)
        except Exception as e:
            result['error']={'message':str(e),'traceback':traceback.format_exc()}
            raise
        finally:
            (OUT/'storage-report.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(result,ensure_ascii=False),flush=True)
            await context.close()
if __name__=='__main__':asyncio.run(main())
