"""Installed MV3 reliability, trusted clipboard paste and archive index regressions.
Runs with a fresh Chromium profile and synthetic routes/data only. This is not
an authenticated ChatGPT, independent-user or assistive-technology acceptance.
"""
import asyncio
import hashlib
import json
import os
import tempfile
import traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
A='conversation_reliability_A_20261103'
B='conversation_reliability_B_20261103'
URL_A='https://chatgpt.com/c/'+A
URL_B='https://chatgpt.com/c/'+B
REPORT={'scope':'installed_chromium_mv3_synthetic_reliability','status':'fail','cases':[]}
HTML='''<!doctype html><html><head><title>Synthetic source A</title></head><body>
<main><article data-message-id="user-1" data-message-author-role="user">Synthetic source.</article></main>
<textarea id="prompt-textarea">SYNTHETIC_EXISTING_DRAFT</textarea>
<button id="send" onclick="window.sends++">Send</button><script>window.sends=0;</script>
</body></html>'''

def model(cid):
    return {'conversation_id':cid,'title':'Synthetic '+cid,'current_node':'n1','mapping':{
        'n0':{'parent':None,'children':['n1'],'message':{'id':'user-1','author':{'role':'user'},'content':{'parts':['SOURCE_MARKER_'+cid]},'status':'finished_successfully'}},
        'n1':{'parent':'n0','children':[],'message':{'id':'assistant-1','author':{'role':'assistant'},'content':{'parts':['Synthetic answer for '+cid]},'status':'finished_successfully'}}}}

async def poll(page,expression,arg=None,seconds=30):
    end=asyncio.get_running_loop().time()+seconds
    while asyncio.get_running_loop().time()<end:
        value=await page.evaluate(expression,arg)
        if value:return value
        await asyncio.sleep(.1)
    raise AssertionError('Condition timed out: '+expression)

def passed(name,detail=None):
    REPORT['cases'].append({'name':name,'result':'pass','detail':detail})
    print('PASS',name,flush=True)

async def trusted_paste(page,selector,text,button,notice):
    """Real Clipboard API + platform Control+V; no fill/dispatchEvent shortcut."""
    await page.bring_to_front()
    await page.evaluate('''()=>{if(window.__reliabilityPasteInstalled)return;window.__reliabilityPasteInstalled=true;window.__reliabilityPastes=[];document.addEventListener('paste',event=>{const text=event.clipboardData?.getData('text/plain')||'';window.__reliabilityPastes.push({target:event.target.id,trusted:event.isTrusted,length:text.length,utf8Bytes:new TextEncoder().encode(text).length,tail:text.slice(-64)});},true);}''')
    field=page.locator(selector);await field.click();await page.keyboard.press('Control+A');await page.keyboard.press('Backspace')
    before=await page.evaluate('window.__reliabilityPastes.length')
    await page.evaluate('async value=>{await navigator.clipboard.writeText(value);}',text)
    await page.keyboard.press('Control+V')
    await poll(page,'n=>window.__reliabilityPastes.length>n',before)
    proof=await page.evaluate('''async selector=>{const e=document.querySelector(selector),bytes=new TextEncoder().encode(e.value),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');return{length:e.value.length,utf8Bytes:bytes.length,hash,tail:e.value.slice(-64),invalid:e.getAttribute('aria-invalid'),paste:window.__reliabilityPastes.at(-1)};}''',selector)
    expected_units=len(text.encode('utf-16-le'))//2
    assert proof['paste']['trusted'] is True,proof
    assert proof['paste']['target']==selector.removeprefix('#'),proof
    assert proof['paste']['length']==expected_units,proof
    assert proof['length']==expected_units and proof['hash']==hashlib.sha256(text.encode()).hexdigest(),proof
    assert proof['tail']==text[-64:] and proof['paste']['tail']==text[-64:],proof
    assert proof['invalid']=='true',proof
    assert await page.locator(button).is_disabled(),proof
    assert await page.locator(notice).is_visible(),proof
    assert (await page.locator(notice).inner_text()).strip(),proof
    return proof

ARCHIVE_CASES=r'''async()=>{
 const S=TLStore,C=TLCore,report=[];
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};
 // Earlier cases use one capture. Reset only this disposable profile's synthetic
 // archive data after source and paste assertions have finished.
 for(const row of await S.all('captures'))await S.removeCapture(row.id);
 const fixtures=[],body='Z'.repeat(32768),shared='conversation_summary_shared_fixture';
 for(let i=0;i<1000;i++){
  const suffix=String(i).padStart(4,'0'),conversationId=i>=997?shared:'conversation_summary_'+suffix;
  const sourceUrl='https://chatgpt.com/c/'+conversationId,title=(i%137===0?'跨页目标 ':'合成档案 ')+suffix;
  const raw={conversation_id:conversationId,title,current_node:'n',mapping:{n:{parent:null,children:[],message:{id:'m-'+suffix,author:{role:'user'},content:{parts:[body]},status:'finished_successfully'}}}};
  const snapshot=C.normalizeConversation(raw,sourceUrl),updatedAt=i===998?'2026-01-02T00:00:00.000Z':i===999?'2026-01-03T00:00:00.000Z':new Date(Date.UTC(2026,0,1,0,0,Math.floor(i/10))).toISOString();
  const row={id:'summary-fixture-'+suffix,snapshot,state:'ready',live:false,createdAt:'2026-01-01T00:00:00.000Z',updatedAt,saveScope:i===999?'last_generated':'all'};
  fixtures.push({id:row.id,title,updatedAt});await S.set('captures',row);
 }
 check((await S.get('captures','summary-fixture-0000')).snapshot.messages[0].text.length===32768,'Large-library body was not stored');
 const originals={},reads=[];
 for(const key of ['get','getAll','openCursor']){originals[key]=IDBObjectStore.prototype[key];IDBObjectStore.prototype[key]=function(...args){if(this.name==='captures'){reads.push(key);throw Error('FULL_CAPTURE_READ_DURING_LIST');}return originals[key].apply(this,args);};}
 const times=[],ids=[],found=[];
 try{
  for(let i=0;i<10;i++){const start=performance.now(),page=await S.listCaptures({limit:50});times.push(performance.now()-start);check(page.items.length===50,'Wrong first page length');check(page.items.every(c=>c.snapshot===undefined&&c.hasSnapshot&&c.messageCount===1),'Summary lost metadata or included body');}
  let cursor=null;do{const page=await S.listCaptures({limit:50,cursor});check(page.items.length<=50,'Page exceeded limit');ids.push(...page.items.map(x=>x.id));cursor=page.nextCursor;}while(cursor);
  cursor=null;do{const page=await S.listCaptures({query:'跨页目标',limit:3,cursor});found.push(...page.items.map(x=>x.id));cursor=page.nextCursor;}while(cursor);
 }finally{for(const[key,fn]of Object.entries(originals))IDBObjectStore.prototype[key]=fn;}
 check(reads.length===0,'List read full captures');
 const expected=fixtures.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id)).map(x=>x.id);
 check(ids.length===1000&&new Set(ids).size===1000&&JSON.stringify(ids)===JSON.stringify(expected),'Paging duplicated, omitted or reordered equal-date rows');
 const searchExpected=fixtures.filter(x=>x.title.includes('跨页目标')).map(x=>x.id).sort();check(JSON.stringify(found.slice().sort())===JSON.stringify(searchExpected),'Search missed cross-page titles');
 const p95=times.slice().sort((a,b)=>a-b)[Math.ceil(times.length*.95)-1];check(times[0]<1500&&p95<500,'Archive-summary query exceeded cloud runner budget');
 report.push({name:'archive_summary_1000_full_bodies_pages_without_original_store_reads',result:'pass',detail:{captures:1000,bodyBytesEach:32768,logicalBodyBytes:32768000,pageSize:50,firstPageMs:times[0],pageP95Ms:p95,timesMs:times,budget:{firstPageMs:1500,pageP95Ms:500},matchingSearchRows:found.length}});
 const source=C.chatUrl('https://chatgpt.com/c/'+shared);
 check((await S.findCapture(source,'all')).id==='summary-fixture-0998','Source/scope lookup did not choose latest matching archive');
 check((await S.findCapture(source,'all','summary-fixture-0997')).id==='summary-fixture-0997','Preferred matching archive was ignored');
 check((await S.findCapture(source,'last_generated')).id==='summary-fixture-0999','Different save scope mixed into lookup');
 check((await S.findCapture(source,'all','summary-fixture-0123')).id==='summary-fixture-0998','Foreign preferred archive crossed source identity');
 report.push({name:'archive_source_scope_and_preferred_id_lookup_preserve_identity',result:'pass'});
 const changed=await S.get('captures','summary-fixture-0005');changed.snapshot.title='更新后的唯一标题';changed.updatedAt='2026-02-01T00:00:00.000Z';await S.set('captures',changed);
 const updated=await S.listCaptures({query:'更新后的唯一标题'});check(updated.items.length===1&&updated.items[0].id===changed.id,'Updated title not indexed');check((await S.listCaptures({query:'合成档案 0005'})).items.length===0,'Old title remained in summary');check((await S.listCaptures({limit:1})).items[0].id===changed.id,'Updated date not reordered');
 await S.removeCapture(changed.id);check(!await S.get('captures',changed.id)&&(await S.listCaptures({query:'更新后的唯一标题'})).items.length===0,'Delete left body or summary');
 report.push({name:'archive_update_and_delete_keep_summary_atomic_with_body',result:'pass'});
 return report;
}'''

async def main():
    requests=[];page_errors=[];workspace=None;source_page=None;experiment_page=None
    async def route(r):
        u=urlparse(r.request.url)
        if u.hostname!='chatgpt.com':return await r.abort()
        requests.append({'method':r.request.method,'path':u.path})
        if r.request.method not in ('GET','HEAD'):return await r.fulfill(status=405,body='READ_ONLY_SYNTHETIC_FIXTURE')
        if u.path=='/api/auth/session':return await r.fulfill(json={'accessToken':'synthetic-reliability-fixture','account':{'id':'synthetic-account'}})
        if u.path.startswith('/backend-api/conversation/'):
            cid=u.path.rsplit('/',1)[-1]
            if cid in (A,B):return await r.fulfill(json=model(cid))
        if u.path in ('/c/'+A,'/c/'+B):return await r.fulfill(content_type='text/html',body=HTML)
        return await r.fulfill(status=404,body='UNKNOWN_SYNTHETIC_FIXTURE')
    async with async_playwright() as pw:
      with tempfile.TemporaryDirectory(prefix='chatflow-reliability-') as profile:
        context=await pw.chromium.launch_persistent_context(profile,channel='chromium',executable_path=os.environ.get('CHATFLOW_CHROMIUM'),headless=False,accept_downloads=True,args=['--disable-extensions-except='+str(ROOT/'dist/edge'),'--load-extension='+str(ROOT/'dist/edge'),'--no-sandbox'])
        try:
            await context.route('https://**',route);await context.route('http://**',lambda r:r.abort())
            # Test-only Chromium permission grant. The product manifest remains
            # unchanged; each paste still uses the real system clipboard and keys.
            await context.grant_permissions(['clipboard-read','clipboard-write'])
            worker=context.service_workers[0] if context.service_workers else await context.wait_for_event('serviceworker',timeout=30000)
            extension=worker.url.split('/')[2];base='chrome-extension://'+extension
            source_page=await context.new_page();await source_page.goto(URL_A)
            workspace=await context.new_page();workspace.on('pageerror',lambda e:page_errors.append(str(e)));await workspace.goto(base+'/workspace/index.html')
            await workspace.locator('#home-view').wait_for(state='visible');await poll(workspace,'()=>document.querySelector("#quota").textContent.includes("本地已用")');await workspace.locator('#home-view [data-view="capture"]').click()
            await poll(workspace,'()=>!document.querySelector("#capture").disabled&&document.querySelector("#source").value')
            source_rows=await workspace.evaluate('async()=>(await chrome.runtime.sendMessage({type:"tl:sources"})).data')
            tab_id=next(x['id'] for x in source_rows if x['url']==URL_A);await workspace.locator('#source').select_option(str(tab_id))
            await workspace.locator('#capture-view > details.advanced > summary').click();await workspace.locator('#allow-media').check()
            # Freeze really executes in the worker. Only the optional permission
            # promise is delayed, giving a deterministic genuine SPA route race.
            await workspace.evaluate('''()=>{
              const nativeSend=chrome.runtime.sendMessage.bind(chrome.runtime),nativePermission=chrome.permissions.request.bind(chrome.permissions);
              window.__sourceRace={freezeDone:false,permissionPending:false,freezeResponse:null};
              chrome.runtime.sendMessage=async(...args)=>{const response=await nativeSend(...args);if(args[0]?.type==='tl:freezeSource'){window.__sourceRace.freezeDone=true;window.__sourceRace.freezeResponse=response;}return response;};
              chrome.permissions.request=()=>{window.__sourceRace.permissionPending=true;return new Promise(resolve=>window.__sourceRace.release=resolve);};
              window.__sourceRace.restore=()=>{chrome.runtime.sendMessage=nativeSend;chrome.permissions.request=nativePermission;};
            }''')
            await workspace.locator('#capture').click();race=await poll(workspace,'()=>window.__sourceRace.freezeDone&&window.__sourceRace.permissionPending&&window.__sourceRace.freezeResponse')
            assert race['ok'] and race['data']['expectedConversationId']==A and race['data']['expectedDocumentId'],race
            await source_page.evaluate('url=>history.pushState({},"",url)',URL_B)
            await poll(workspace,'async x=>(await chrome.tabs.get(x.id)).url===x.url',{'id':tab_id,'url':URL_B})
            await workspace.evaluate('window.__sourceRace.release(true)')
            await poll(workspace,'()=>document.querySelector("#status").classList.contains("error")&&document.querySelector("#status").textContent.trim()')
            captures=await workspace.evaluate('()=>TLStore.all("captures")')
            assert captures==[],captures
            assert not any(B in r['path'] for r in requests),requests
            assert await workspace.locator('#status').is_visible()
            passed('ordinary_save_rejects_A_to_B_SPA_switch_during_permission_await',{'freezeConversation':A,'errorVisible':True,'capturesWritten':0,'BRequests':0})
            await workspace.evaluate('window.__sourceRace.restore()')
            # A same-URL reload changes the document even when conversation ID
            # remains the same. Reusing the frozen document must fail closed.
            await source_page.goto(URL_A)
            frozen=await workspace.evaluate('async x=>chrome.runtime.sendMessage({type:"tl:freezeSource",tabId:x.id,expectedUrl:x.url})',{'id':tab_id,'url':URL_A})
            assert frozen['ok'],frozen
            await source_page.reload(wait_until='domcontentloaded')
            stale=await workspace.evaluate('async frozen=>chrome.runtime.sendMessage({type:"tl:start",...frozen,scope:"all",live:false})',frozen['data'])
            assert stale.get('ok') is False and stale.get('code')=='SOURCE_DOCUMENT_CHANGED',stale
            assert await workspace.evaluate('()=>TLStore.all("captures").then(xs=>xs.length)')==0
            passed('same_URL_reload_rejects_the_previously_frozen_document',{'code':stale['code']})
            # Positive control through the actual normal save UI.
            await workspace.locator('#refresh-source').click();await workspace.locator('#source').select_option(str(tab_id));await workspace.locator('#allow-media').uncheck()
            await poll(workspace,'()=>!document.querySelector("#capture").disabled');await workspace.locator('#capture').click()
            saved=await poll(workspace,'async id=>(await TLStore.all("captures")).find(c=>c.snapshot?.source?.conversationId===id&&c.state==="ready")',A)
            await workspace.locator('#continue').wait_for(state='visible',timeout=30000)
            assert await workspace.locator('#continue').inner_text()=='继续到新对话'
            primaries=await workspace.locator('#capture-view button.primary').evaluate_all('xs=>xs.filter(e=>e.getClientRects().length&&!e.hidden).map(e=>e.id)')
            assert primaries==['continue'],primaries
            assert 'primary' not in (await workspace.locator('#capture').get_attribute('class')).split()
            assert await source_page.locator('#prompt-textarea').input_value()=='SYNTHETIC_EXISTING_DRAFT'
            assert await source_page.evaluate('window.sends')==0
            passed('unchanged_source_saves_and_continue_is_the_only_primary_action',{'captureId':saved['id'],'primaryButtons':primaries})
            # Trusted paste regressions run before seeding the large library.
            await workspace.locator('#continue').click();await workspace.locator('#handoff-view').wait_for(state='visible');await poll(workspace,'()=>!document.querySelector("#prepare").disabled')
            proof=await trusted_paste(workspace,'#instructions','H'*4001+'-HANDOFF-TAIL','#prepare','#instructions-length-notice')
            passed('trusted_clipboard_paste_preserves_over_limit_handoff_instructions',proof)
            await workspace.locator('header [data-view="settings"]').click();await workspace.locator('#pref-context').check()
            await workspace.locator('header [data-view="archive"]').click();await workspace.locator('#archives .archive-select-row input[type=checkbox]').first.check()
            await poll(workspace,'()=>!document.querySelector("#build-context").disabled')
            await workspace.locator('.context-toolbar > details > summary').click()
            proof=await trusted_paste(workspace,'#context-query','Q'*501+'-QUERY-TAIL','#build-context','#context-query-length-notice')
            passed('trusted_clipboard_paste_preserves_over_limit_context_query',proof)
            await workspace.locator('header [data-view="home"]').click();await workspace.locator('#home-view [data-view="tasks"]').click()
            await poll(workspace,'()=>document.querySelector("#task-source").value');await workspace.locator('#task-source').select_option(str(tab_id))
            proof=await trusted_paste(workspace,'#task-text','T'*20001+'-TASK-TAIL','#task-create','#task-text-count')
            passed('trusted_clipboard_paste_preserves_over_limit_task_text',proof)
            task=await workspace.evaluate('s=>TLTaskStore.create(s,"Synthetic paste validation task")',{'origin':'https://chatgpt.com','conversationId':A,'url':URL_A,'title':'Synthetic source A'})
            await workspace.locator('#task-mode-return').click()
            result='['+task['code']+']\n'+'R'*262144+'-RESULT-TAIL'
            proof=await trusted_paste(workspace,'#task-result-text',result,'#task-save-result','#task-result-count')
            passed('trusted_clipboard_paste_preserves_over_limit_task_result',proof)
            experiment_page=await context.new_page();experiment_page.on('pageerror',lambda e:page_errors.append(str(e)));await experiment_page.goto(base+'/workspace/experiments.html')
            await poll(experiment_page,'()=>!document.querySelector("#ff-notice").textContent.includes("正在检查")&&!document.querySelector("#ff-enable").disabled');await experiment_page.locator('#ff-enable').check();await experiment_page.locator('#ff-local').wait_for(state='visible')
            proof=await trusted_paste(experiment_page,'#ff-p','汉'*8001+'-EXPERIMENT-TAIL','#ff-save','#ff-bytes')
            assert proof['utf8Bytes']>24000 and '超限' in await experiment_page.locator('#ff-bytes').inner_text(),proof
            passed('trusted_clipboard_paste_preserves_experiment_input_above_UTF8_budget',proof)
            await experiment_page.close();experiment_page=None;await workspace.bring_to_front()
            for case in await workspace.evaluate(ARCHIVE_CASES):
                REPORT['cases'].append(case);print('PASS',case['name'],flush=True)
            assert all(r['method'] in ('GET','HEAD') for r in requests),requests
            assert not page_errors,page_errors
            REPORT['status']='pass'
        except Exception as e:
            REPORT['error']={'message':str(e),'traceback':traceback.format_exc()}
            if workspace:
                try:await workspace.screenshot(path=str(OUT/'reliability-failure.png'),full_page=True)
                except Exception:pass
            raise
        finally:
            REPORT['pageErrors']=page_errors;REPORT['requestCounts']={'total':len(requests),'B':sum(B in r['path'] for r in requests),'writes':sum(r['method'] not in ('GET','HEAD') for r in requests)}
            (OUT/'reliability-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(REPORT,ensure_ascii=False),flush=True);await context.close()
if __name__=='__main__':asyncio.run(main())
