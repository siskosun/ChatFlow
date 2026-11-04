"""Task Loop, progressive disclosure and navigation on real Chromium MV3 fixtures.
No authenticated ChatGPT, real Agent, real user material or human acceptance.
"""
import asyncio
import json
import os
import tempfile
import traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
REPORT={'scope':'synthetic_chromium_mv3_task_loop','cases':[],'errors':[]}
A='conversation_task_A_20261103';B='conversation_task_B_20261103'
URL_A='https://chatgpt.com/c/'+A;URL_B='https://chatgpt.com/c/'+B
TEXT='identical small task'
def message_text(i):return 'duplicate identical paragraph' if i in (4,64) else 'Question number '+str(i)
def model(cid):
 mapping={}
 for i in range(80):
  mapping['n'+str(i)]={'parent':'n'+str(i-1) if i else None,'children':['n'+str(i+1)] if i<79 else [],'message':{'id':'m'+str(i),'author':{'role':'user' if i%2==0 else 'assistant'},'content':{'content_type':'text','parts':[message_text(i)]},'metadata':{}}}
 return {'conversation_id':cid,'title':'Same title','current_node':'n79','mapping':mapping}
HTML='''<!doctype html><html><head><title>Same title</title></head><body>
<div id="scroll" style="height:420px;overflow:auto;position:relative;width:60vw"><div id="spacer" style="height:8000px"></div></div>
<textarea id="prompt-textarea">existing user draft</textarea><button id="send" onclick="window.sent++">Send</button>
<math><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2 + y^2</annotation></semantics></math>
<script>window.sent=0;const sc=document.querySelector('#scroll'),sp=document.querySelector('#spacer');function render(){sp.querySelectorAll('article').forEach(n=>n.remove());const first=Math.max(0,Math.floor(sc.scrollTop/100)-2);for(let i=first;i<Math.min(80,first+9);i++){const e=document.createElement('article');e.dataset.messageId='m'+i;e.dataset.messageAuthorRole=i%2?'assistant':'user';e.style.cssText='position:absolute;left:0;top:'+i*100+'px;height:95px';e.textContent=(i===4||i===64)?'duplicate identical paragraph':'Question number '+i;sp.append(e);}}sc.addEventListener('scroll',render);sc.scrollTop=6200;render();</script></body></html>'''
async def poll(page,expression,arg=None,seconds=20):
 end=asyncio.get_running_loop().time()+seconds
 while asyncio.get_running_loop().time()<end:
  value=await page.evaluate(expression,arg)
  if value:return value
  await asyncio.sleep(.1)
 raise AssertionError('Resolved condition timed out: '+expression)
def passed(name,details=None):REPORT['cases'].append({'name':name,'result':'pass','detail':details});print('PASS',name,flush=True)
async def main():
 api_down={'value':False};requests=[];errors=[]
 async def route(r):
  u=urlparse(r.request.url);requests.append((r.request.method,u.path))
  if u.path=='/api/auth/session':return await r.fulfill(json={'accessToken':'synthetic-no-account'})
  if u.path.startswith('/backend-api/conversation/'):
   if api_down['value']:return await r.fulfill(status=503,body='fixture API unavailable')
   return await r.fulfill(json=model(u.path.split('/')[-1]))
  if '/c/' in u.path:return await r.fulfill(content_type='text/html',body=HTML)
  return await r.fulfill(status=404,body='fixture only')
 async def launch(pw,profile):
  c=await pw.chromium.launch_persistent_context(str(profile),channel='chromium',executable_path=os.environ.get('CHATFLOW_CHROMIUM'),headless=False,accept_downloads=True,args=['--disable-extensions-except='+str(ROOT/'dist/edge'),'--load-extension='+str(ROOT/'dist/edge'),'--no-sandbox'])
  await c.route('https://chatgpt.com/**',route)
  worker=c.service_workers[0] if c.service_workers else await c.wait_for_event('serviceworker',timeout=30000)
  return c,worker.url.split('/')[2]
 async with async_playwright() as pw:
  with tempfile.TemporaryDirectory(prefix='chatflow-task-loop-') as tmp:
   profile=Path(tmp)/'profile';c,ext=await launch(pw,profile);w=None
   try:
    a=await c.new_page();await a.goto(URL_A);b=await c.new_page();await b.goto(URL_B)
    w=await c.new_page();w.on('pageerror',lambda e:errors.append(str(e)));await w.goto('chrome-extension://'+ext+'/workspace/index.html')
    await w.locator('#home-view').wait_for(state='visible');assert await w.locator('#home-view .flow-choice').count()==2
    assert await w.locator('#home-view .flow-choice').evaluate_all('(xs)=>new Set(xs.map(x=>x.className)).size===1')
    assert '保存并接到新对话' in await w.locator('#home-view').inner_text()
    assert '外部助手' in await w.locator('#home-view').inner_text()
    assert await w.locator('#first-run-prereqs li').count()==3
    assert await w.locator('.chatgpt-link').get_attribute('href')=='https://chatgpt.com/'
    for width in [320,360,480,768,1280]:
     await w.set_viewport_size({'width':width,'height':900});assert await w.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
     await w.screenshot(path=str(OUT/f'cf03-home-{width}.png'),full_page=True)
    passed('equal_home_journeys_and_five_responsive_viewports')
    await w.emulate_media(color_scheme='dark');await w.screenshot(path=str(OUT/'cf03-home-dark.png'),full_page=True);await w.emulate_media(color_scheme='light')
    await w.locator('[data-view="settings"]').click()
    for width in [320,360,390]:
     await w.set_viewport_size({'width':width,'height':900})
     alignment=await w.locator('.preference-row').evaluate_all("""rows=>rows.map(row=>{const a=row.getBoundingClientRect(),b=row.querySelector('input').getBoundingClientRect(),t=row.querySelector('.preference-copy').getBoundingClientRect();return{right:a.right,checkboxRight:b.right,textRight:t.right,checkboxLeft:b.left,textLeft:t.left,display:getComputedStyle(row).display,weight:getComputedStyle(row).fontWeight};})""")
     assert len(alignment)==6 and all(r['display']=='grid' and r['textRight']<=r['checkboxLeft']-6 and abs(r['right']-r['checkboxRight'])<3 for r in alignment),alignment
     assert await w.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
    await w.screenshot(path=str(OUT/'cf03-settings-light-390.png'),full_page=True)
    await w.emulate_media(color_scheme='dark')
    await w.screenshot(path=str(OUT/'cf03-settings-dark-390.png'),full_page=True)
    assert await w.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
    await w.emulate_media(color_scheme='light')
    passed('sidebar_settings_toggle_column_and_descriptions_align_at_320_360_390')
    for name in ['context','experiments','live','diagnostics','passages']:assert not await w.locator('#pref-'+name).is_checked()
    await w.locator('#pref-context').check();await poll(w,"async()=>(await chrome.storage.local.get('cfPreferences')).cfPreferences?.context===true");await w.reload();await w.locator('[data-view="settings"]').click();assert await w.locator('#pref-context').is_checked();await w.locator('#pref-context').uncheck()
    passed('advanced_features_opt_in_persist_without_disabling_safety')
    await w.locator('#settings-view [data-view="home"]').click();await w.locator('#home-view [data-view="tasks"]').click()
    sources=await w.evaluate("async()=>(await chrome.runtime.sendMessage({type:'tl:sources'})).data")
    ta=next(x['id'] for x in sources if x['url']==URL_A);tb=next(x['id'] for x in sources if x['url']==URL_B)
    await poll(w,'()=>document.querySelectorAll("#task-source option").length===3')
    for tabid in [ta,tb]:
     await w.locator('#task-source').select_option(str(tabid));await w.locator('#task-text').fill(TEXT);await w.locator('#task-create').click()
     await poll(w,'n=>TLTaskStore.list().then(xs=>xs.length===n)',1 if tabid==ta else 2)
    rows=await w.evaluate('()=>TLTaskStore.list()');at=next(x for x in rows if x['source']['url']==URL_A);bt=next(x for x in rows if x['source']['url']==URL_B)
    assert at['code']!=bt['code'];assert await w.evaluate('()=>TLStore.all("captures").then(xs=>xs.length)')==0
    passed('same_title_same_text_tasks_bound_to_distinct_sources_without_capture')
    await w.locator('#task-mode-return').click()
    for t in [bt,at]:
     text='['+t['code']+']\nresult for '+t['source']['conversationId'];await w.locator('#task-result-text').fill(text)
     await w.locator('#task-save-result').wait_for(state='visible');await poll(w,'()=>!document.querySelector("#task-save-result").disabled')
     assert await w.locator('#task-match a').get_attribute('href')==t['source']['url'];await w.locator('#task-save-result').click();await w.locator('#task-return-origin').wait_for(state='visible')
    receipts=await w.evaluate('()=>TLTaskStore.results()');assert len(receipts)==2 and all(r['assignment']=='marker_matched' for r in receipts)
    passed('reverse_return_order_uses_exact_marker_not_topic_or_title')
    # A rejected clipboard write must offer a manual path, not claim that it copied.
    await w.evaluate("Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new DOMException('fixture denied','NotAllowedError')}})")
    await w.locator('#task-return-origin').click();await w.locator('#task-open-only').wait_for(state='visible')
    assert await w.locator('#task-status').evaluate("e=>e.classList.contains('error')")
    assert await w.locator('#task-result-text').evaluate('e=>document.activeElement===e&&e.selectionStart===0&&e.selectionEnd===e.value.length')
    await w.locator('#task-open-only').click();assert await a.locator('#prompt-textarea').input_value()=='existing user draft';assert await a.evaluate('window.sent')==0 and await b.evaluate('window.sent')==0
    passed('clipboard_denial_keeps_selectable_result_and_return_never_sends_or_overwrites')
    await w.bring_to_front();await w.locator('#task-result-text').fill('untagged result');await w.locator('#task-manual').wait_for(state='visible');assert await w.locator('#task-save-result').is_disabled()
    await w.locator('#task-manual-source').select_option(bt['id']);await poll(w,"url=>document.querySelector('#task-match a')?.href===url",URL_B);assert await w.locator('#task-status').inner_text()=='';await w.locator('#task-manual-confirm').check();await w.locator('#task-save-result').click();await w.locator('#task-return-origin').wait_for(state='visible')
    assert any(r['assignment']=='manual_assigned' for r in await w.evaluate('()=>TLTaskStore.results()'))
    await w.locator('#task-result-text').fill('['+at['code']+']\n['+bt['code']+']\nconflict');await w.locator('#task-manual').wait_for(state='visible');assert await w.locator('#task-save-result').is_disabled()
    passed('missing_and_conflicting_markers_require_explicit_manual_assignment')
    for width in [320,360,768,1280]:
     await w.set_viewport_size({'width':width,'height':900});assert await w.evaluate('document.documentElement.scrollWidth<=innerWidth+2');await w.screenshot(path=str(OUT/f'cf03-task-return-{width}.png'),full_page=True)
    # Actual IndexedDB, not an in-memory replacement. A conflict rolls back all records.
    check=await w.evaluate('''async()=>{const S=TLTaskStore,T=TLTasks,bundle=await S.bundle(),counts=[(await S.list()).length,(await S.results()).length],again=await S.restore(bundle);const changed=structuredClone(bundle);changed.tasks[0].source={...changed.tasks[0].source,conversationId:'conversation_wrong_123456',url:'https://chatgpt.com/c/conversation_wrong_123456'};let error='';try{await S.restore(changed);}catch(e){error=e.message;}return{counts,again,error,after:[(await S.list()).length,(await S.results()).length]};}''')
    assert check['again']=={'tasks':0,'results':0};assert check['error']=='TASK_IMPORT_CONFLICT';assert check['after']==check['counts']
    passed('task_backup_idempotence_and_conflict_atomicity_on_real_indexeddb')
    # Old source selector must never bind a navigated tab to the newly opened chat.
    await a.goto(URL_B);stale=await w.evaluate("async x=>chrome.runtime.sendMessage({type:'tl:taskSource',tabId:x.id,expectedUrl:x.url})",{'id':ta,'url':URL_A});assert not stale['ok'] and stale['code']=='TASK_SOURCE_CHANGED';await a.goto(URL_A)
    passed('stale_source_tab_identity_rejected_before_task_creation')
    # Optional navigation loads only after the user asks. It finds messages not in the current DOM.
    assert await a.locator('#chatflow-page-tools').count()==0
    await w.locator('[data-view="home"]').first.click();await w.locator('#home-view [data-view="capture"]').click();await w.locator('#source').select_option(str(ta))
    selected=await w.evaluate("()=>({id:document.querySelector('#source').value,url:document.querySelector('#source').selectedOptions[0]?.dataset.sourceUrl})")
    assert selected=={'id':str(ta),'url':URL_A},selected
    await w.locator('#open-tools').click()
    await w.wait_for_timeout(350)
    print('SIDEPANEL_TOOLS_DIAGNOSTIC',json.dumps({'selection':selected,'status':await w.locator('#status').inner_text(),'toolsPresent':await a.locator('#chatflow-page-tools').count()}),flush=True)
    tools=a.locator('#chatflow-page-tools');await tools.wait_for(state='attached');await poll(a,"()=>document.querySelector('#chatflow-page-tools').shadowRoot.textContent.includes('80')")
    search=tools.locator('input[type=search]');await search.fill('Question number 0');await tools.locator('#list .row button').first.click();await a.locator('[data-message-id="m0"]').wait_for(state='attached')
    assert await a.locator('[data-message-id="m0"]').evaluate("e=>{const r=e.getBoundingClientRect(),b=document.querySelector('#scroll').getBoundingClientRect();return r.bottom>b.top&&r.top<b.bottom;}")
    await search.fill('duplicate identical paragraph');assert await tools.locator('#list .row button').count()==2
    await tools.get_by_role('button',name='\u4e0a\u4e00\u6761',exact=True).click();await a.locator('[data-message-id="m64"]').wait_for(state='attached')
    await tools.get_by_role('button',name='\u4e0b\u4e00\u6761',exact=True).click();await a.locator('[data-message-id="m4"]').wait_for(state='attached')
    await tools.locator('#list .row button').last.click();await a.locator('[data-message-id="m64"]').wait_for(state='attached')
    passed('virtualized_navigation_finds_exact_ids_and_distinguishes_duplicate_text')
    await tools.locator('#list .row input').first.check();await tools.locator('details summary').click();await tools.locator('select').first.select_option('json')
    async with a.expect_download() as downloaded:await tools.get_by_role('button',name='\u5bfc\u51fa\u52fe\u9009\u56de\u5408').click()
    data=json.loads(Path(await (await downloaded.value).path()).read_text());assert data['scope']=='selected_turns_not_full_archive' and data['source']['conversationId']==A;assert data['messages'][0]['id']=='m4'
    await tools.locator('select').last.select_option('x^2 + y^2');await tools.get_by_role('button',name='\u590d\u5236 LaTeX').click()
    passed('ported_selected_turn_export_preserves_source_and_latex_is_user_triggered')
    api_down['value']=True;await tools.get_by_role('button',name='\u5237\u65b0\u5f53\u524d\u5bf9\u8bdd').click();await poll(a,"()=>document.querySelector('#chatflow-page-tools').shadowRoot.textContent.includes('\\u4ec5\\u5df2\\u52a0\\u8f7d')")
    passed('API_failure_is_labelled_loaded_only_not_complete_history')
    await a.screenshot(path=str(OUT/'cf03-page-tools.png'),full_page=True);await a.evaluate("history.pushState({},'', '/')");await tools.wait_for(state='detached')
    passed('navigation_closes_and_cancels_on_source_route_change')
    saved=await w.evaluate('()=>TLTaskStore.bundle()');await c.close();c,ext=await launch(pw,profile);w=await c.new_page();await w.goto('chrome-extension://'+ext+'/workspace/index.html');await w.wait_for_function('typeof TLTaskStore!=="undefined"')
    restored=await w.evaluate('()=>TLTaskStore.bundle()');assert restored==saved
    passed('browser_restart_preserves_task_and_result_identity')
    assert not errors,errors;assert all(method=='GET' for method,path in requests),requests
    passed('no_page_errors_source_write_requests_or_automatic_send')
   except Exception as e:
    REPORT['errors'].append({'error':str(e),'trace':traceback.format_exc()})
    if w:
     try:await w.screenshot(path=str(OUT/'cf03-failure.png'),full_page=True)
     except Exception:pass
    raise
   finally:
    REPORT['page_errors']=errors;(OUT/'task-loop-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2),encoding='utf-8');await c.close()
if __name__=='__main__':asyncio.run(main())
