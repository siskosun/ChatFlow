"""Real Chromium MV3 clicks for reported UI paths. Synthetic chat only.

No authenticated ChatGPT, native browser quote UI or human acceptance is assumed.
"""
import asyncio
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
SOURCE = 'https://chatgpt.com/c/ui_audit_source_20261105'
CHAT_HTML = """<!doctype html><html lang="zh"><head><title>合成来源对话</title></head>
<body style="margin:0"><main style="padding:120px 18px 1500px">
<article data-message-id="m1" data-message-author-role="assistant">
  <p id="audit-quote" style="font:20px/1.6 sans-serif">只选中这一条回复的文字</p>
</article>
<article data-message-id="m2" data-message-author-role="user">
  <p>这是另一条消息，不应混入选文</p>
</article></main>
<button id="native-ask" style="position:fixed;left:20px;top:80px;height:32px">向 ChatGPT 提问</button>
</body></html>"""

async def wait(page, expression, seconds=16):
    until = asyncio.get_running_loop().time() + seconds
    while asyncio.get_running_loop().time() < until:
        if await page.evaluate(expression):
            return
        await asyncio.sleep(.1)
    raise AssertionError('Timed out: ' + expression)

async def main():
    results = []
    errors = []
    def passed(name):
        results.append(name)
        print('PASS', name, flush=True)

    async with async_playwright() as pw:
        with tempfile.TemporaryDirectory(prefix='chatflow-ui-click-') as folder:
            context = await pw.chromium.launch_persistent_context(
                folder, channel='chromium', executable_path=os.environ.get('CHATFLOW_CHROMIUM'),
                headless=False, args=[
                    '--disable-extensions-except=' + str(ROOT / 'dist/edge'),
                    '--load-extension=' + str(ROOT / 'dist/edge'), '--no-sandbox'
                ])
            workspace = None
            try:
                async def route(request):
                    u = urlparse(request.request.url)
                    if request.request.method not in ('GET', 'HEAD'):
                        errors.append('unexpected network write: ' + u.path)
                        await request.fulfill(status=405, body='synthetic only')
                    elif u.path.startswith('/c/'):
                        await request.fulfill(content_type='text/html', body=CHAT_HTML)
                    else:
                        await request.fulfill(status=503, body='synthetic API unavailable')
                await context.route('https://chatgpt.com/**', route)
                worker = context.service_workers[0] if context.service_workers else await context.wait_for_event('serviceworker')
                base = 'chrome-extension://' + worker.url.split('/')[2] + '/workspace/'
                chat = await context.new_page()
                await chat.goto(SOURCE)
                native_ask_before=await chat.locator('#native-ask').text_content()
                assert native_ask_before and native_ask_before.strip(), 'Native ask control missing from fixture'
                workspace = await context.new_page()
                workspace.on('pageerror', lambda e: errors.append('workspace: ' + str(e)))
                await workspace.goto(base + 'index.html')
                await wait(workspace, "()=>!!globalThis.ChatFlowTaskUI&&!!globalThis.ChatFlowExperimentTabs")
                assert await workspace.locator('#home-view').is_visible()

                # 1. Opening and closing the experiment is a toggle, not
                # a create-a-new-tab action on every click.
                await workspace.locator('#home-experiment').click()
                await wait(workspace, """async()=>{
                    const url=chrome.runtime.getURL('workspace/experiments.html');
                    return (await chrome.tabs.query({})).filter(t=>t.url===url).length===1 &&
                      document.querySelector('#home-experiment strong').textContent==='关闭并行实验';
                }""")
                count = await workspace.evaluate("""async()=>{
                    const url=chrome.runtime.getURL('workspace/experiments.html');
                    return (await chrome.tabs.query({})).filter(t=>t.url===url).length;
                }""")
                assert count == 1
                await workspace.locator('#home-experiment').click()
                await wait(workspace, """async()=>{
                    const url=chrome.runtime.getURL('workspace/experiments.html');
                    return !(await chrome.tabs.query({})).some(t=>t.url===url) &&
                      document.querySelector('#home-experiment strong').textContent==='打开并行实验';
                }""")
                await workspace.locator('#home-experiment').evaluate('(b)=>{b.click();b.click();b.click();}')
                await wait(workspace, """async()=>{
                    const url=chrome.runtime.getURL('workspace/experiments.html');
                    return (await chrome.tabs.query({})).filter(t=>t.url===url).length===1;
                }""")
                await workspace.locator('[data-view="settings"]').click()
                await wait(workspace, "()=>document.querySelector('#settings-open-experiments').textContent==='关闭并行实验'")
                await workspace.locator('#settings-open-experiments').click()
                await wait(workspace, """async()=>{
                    const url=chrome.runtime.getURL('workspace/experiments.html');
                    return !(await chrome.tabs.query({})).some(t=>t.url===url);
                }""")
                passed('experiment_entry_is_singleton_toggle_across_home_and_settings')

                # A formerly active experiment tab may be navigated to another
                # website by the user. Its ID is not an ownership lease; closing
                # experiments must never close that unrelated page.
                await workspace.locator('header [data-view="home"]').click()
                await workspace.locator('#home-experiment').click()
                await wait(workspace, """async()=>{
                    const u=chrome.runtime.getURL('workspace/experiments.html');
                    return (await chrome.tabs.query({})).filter(t=>t.url===u).length===1;
                }""")
                experiment_page=next(
                    p for p in context.pages
                    if p.url==base+'experiments.html'
                )
                navigated_url='https://chatgpt.com/c/ui_audit_navigated_20261105'
                await experiment_page.goto(navigated_url)
                await wait(workspace, """async()=>{
                    const u=chrome.runtime.getURL('workspace/experiments.html');
                    return !(await chrome.tabs.query({})).some(t=>t.url===u) &&
                        document.querySelector('#home-experiment strong').textContent==='打开并行实验';
                }""")
                await workspace.locator('#home-experiment').click()
                await wait(workspace, """async()=>{
                    const u=chrome.runtime.getURL('workspace/experiments.html');
                    return (await chrome.tabs.query({})).filter(t=>t.url===u).length===1;
                }""")
                assert experiment_page.url==navigated_url, 'Navigated user tab must not be closed'
                await workspace.locator('#home-experiment').click()
                await wait(workspace, """async()=>{
                    const u=chrome.runtime.getURL('workspace/experiments.html');
                    return !(await chrome.tabs.query({})).some(t=>t.url===u);
                }""")
                assert experiment_page.url==navigated_url
                await experiment_page.close()
                await workspace.locator('header [data-view="settings"]').click()
                passed('experiment_close_never_closes_navigated_unrelated_tab')

                # 2. Preferences do not navigate by merely being enabled.
                for key in ('context', 'live', 'diagnostics', 'passages'):
                    await workspace.locator('#pref-' + key).check()
                    assert await workspace.locator('#settings-view').is_visible(), key
                await workspace.locator('#feature-open-live').click()
                assert await workspace.locator('#settings-live-panel').is_visible()
                assert await workspace.locator('#settings-view').is_visible()
                await workspace.locator('#feature-open-diagnostics').click()
                assert await workspace.locator('#settings-diagnostics-panel').is_visible()
                assert await workspace.locator('#settings-diagnostics-panel').evaluate(
                    '(el)=>el.previousElementSibling?.id==="feature-open-diagnostics"')
                assert await workspace.locator('.preference-help').count()==0
                assert await workspace.locator('.pref-a11y-description:visible').count()==0
                assert await workspace.locator('#settings-view').is_visible()
                assert await workspace.locator('#settings-view details.advanced').first.evaluate('(d)=>d.open')
                assert '本地已用' in await workspace.locator('#quota').inner_text()
                await workspace.locator('#feature-open-tools').click()
                assert await workspace.locator('#settings-tools-panel').is_visible()
                assert await workspace.locator('#settings-view').is_visible()
                assert await workspace.locator('#settings-tools-source option').count() >= 2
                assert await workspace.locator('#settings-tools-panel').evaluate(
                    '(el)=>el.previousElementSibling?.id==="feature-open-tools"')
                await workspace.locator('#pref-tools').uncheck()
                assert not await workspace.locator('#settings-tools-panel').is_visible()
                await workspace.locator('#pref-tools').check()
                await workspace.locator('#feature-open-tools').click()
                assert await workspace.locator('#settings-tools-panel').is_visible()
                assert await workspace.locator('#settings-live-panel').evaluate(
                    '(el)=>el.previousElementSibling?.id==="feature-open-live"')
                passed('advanced_switches_and_open_actions_do_not_misroute_to_capture')

                await workspace.locator('#feature-open-context').click()
                assert await workspace.locator('#archive-view').is_visible()
                await workspace.locator('header [data-view="settings"]').click()
                await workspace.locator('#feature-open-passages').click()
                assert await workspace.locator('#archive-view').is_visible()
                assert '请选择一份档案' in await workspace.locator('#status').inner_text()
                await workspace.locator('header [data-view="home"]').click()
                assert await workspace.locator('#status').inner_text()=='', 'Stale success banner followed user home'
                passed('context_and_passages_explicitly_open_the_archive')

                # 3. The same header and content axis must remain fixed when
                # switching between short and tall panels.
                await workspace.set_viewport_size({'width':360, 'height':540})
                x_positions = []
                for view in ('home', 'archive', 'settings', 'capture', 'tasks'):
                    await workspace.evaluate('(name)=>ChatFlowWorkspace.show(name)', view)
                    await workspace.wait_for_timeout(70)
                    x_positions.append(await workspace.evaluate("""()=>({
                        brand:document.querySelector('.top .brand').getBoundingClientRect().left,
                        main:document.querySelector('main').getBoundingClientRect().left,
                        pageWidth:document.documentElement.scrollWidth,
                        viewport:innerWidth
                    })"""))
                assert max(x['brand'] for x in x_positions) - min(x['brand'] for x in x_positions) < 1.1, x_positions
                assert max(x['main'] for x in x_positions) - min(x['main'] for x in x_positions) < 1.1, x_positions
                assert all(x['pageWidth'] <= x['viewport']+2 for x in x_positions), x_positions
                passed('archive_settings_and_task_views_keep_one_horizontal_axis')

                # 4. Source refresh is a small adjacent utility; receiving
                # selected text remains a wide, independent action.
                await workspace.locator('header [data-view="home"]').click()
                await workspace.locator('#home-view [data-view="tasks"]').click()
                try:
                    await wait(workspace, "()=>document.querySelectorAll('#task-source option').length>=2")
                except AssertionError as error:
                    state=await workspace.evaluate("""async()=>({
                        visible:!document.querySelector('#tasks-view').hidden,
                        options:[...document.querySelectorAll('#task-source option')].map(e=>e.textContent),
                        sourceReply:await chrome.runtime.sendMessage({type:'tl:sources'}),
                        taskStatus:document.querySelector('#task-status')?.textContent,
                        globalStatus:document.querySelector('#status')?.textContent
                    })""")
                    raise AssertionError('Source chooser did not hydrate after the visible tasks button: '+repr(state)) from error
                dimensions = await workspace.evaluate("""()=>{
                    const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();
                        return {top:r.top,left:r.left,width:r.width,height:r.height};};
                    return {refresh:rect('task-refresh-source'),receive:rect('task-use-selection'),
                      chooser:rect('task-source')};
                }""")
                assert dimensions['refresh']['width'] <= 54, dimensions
                assert dimensions['receive']['width'] > dimensions['refresh']['width']*3, dimensions
                assert dimensions['refresh']['top'] == dimensions['chooser']['top'], dimensions
                assert await workspace.locator('#task-refresh-source').get_attribute('aria-label')=='刷新来源对话'
                await workspace.locator('#task-refresh-source').click()
                assert await workspace.locator('#tasks-view').is_visible()
                passed('refresh_utility_and_receive_selection_are_separate_with_clear_priority')

                # 5. The result paste step expands within the SAME task page;
                # creating/copying a task does not silently move to another view.
                source_id = await workspace.locator('#task-source option').nth(1).get_attribute('value')
                await workspace.locator('#task-source').select_option(source_id)
                await workspace.locator('#task-text').fill('合成：检查这个任务是否正确回传')
                await workspace.locator('#task-create').click()
                await wait(workspace, "()=>!document.querySelector('#task-next-return').closest('[hidden]')")
                assert await workspace.locator('#task-status').inner_text()=='', 'Copy success duplicated in task banner'
                assert '任务已复制' in await workspace.locator('#task-copy-state').inner_text()
                assert await workspace.locator('#task-compose').is_visible()
                assert not await workspace.locator('#task-return').is_visible()
                await workspace.locator('#task-next-return').click()
                assert await workspace.locator('#task-compose').is_visible()
                assert await workspace.locator('#task-return').is_visible()
                assert await workspace.locator('#tasks-view').is_visible()
                await workspace.screenshot(path=str(OUT/'ui-click-inline-task-return.png'),full_page=True)
                passed('task_copy_then_return_keeps_editing_and_result_on_one_page')

                # 6. The native quote control is not modified, and ChatFlow's
                # independently rendered action is placed beside it when DOM-
                # accessible. This remains a synthetic UI test only.
                await chat.evaluate("""()=>{
                    const el=document.getElementById('audit-quote'),node=el.firstChild;
                    const range=document.createRange();range.setStart(node,0);
                    range.setEnd(node,node.textContent.length);
                    const box=range.getBoundingClientRect(),ask=document.getElementById('native-ask');
                    // Populate a long-thread DOM with more than 450 unrelated controls.
                    // The real quote popover is usually appended after those controls.
                    for(let i=0;i<600;i++){
                        const decoy=document.createElement('button');
                        decoy.type='button';decoy.hidden=true;decoy.textContent='unrelated';
                        ask.before(decoy);
                    }
                    ask.style.left=(box.left+24)+'px';
                    ask.style.top=Math.min(innerHeight-50,box.bottom+12)+'px';
                    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
                }""")
                await wait(chat, """()=>{const host=document.querySelector('#chatflow-selected-action');
                    return !!host&&!host.hidden&&host.shadowRoot?.querySelector('button')?.textContent.includes('交给 ChatFlow');}""")
                position = await chat.evaluate("""()=>{
                  const own=document.getElementById('chatflow-selected-action').getBoundingClientRect(),
                    ask=document.getElementById('native-ask').getBoundingClientRect();
                  return {own:{left:own.left,top:own.top},ask:{right:ask.right,top:ask.top}};
                }""")
                assert position['own']['left'] >= position['ask']['right']-2, position
                assert abs(position['own']['top']-position['ask']['top'])<8, position
                native_ask_after=await chat.locator('#native-ask').text_content()
                assert native_ask_after==native_ask_before,{'before':repr(native_ask_before),'after':repr(native_ask_after)}
                await chat.evaluate('()=>getSelection().removeAllRanges()')
                await wait(chat, "()=>document.querySelector('#chatflow-selected-action')?.hidden===true")
                passed('selected_text_action_aligns_with_observable_native_quote_without_replacing_it')

                # 7. The remaining direct entries navigate to the correct area
                # and no synthetic page has caused a send/write request.
                await workspace.evaluate("()=>ChatFlowWorkspace.show('home')")
                assert await workspace.locator('.home-lead').count()==0
                assert await workspace.locator('.first-run-tip').count()==0
                for view in ('capture','archive','tasks','settings'):
                    await workspace.locator('header [data-view="home"]').click()
                    if view=='tasks':
                        await workspace.locator('#home-view [data-view="tasks"]').click()
                    elif view=='capture':
                        await workspace.locator('#home-view [data-view="capture"]').click()
                    else:
                        await workspace.locator('header [data-view="'+view+'"]').click()
                    assert await workspace.locator('#'+view+'-view').is_visible(), view
                await workspace.locator('header [data-view="home"]').click()
                await workspace.screenshot(path=str(OUT/'ui-click-home-light.png'),full_page=True)
                assert not errors, errors
                passed('home_archive_capture_tasks_and_settings_navigation_buttons_smoke')

            finally:
                (OUT / 'ui-click-audit-report.json').write_text(
                    json.dumps({'status':'pass' if not errors and len(results)==9 else 'fail',
                                'passed':results,'errors':errors},ensure_ascii=False,indent=2),
                    encoding='utf-8')
                await context.close()

if __name__ == '__main__':
    asyncio.run(main())
