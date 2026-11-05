"""Installed MV3 reliability, trusted clipboard paste and archive index regressions.
Runs with a fresh Chromium profile and synthetic routes/data only. This is not
an authenticated ChatGPT, independent-user or assistive-technology acceptance.
"""
import asyncio
import hashlib
import json
import os
import re
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
FIXTURE_MARKER='chatflow-reliability-v1'
HTML='''<!doctype html><html data-chatflow-fixture="chatflow-reliability-v1"><head><title>Synthetic source A</title></head><body>
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

async def assert_source_fixture(page,response,label):
    """Fail at navigation if routing failed, before any capture action runs."""
    proof=await page.evaluate(r'''()=>({path:/^\/c\/conversation_reliability_[AB]_20261103$/.test(location.pathname)?location.pathname:'[non-fixture route]',marker:document.documentElement.dataset.chatflowFixture||null,draftIntact:document.querySelector('#prompt-textarea')?.value==='SYNTHETIC_EXISTING_DRAFT',sendCount:window.sends})''')
    proof.update({'navigation':label,'status':response.status if response else None,'responseMarker':response.headers.get('x-chatflow-fixture') if response else None})
    REPORT.setdefault('fixtureNavigations',[]).append(proof)
    assert response and response.status==200 and proof['responseMarker']==FIXTURE_MARKER,proof
    assert page.url==URL_A and proof['marker']==FIXTURE_MARKER and proof['draftIntact'] and proof['sendCount']==0,proof

RPC_TRACE=r'''()=>{
 if(window.__reliabilityRPC)return;
 const nativeSend=chrome.runtime.sendMessage.bind(chrome.runtime),entries=[];
 const watched=new Set(['tl:freezeSource','tl:start','tl:stop','tl:sources','tl:sessions']);
 const identity=url=>{try{const u=new URL(url);return /^\/c\/conversation_reliability_[AB]_20261103$/.test(u.pathname)?u.pathname:'[non-fixture route]';}catch{return null;}};
 const response=(type,r)=>{
  const out={ok:r?.ok===true,code:r?.code||null};
  if(type==='tl:freezeSource')out.data={tabId:r?.data?.tabId,conversationId:r?.data?.expectedConversationId,documentLocked:!!r?.data?.expectedDocumentId};
  if(type==='tl:start')out.data={captureId:r?.data?.captureId};
  if(type==='tl:sources')out.data=r?.data?.map(x=>({id:x.id,path:identity(x.url)}));
  if(type==='tl:sessions')out.data=r?.data?.map(x=>({captureId:x.captureId,tabId:x.tabId,phase:x.phase,live:x.live}));
  return out;
 };
 chrome.runtime.sendMessage=function(...args){
  const msg=args[0];
  // The workspace uses the Promise overload. Preserve callback overloads as-is.
  if(!watched.has(msg?.type)||typeof args.at(-1)==='function')return nativeSend(...args);
  const entry={type:msg.type,request:{tabId:msg.tabId,path:identity(msg.expectedUrl),documentLocked:!!msg.expectedDocumentId,scope:msg.scope,live:msg.live}};
  entries.push(entry);if(entries.length>100)entries.shift();
  let pending;try{pending=nativeSend(...args);}catch(e){entry.thrown=e?.name||'Error';throw e;}
  pending.then(r=>{entry.response=response(msg.type,r);},e=>{entry.thrown=e?.name||'Error';});
  return pending;
 };
 window.__reliabilityRPC={entries};
}'''

WORKSPACE_DIAGNOSTICS=r'''async()=>{
 const $=id=>document.getElementById(id),out={};
 const identity=url=>{try{const path=new URL(url).pathname;return /^\/c\/conversation_reliability_[AB]_20261103$/.test(path)?path:'[non-fixture route]';}catch{return null;}};
 out.ui={visibleViews:[...document.querySelectorAll('.view:not([hidden])')].map(e=>e.id),status:$('status')?.textContent.slice(0,400),statusError:$('status')?.classList.contains('error'),running:$('running')?.textContent.slice(0,400),sourceValue:$('source')?.value,sourceOptions:[...($('source')?.options||[])].map(x=>({value:x.value,path:identity(x.dataset.sourceUrl)})),captureDisabled:$('capture')?.disabled,continueHidden:$('continue')?.hidden,allowMedia:$('allow-media')?.checked,live:$('live')?.checked,scope:$('asset-scope')?.value};
 out.rpc=window.__reliabilityRPC?.entries||[];
 if(window.__sourceRace)out.race={freezeDone:window.__sourceRace.freezeDone,permissionPending:window.__sourceRace.permissionPending,released:window.__sourceRace.released,restored:window.__sourceRace.restored};
 try{const page=await TLStore.listCaptures({limit:100});out.captures=page.items.map(c=>({id:c.id,conversationId:c.source?.conversationId,state:c.state,live:c.live,hasSnapshot:c.hasSnapshot,messageCount:c.messageCount,integrityState:c.integrityState,lastError:c.lastError,savedFiles:c.savedFiles,missingFiles:c.missingFiles,excludedFiles:c.excludedFiles}));out.moreCaptures=!!page.nextCursor;}catch(e){out.captureReadError=e?.name||'Error';}
 try{const r=await chrome.runtime.sendMessage({type:'tl:sessions'});out.sessions=r?.ok?r.data.map(x=>({captureId:x.captureId,tabId:x.tabId,phase:x.phase,live:x.live})):{code:r?.code};}catch(e){out.sessionReadError=e?.name||'Error';}
 return out;
}'''

async def failure_diagnostics(workspace,source_page,experiment_page,rpc_history):
    detail={'earlierRPC':rpc_history}
    for name,page,expression in [
        ('workspace',workspace,WORKSPACE_DIAGNOSTICS),
        ('source',source_page,r"""()=>({path:/^\/c\/conversation_reliability_[AB]_20261103$/.test(location.pathname)?location.pathname:'[non-fixture route]',fixtureMarker:document.documentElement.dataset.chatflowFixture||null,readyState:document.readyState,draftIntact:document.querySelector('#prompt-textarea')?.value==='SYNTHETIC_EXISTING_DRAFT',sendCount:window.sends})"""),
        ('experiment',experiment_page,"""()=>({enabled:document.querySelector('#ff-enable')?.checked,enableDisabled:document.querySelector('#ff-enable')?.disabled,localHidden:document.querySelector('#ff-local')?.hidden,notice:document.querySelector('#ff-notice')?.textContent.slice(0,400)})""")]:
        if not page or page.is_closed():continue
        try:detail[name]=await asyncio.wait_for(page.evaluate(expression),timeout=5)
        except Exception as e:detail[name]={'diagnosticError':type(e).__name__}
    return detail

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
    requests=[];page_errors=[];rpc_history=[];workspace=None;source_page=None;experiment_page=None
    async def route(r):
        u=urlparse(r.request.url)
        known_paths={'/api/auth/session','/c/'+A,'/c/'+B,'/backend-api/conversation/'+A,'/backend-api/conversation/'+B}
        record={'method':r.request.method,'path':u.path if u.hostname=='chatgpt.com' and u.path in known_paths else '[non-fixture target]','resourceType':r.request.resource_type,'outcome':'blocked'}
        requests.append(record)
        # One anchored regex route owns every HTTP(S) request. Never fall through
        # to a real website, even for an unexpected redirect or fixture typo.
        if u.scheme!='https' or u.hostname!='chatgpt.com' or u.path not in known_paths or r.request.method not in ('GET','HEAD'):return await r.abort('blockedbyclient')
        record['outcome']='fixture';headers={'x-chatflow-fixture':FIXTURE_MARKER}
        if u.path=='/api/auth/session':return await r.fulfill(headers=headers,json={'accessToken':'synthetic-reliability-fixture','account':{'id':'synthetic-account'}})
        if u.path.startswith('/backend-api/conversation/'):
            cid=u.path.rsplit('/',1)[-1]
            return await r.fulfill(headers=headers,json=model(cid))
        return await r.fulfill(headers=headers,content_type='text/html',body=HTML)
    async with async_playwright() as pw:
      with tempfile.TemporaryDirectory(prefix='chatflow-reliability-') as profile:
        context=await pw.chromium.launch_persistent_context(profile,channel='chromium',executable_path=os.environ.get('CHATFLOW_CHROMIUM'),headless=False,accept_downloads=True,args=['--disable-extensions-except='+str(ROOT/'dist/edge'),'--load-extension='+str(ROOT/'dist/edge'),'--no-sandbox'])
        try:
            # A hostname-only glob such as https://** is normalized with a final
            # slash by Playwright 1.56, missing /c/ID. Regex avoids that ambiguity.
            await context.route(re.compile(r'^https?://',re.IGNORECASE),route)
            # Test-only Chromium permission grant. The product manifest remains
            # unchanged; each paste still uses the real system clipboard and keys.
            await context.grant_permissions(['clipboard-read','clipboard-write'])
            worker=context.service_workers[0] if context.service_workers else await context.wait_for_event('serviceworker',timeout=30000)
            extension=worker.url.split('/')[2];base='chrome-extension://'+extension
            source_page=await context.new_page();response=await source_page.goto(URL_A);await assert_source_fixture(source_page,response,'initial_source_A')
            workspace=await context.new_page();workspace.on('pageerror',lambda e:page_errors.append(str(e)));await workspace.goto(base+'/workspace/index.html')
            await workspace.locator('#home-view').wait_for(state='visible');await poll(workspace,'()=>document.querySelector("#quota").textContent.includes("本地已用")');await workspace.evaluate(RPC_TRACE);await workspace.locator('#home-view [data-view="capture"]').click()
            await poll(workspace,'()=>!document.querySelector("#capture").disabled&&document.querySelector("#source").value')
            source_rows=await workspace.evaluate('async()=>(await chrome.runtime.sendMessage({type:"tl:sources"})).data')
            tab_id=next(x['id'] for x in source_rows if x['url']==URL_A);await workspace.locator('#source').select_option(str(tab_id))
            await workspace.locator('#capture-view > details.advanced > summary').click();await workspace.locator('#allow-media').check()
            # Freeze really executes in the worker. Only the optional permission
            # promise is delayed, giving a deterministic genuine SPA route race.
            await workspace.evaluate('''()=>{
              const nativeSend=chrome.runtime.sendMessage.bind(chrome.runtime),nativePermission=chrome.permissions.request.bind(chrome.permissions);
              window.__sourceRace={freezeDone:false,permissionPending:false,freezeResponse:null,released:false,restored:false};
              chrome.runtime.sendMessage=async(...args)=>{const response=await nativeSend(...args);if(args[0]?.type==='tl:freezeSource'){window.__sourceRace.freezeDone=true;window.__sourceRace.freezeResponse=response;}return response;};
              chrome.permissions.request=()=>{window.__sourceRace.permissionPending=true;return new Promise(resolve=>window.__sourceRace.release=value=>{window.__sourceRace.released=true;resolve(value);});};
              window.__sourceRace.restore=()=>{chrome.runtime.sendMessage=nativeSend;chrome.permissions.request=nativePermission;window.__sourceRace.restored=true;};
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
            response=await source_page.goto(URL_A);await assert_source_fixture(source_page,response,'return_to_source_A')
            frozen=await workspace.evaluate('async x=>chrome.runtime.sendMessage({type:"tl:freezeSource",tabId:x.id,expectedUrl:x.url})',{'id':tab_id,'url':URL_A})
            assert frozen['ok'],frozen
            response=await source_page.reload(wait_until='domcontentloaded');await assert_source_fixture(source_page,response,'same_URL_new_document')
            stale=await workspace.evaluate('async frozen=>chrome.runtime.sendMessage({type:"tl:start",...frozen,scope:"all",live:false})',frozen['data'])
            assert stale.get('ok') is False and stale.get('code')=='SOURCE_DOCUMENT_CHANGED',stale
            assert await workspace.evaluate('()=>TLStore.all("captures").then(xs=>xs.length)')==0
            passed('same_URL_reload_rejects_the_previously_frozen_document',{'code':stale['code']})
            # Positive control through the actual normal save UI.
            assert await workspace.evaluate('()=>window.__sourceRace.restored&&window.__sourceRace.released')
            assert await workspace.evaluate('async()=>(await chrome.runtime.sendMessage({type:"tl:sessions"})).data.length')==0
            rpc_history.extend(await workspace.evaluate('window.__reliabilityRPC.entries'))
            # Start this independent control with native permission functions and
            # a fresh source-picker cache, after proving both rejected runs ended.
            await workspace.reload();await poll(workspace,'()=>document.querySelector("#quota").textContent.includes("本地已用")');await workspace.evaluate(RPC_TRACE)
            assert await workspace.evaluate('()=>window.__sourceRace===undefined')
            await workspace.locator('#home-view [data-view="capture"]').click()
            await poll(workspace,'x=>{const s=document.querySelector("#source");return [...s.options].some(o=>o.value===String(x.id)&&o.dataset.sourceUrl===x.url)&&!document.querySelector("#capture").disabled;}',{'id':tab_id,'url':URL_A})
            await workspace.locator('#source').select_option(str(tab_id));await workspace.locator('#capture-view > details.advanced > summary').click();await workspace.locator('#allow-media').uncheck()
            await poll(workspace,'()=>!document.querySelector("#capture").disabled');await workspace.locator('#capture').click()
            started=await poll(workspace,'()=>window.__reliabilityRPC.entries.find(x=>x.type==="tl:start"&&x.response||x.type==="tl:freezeSource"&&x.response?.ok===false)')
            assert started['type']=='tl:start' and started['response']['ok'],started
            saved=await poll(workspace,'async id=>(await TLStore.all("captures")).find(c=>c.snapshot?.source?.conversationId===id&&c.state==="ready")',A)
            assert [m['text'] for m in saved['snapshot']['messages']]==['SOURCE_MARKER_'+A,'Synthetic answer for '+A]
            for path in ['/api/auth/session','/backend-api/conversation/'+A]:assert any(r['path']==path and r['outcome']=='fixture' for r in requests),{'missingFixtureRequest':path,'requests':requests}
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
            await poll(experiment_page,'()=>!document.querySelector("#ff-notice").textContent.includes("正在检查")&&!document.querySelector("#ff-enable").disabled');await experiment_page.locator('#ff-local').wait_for(state='visible')
            proof=await trusted_paste(experiment_page,'#ff-p','汉'*8001+'-EXPERIMENT-TAIL','#ff-save','#ff-bytes')
            assert proof['utf8Bytes']>24000 and '超限' in await experiment_page.locator('#ff-bytes').inner_text(),proof
            passed('trusted_clipboard_paste_preserves_experiment_input_above_UTF8_budget',proof)
            await experiment_page.close();experiment_page=None;await workspace.bring_to_front()
            for case in await workspace.evaluate(ARCHIVE_CASES):
                REPORT['cases'].append(case);print('PASS',case['name'],flush=True)
            assert all(r['method'] in ('GET','HEAD') for r in requests),requests
            assert not any(B in r['path'] for r in requests),requests
            assert not page_errors,page_errors
            REPORT['status']='pass'
        except Exception as e:
            REPORT['error']={'message':str(e),'traceback':traceback.format_exc()}
            REPORT['diagnostics']=await failure_diagnostics(workspace,source_page,experiment_page,rpc_history)
            if workspace:
                try:await workspace.screenshot(path=str(OUT/'reliability-failure.png'),full_page=True)
                except Exception:pass
            raise
        finally:
            REPORT['pageErrors']=page_errors;REPORT['requestCounts']={'total':len(requests),'fixture':sum(r['outcome']=='fixture' for r in requests),'blocked':sum(r['outcome']=='blocked' for r in requests),'B':sum(B in r['path'] for r in requests),'writes':sum(r['method'] not in ('GET','HEAD') for r in requests)}
            REPORT['requestTrace']=requests[-100:]
            (OUT/'reliability-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(REPORT,ensure_ascii=False),flush=True);await context.close()
if __name__=='__main__':asyncio.run(main())
