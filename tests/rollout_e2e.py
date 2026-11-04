"""Installed MV3 + real IndexedDB; all conversations/files are synthetic fixtures."""
import asyncio
import json
import os
import tempfile
import time
import traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
REPORT = {'scope': 'synthetic_installed_mv3_rollout', 'cases': [], 'errors': []}
TARGET = '''<!doctype html><html><body><form id="composer"><textarea id="prompt-textarea"></textarea><input type="file" multiple><button type="button" id="send" onclick="window.sent++">Send</button><div id="uploads"></div></form><script>
window.sent=0;window.uploads=0;document.querySelector('input').addEventListener('change',e=>{window.uploads++;Array.from(e.target.files).forEach((file,i)=>{const c=document.createElement('div');c.dataset.testid='file-chip';c.dataset.filename=file.name;c.textContent=file.name;c.dataset.state=i===0?'ready':'uploading';document.querySelector('#uploads').append(c);});});</script></body></html>'''

def model(cid):
    count = 1000 if '1000' in cid else 264
    mapping = {}
    for i in range(count):
        text = 'Question number '+str(i) if i % 2 == 0 else '## Section\n### Duplicate\n### Duplicate\n###### Deep\n\n```md\n## not-heading\n```'
        mapping['n'+str(i)] = {'parent': 'n'+str(i-1) if i else None, 'children': ['n'+str(i+1)] if i+1 < count else [], 'message': {'id': 'm'+str(i), 'author': {'role': 'user' if i % 2 == 0 else 'assistant'}, 'status': 'finished_successfully', 'content': {'parts': [text]}}}
    return {'conversation_id': cid, 'title': 'Synthetic rollout', 'current_node': 'n'+str(count-1), 'mapping': mapping}

def nav_html(cid):
    count = 1000 if '1000' in cid else 264
    reverse = 'reverse' in cid
    modern = 'modern' in cid
    return '''<!doctype html><html><head><style>body{margin:0}#thread{height:420px;width:600px;overflow:auto;display:flex;flex-direction:__DIRECTION__}#spacer{position:relative;flex:none;width:100%;height:__HEIGHT__px}article{position:absolute;height:95px;left:0;width:90%}h2,h3,h6,p{margin:2px}h2{font-size:18px}h3{font-size:16px}h6{font-size:14px}</style></head><body><div class="thread-scroll-container" id="thread" data-chatgpt-selection-conversation-id="__CID__"><div id="spacer"></div></div><script>
const total=__COUNT__,reverse=__REVERSE__,modern=__MODERN__,box=document.querySelector('#thread'),sp=document.querySelector('#spacer');window.scrollWrites=0;
function render(){sp.replaceChildren();const logical=box.scrollTop+(reverse?box.scrollHeight-box.clientHeight:0),first=Math.max(0,Math.floor(logical/100)-2);for(let i=first;i<Math.min(total,first+10);i++){const a=document.createElement('article'),body=document.createElement('div');a.style.top=i*100+'px';a.dataset.turnKey='turn-'+i;if(modern){body.setAttribute('data-chatgpt-search-message-ids','m'+i);if(i%2)body.setAttribute('data-markdown-text-style','assistant-message');else body.setAttribute('data-user-message-bubble','');}else{a.dataset.messageId='m'+i;a.dataset.messageAuthorRole=i%2?'assistant':'user';}if(i%2){body.innerHTML='<h2>Section</h2><h3>Duplicate</h3><h3>Duplicate</h3><h6>Deep</h6><pre><code>## not-heading</code></pre>';}else body.textContent='Question number '+i;a.append(body);sp.append(a);}}
box.addEventListener('scroll',()=>{window.scrollWrites++;render();});box.scrollTop=reverse?0:box.scrollHeight;render();</script></body></html>'''.replace('__DIRECTION__', 'column-reverse' if reverse else 'column').replace('__HEIGHT__',str(count*100)).replace('__COUNT__',str(count)).replace('__CID__',cid).replace('__REVERSE__',str(reverse).lower()).replace('__MODERN__',str(modern).lower())

async def poll(page, expression, arg=None, seconds=25):
    end = time.monotonic()+seconds
    while time.monotonic() < end:
        value = await page.evaluate(expression, arg)
        if value:
            return value
        await asyncio.sleep(.08)
    raise AssertionError('Condition timed out: '+expression)

def passed(name, detail=None):
    REPORT['cases'].append({'name':name,'result':'pass','detail':detail})
    print('PASS',name,flush=True)

async def main():
    OUT.mkdir(exist_ok=True)
    async with async_playwright() as pw:
        with tempfile.TemporaryDirectory(prefix='chatflow-rollout-') as tmp:
            ctx = await pw.chromium.launch_persistent_context(tmp,channel='chromium',executable_path=os.environ.get('CHATFLOW_CHROMIUM'),headless=False,accept_downloads=True,args=['--disable-extensions-except='+str(ROOT/'dist/edge'),'--load-extension='+str(ROOT/'dist/edge'),'--no-sandbox'])
            ctx.set_default_timeout(30000)
            async def route(r):
                path=urlparse(r.request.url).path
                if path == '/api/auth/session': return await r.fulfill(json={'accessToken':'synthetic-only'})
                if path.startswith('/backend-api/conversation/'):return await r.fulfill(json=model(path.split('/')[-1]))
                if path.startswith('/c/'):return await r.fulfill(content_type='text/html',body=nav_html(path.split('/')[-1]))
                if path == '/':return await r.fulfill(content_type='text/html',body=TARGET)
                return await r.fulfill(status=404,body='fixture only')
            await ctx.route('https://chatgpt.com/**',route)
            try:
                worker=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
                ext=worker.url.split('/')[2]
                w=await ctx.new_page();await w.goto('chrome-extension://'+ext+'/workspace/index.html')
                await poll(w,'()=>typeof TLEvidence!=="undefined"&&typeof TLArchive.restoreVerified==="function"')
                result=await worker.evaluate('''async()=>{
                  if(typeof TLPassages?.create!=='function')throw Error('MISSING_REAL_WORKER_DEPENDENCY');
                  const C=TLCore,S=TLStore,url='https://chatgpt.com/c/rollout_file_source_12345';
                  const raw={id:'rollout_file_source_12345',title:'Evidence fixture',current_node:'n1',mapping:{n1:{parent:null,children:[],message:{id:'m1',author:{role:'user'},content:{parts:['selected passage']},metadata:{attachments:[{id:'file_rollout',name:'report.txt'}]}}}}};
                  const snap=C.normalizeConversation(raw,url),blob=new Blob(['original synthetic payload'],{type:'text/plain'}),sha=await C.hashBlob(blob);
                  const rows=snap.assets.map(a=>({...a,state:'saved',sha256:sha,size:blob.size,reason:null}));
                  const id=await S.importCapture(snap,rows,new Map([[sha,blob]]),'ready','all',[]);
                  const record=TLPassages.create({captureId:id,snapshot:snap,message:snap.messages[0],text:'selected',startOffset:0,endOffset:8});
                  await S.putPassage(record);if((await S.passages(id)).length!==1)throw Error('REAL_WORKER_PASSAGE_WRITE_FAILED');
                  return {id,sha,key:rows[0].key};
                }''')
                passed('real_worker_loads_passages_and_commits_source_bound_passage')
                migration=await w.evaluate('''async()=>{
                  const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
                  const schema=db=>Array.from(db.objectStoreNames).map(name=>{const s=db.transaction([name]).objectStore(name);return [name,s.keyPath,Array.from(s.indexNames).map(key=>{const i=s.index(key);return [key,i.keyPath,i.unique];})];});
                  const signatures=[];
                  for(const version of [1,2,3,4]){
                    const name='rollout-v'+version,opening=indexedDB.open(name,version);
                    opening.onupgradeneeded=()=>{const db=opening.result;db.createObjectStore('captures',{keyPath:'id'});if(version>=2){const p=db.createObjectStore('passages',{keyPath:'passageId'});p.createIndex('capture','captureId');if(version===2||version===4)p.createIndex('message',['captureId','messageId','nodeId']);}};
                    const db=await request(opening),names=version>=2?['captures','passages']:['captures'];
                    await new Promise((resolve,reject)=>{const tx=db.transaction(names,'readwrite');tx.objectStore('captures').put({id:'retained',state:'partial',payload:'unchanged'});if(version>=2)tx.objectStore('passages').put({passageId:'p1',captureId:'retained',conversationId:'c',messageId:'m',nodeId:'n',createdAt:42,text:'unchanged'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
                    const up=await TLStore.open(name);if(up.version!==5)throw Error('INDEX_REPAIR_NOT_APPLIED');
                    const row=await request(up.transaction('captures').objectStore('captures').get('retained'));if(row.payload!=='unchanged')throw Error('MIGRATION_DATA_LOSS');
                    const ps=up.transaction('passages').objectStore('passages');if(!ps.indexNames.contains('createdAt')||!ps.indexNames.contains('source'))throw Error('INDEX_MISSING');
                    if(version>=2&&(await request(ps.get('p1'))).text!=='unchanged')throw Error('PASSAGE_MIGRATION_LOSS');
                    signatures.push(JSON.stringify(schema(up)));
                  }
                  const fresh=await TLStore.open('rollout-fresh');signatures.push(JSON.stringify(schema(fresh)));
                  if(new Set(signatures).size!==1)throw Error('MIGRATIONS_DIVERGE');
                  const bad=indexedDB.open('rollout-bad-schema',4);bad.onupgradeneeded=()=>bad.result.createObjectStore('captures',{keyPath:'wrongKey'});(await request(bad)).close();
                  let rejected=false;try{await TLStore.open('rollout-bad-schema');}catch{rejected=true;}if(!rejected)throw Error('INVALID_SCHEMA_ACCEPTED');
                  const unchanged=await request(indexedDB.open('rollout-bad-schema'));if(unchanged.version!==4)throw Error('FAILED_UPGRADE_NOT_ATOMIC');unchanged.close();
                  return {versions:[1,2,3,4],to:5,convergent:true,failedUpgradeAtomic:true};
                }''')
                passed('all_legacy_database_paths_converge_without_data_loss',migration)
                evidence=await w.evaluate('''async id=>{
                  const out=await TLArchive.exportVerified(id);window.fixtureZip=out.blob;
                  const before=TLEvidence.report(await TLStore.readArchive(id));if(before.backup.state!=='passed'||before.restore.state!=='not_checked')throw Error('EVIDENCE_CONFLATED');
                  const restored=await TLArchive.restoreVerified(out.blob);if(!restored.verified)throw Error('DATABASE_READBACK_FAILED');
                  const verified=TLEvidence.report(await TLStore.readArchive(restored.id));if(verified.restore.state!=='passed'||verified.backup.state!=='not_checked')throw Error('RESTORE_REPORT_INACCURATE');
                  const c=await TLStore.get('captures',id);c.snapshot.title='Changed fixture';await TLStore.set('captures',c);
                  if(TLEvidence.report(await TLStore.readArchive(id)).backup.state!=='stale')throw Error('OLD_BACKUP_CERTIFIES_NEW_CONTENT');
                  if(await TLStore.recordVerification(id,out.receipt))throw Error('LATE_RECEIPT_ACCEPTED');
                  return {id:restored.id,archiveSha256:out.receipt.archiveSha256,bytes:out.blob.size};
                }''',result['id'])
                passed('backup_parser_and_actual_restore_readback_have_distinct_versioned_evidence',evidence)
                await w.locator('.header-actions [data-view="archive"]').click();await w.locator('#refresh').click()
                row=w.locator('.archive-select-row').filter(has=w.locator('input[data-capture-id="'+evidence['id']+'"]'))
                await row.locator('button.archive-button').click()
                await w.locator('#verification-report [data-evidence="restore"]').wait_for(state='attached')
                assert await w.locator('#verification-report [data-evidence="restore"]').count()==1
                assert '\u6821\u9a8c\u901a\u8fc7' in await w.locator('[data-evidence="restore"]').inner_text()
                await w.locator('#detail details').filter(has=w.locator('input[data-asset-key]')).locator(':scope > summary').click()
                await w.locator('#detail input[data-asset-key]').first.check()
                await w.locator('#detail .actions .primary').first.click();await w.locator('#prepare').click()
                await poll(w,'()=>!document.querySelector("#handoff-result").hidden')
                # Wait for all asynchronous Blob reads and rendered file rows, then
                # verify the exact generated index type and displayed label.
                await poll(w,"async()=>{const h=(await TLStore.all('handoffs')).at(-1);return h&&document.querySelectorAll('#staging .staged').length===h.files.length;}")
                # The staged file rows are in a collapsed <details> until opened:
                # innerText of hidden content is empty, even when its DOM label exists.
                await w.locator('#staging-details summary').click()
                index_ui=await w.evaluate("async()=>{const h=(await TLStore.all('handoffs')).at(-1),row=document.querySelector('#staging .staged');return {kind:h.files[0]?.kind,name:h.files[0]?.name,label:row?.innerText||''};}")
                assert index_ui['kind']=='index' and index_ui['name']=='handoff_index.md',index_ui
                assert '\u63a5\u7eed\u7d22\u5f15' in index_ui['label'],index_ui
                async with ctx.expect_page() as target_event:await w.locator('#open-target').click()
                target=await target_event.value;await target.wait_for_url('https://chatgpt.com/')
                receipt=await poll(w,"async()=>{const h=(await TLStore.all('handoffs')).at(-1);return h?.state==='upload_unknown'?h:null;}",seconds=25)
                assert receipt['evidenceVersion']==1 and len(receipt['fileEvidence'])==len(receipt['batches'][0])
                assert any(r['state']=='page_ready' for r in receipt['fileEvidence']) and any(r['state']=='unknown' for r in receipt['fileEvidence'])
                await poll(w,'()=>!!document.querySelector("[data-evidence-state=unknown]")')
                assert await target.evaluate('window.uploads===1&&window.sent===0')
                old=receipt['fileEvidence']
                late=await worker.evaluate('''async h=>{try{await handle({type:'tl:handoffProgress',id:h.id,attemptId:h.attemptId,files:h.fileEvidence},{id:chrome.runtime.id,documentId:h.targetDocumentId,tab:{id:h.targetTabId},url:'https://chatgpt.com/'});return false;}catch{return (await TLStore.get('handoffs',h.id)).fileEvidence;}}''',receipt)
                assert late==old
                w.once('dialog',lambda d:d.accept())
                await w.locator('[data-verify-file="1"]').click();await poll(w,"()=>Array.from(document.querySelectorAll('[data-file-evidence]')).some(e=>e.dataset.fileEvidence==='1'&&e.dataset.evidenceState==='user_checked')")
                assert await target.evaluate('window.uploads===1&&window.sent===0')
                assert await w.locator('[data-verify-file="1"]').is_disabled()
                passed('partial_upload_exact_file_evidence_manual_check_and_late_receipt_protection')
                await target.close()
                samples=[]
                for count in [264,1000]:
                    for layout in ['normal','reverse']:
                        for markup in ['legacy','modern']:
                            cid=f'nav_{count}_{layout}_{markup}_fixture';page=await ctx.new_page();await page.goto('https://chatgpt.com/c/'+cid)
                            tabs=await w.evaluate("async()=> (await chrome.runtime.sendMessage({type:'tl:sources'})).data")
                            tab=next(t for t in tabs if t['url'].endswith('/'+cid))
                            opened=await w.evaluate("async x=>chrome.runtime.sendMessage({type:'tl:openTools',tabId:x.id,expectedUrl:x.url})",tab)
                            assert opened['ok'],opened
                            tools=page.locator('#chatflow-page-tools');await tools.locator('input[type=search]').wait_for()
                            await poll(page,"n=>document.querySelector('#chatflow-page-tools').shadowRoot.textContent.includes(n+' \u6761')",count)
                            for index in [0,count//2//2*2,count-2]:
                                await tools.locator('input[type=search]').fill('Question number '+str(index))
                                start=time.monotonic();await tools.locator('#list .row > button').first.click()
                                await poll(page,"()=>document.querySelector('#chatflow-page-tools').shadowRoot.querySelector('[role=status]').textContent==='\u5df2\u6309\u6d88\u606f\u8eab\u4efd\u5b9a\u4f4d\u3002'")
                                elapsed=time.monotonic()-start;assert elapsed<=12.5
                                assert await page.evaluate("""i=>{const el=[...document.querySelectorAll('[data-message-id],[data-chatgpt-search-message-ids]')].find(e=>(e.getAttribute('data-message-id')||e.getAttribute('data-chatgpt-search-message-ids'))==='m'+i);if(!el)return false;const a=el.getBoundingClientRect(),b=document.querySelector('#thread').getBoundingClientRect();return a.bottom>b.top&&a.top<b.bottom;}""",index)
                                samples.append({'count':count,'layout':layout,'markup':markup,'target':index,'elapsedMs':round(elapsed*1000)})
                            await page.close()
                passed('24_real_virtualized_navigation_positive_controls',samples)
                await w.set_viewport_size({'width':320,'height':900});await w.screenshot(path=str(OUT/'rollout-file-evidence-320.png'),full_page=True)
                assert await w.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
                passed('narrow_evidence_ui_has_no_horizontal_overflow')
            except Exception as error:
                REPORT['errors'].append({'error':str(error),'trace':traceback.format_exc()})
                raise
            finally:
                (OUT/'rollout-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2),encoding='utf-8')
                await ctx.close()
if __name__ == '__main__': asyncio.run(main())
