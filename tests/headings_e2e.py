"""Independent E increment. Installed MV3, synthetic pages only, no user account."""
import asyncio
import json
import os
import tempfile
import traceback
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from rollout_e2e import model, nav_html, poll
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'
CID='headings_264_normal_modern_fixture'
CID_PLAIN='headings_plain_264_fixture'
CID_LARGE='headings_large_264_fixture'
CID_DOM='headings_264_modern_api_unavailable'
URL='https://chatgpt.com/c/'+CID
async def main():
    OUT.mkdir(exist_ok=True)
    report={'scope':'installed_mv3_headings_synthetic','cases':[],'errors':[]}
    async with async_playwright() as pw:
        with tempfile.TemporaryDirectory(prefix='cf-headings-') as profile:
            ctx=await pw.chromium.launch_persistent_context(profile,channel='chromium',executable_path=os.environ.get('CHATFLOW_CHROMIUM'),headless=False,args=['--disable-extensions-except='+str(ROOT/'dist/edge'),'--load-extension='+str(ROOT/'dist/edge'),'--no-sandbox'])
            async def route(r):
                path=urlparse(r.request.url).path
                if path=='/api/auth/session':return await r.fulfill(json={'accessToken':'synthetic-only'})
                if path.startswith('/backend-api/conversation/'):
                    cid=path.split('/')[-1]
                    if cid==CID_DOM:return await r.fulfill(status=503,body='Synthetic API outage')
                    raw=model(cid)
                    if cid==CID_PLAIN:
                        for i in range(1,264,2):
                            raw['mapping']['n'+str(i)]['message']['content']['parts']=['Plain synthetic answer, no headings.']
                    elif cid==CID_LARGE:
                        for i in range(1,81,2):
                            raw['mapping']['n'+str(i)]['message']['content']['parts']=['## Large section '+str(i)+'\n'+'Z'*230000]
                    return await r.fulfill(json=raw)
                if path.startswith('/c/'):
                    fixture=nav_html(path.split('/')[-1]).replace('sp.append(a);',"if(window.fixtureHeadingEdit&&i===1)body.querySelector('h3').textContent='edited';sp.append(a);")
                    return await r.fulfill(content_type='text/html',body=fixture)
                return await r.fulfill(status=404,body='fixture only')
            await ctx.route('https://chatgpt.com/**',route)
            try:
                worker=ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
                page=await ctx.new_page();await page.goto(URL)
                w=await ctx.new_page();await w.goto('chrome-extension://'+worker.url.split('/')[2]+'/workspace/index.html')
                tab=await w.evaluate("async u=>(await chrome.runtime.sendMessage({type:'tl:sources'})).data.find(t=>t.url===u)",URL)
                result=await w.evaluate("async x=>chrome.runtime.sendMessage({type:'tl:openTools',tabId:x.id,expectedUrl:x.url})",tab)
                assert result['ok'],result
                tools=page.locator('#chatflow-page-tools')
                await poll(page,"()=>document.querySelector('#chatflow-page-tools')?.shadowRoot.textContent.includes('264 \u6761')")
                await tools.locator('input[type=search]').fill('Question number 0')
                menu=tools.locator('.cf-headings').first
                assert '提纲' in await menu.locator('summary').inner_text()
                assert await menu.locator('summary').inner_text()!='回答章节'
                await menu.locator('summary').click()
                await menu.locator('.cf-read-headings').click()
                await poll(page,"()=>document.querySelector('#chatflow-page-tools').shadowRoot.querySelectorAll('.cf-heading').length===4")
                assert await menu.locator('.cf-heading').all_text_contents()==['Section','Duplicate','Duplicate','Deep']
                assert await menu.locator('.cf-heading').last.get_attribute('data-level')=='6'
                await menu.locator('.cf-heading').nth(2).click()
                await poll(page,"()=>document.querySelector('#chatflow-page-tools').shadowRoot.querySelector('[role=status]').textContent==='\u5df2\u5b9a\u4f4d\u5230\u56de\u7b54\u7ae0\u8282\u3002'")
                report['cases'].append({'name':'exact_message_duplicate_heading_and_level6','result':'pass'})
                await page.evaluate("document.querySelector('#thread').scrollTop=24000")
                await page.wait_for_timeout(150)
                await menu.locator('.cf-heading').nth(1).click()
                await poll(page,"()=>document.querySelector('#chatflow-page-tools').shadowRoot.querySelector('[role=status]').textContent==='\u5df2\u5b9a\u4f4d\u5230\u56de\u7b54\u7ae0\u8282\u3002'")
                report['cases'].append({'name':'heading_restores_virtualized_parent_by_identity','result':'pass'})
                await page.evaluate("window.fixtureHeadingEdit=true;render()")
                await menu.locator('.cf-heading').nth(2).click()
                await poll(page,"()=>document.querySelector('#chatflow-page-tools').shadowRoot.querySelector('[role=status]').textContent.includes('\u7ae0\u8282\u5df2\u53d8\u5316')")
                report['cases'].append({'name':'changed_message_cannot_reuse_stale_heading_descriptor','result':'pass'})
                # An ordinary answer with no actual Markdown headings must not
                # create rows named "回答章节" merely because it has a response.
                plain=await ctx.new_page();await plain.goto('https://chatgpt.com/c/'+CID_PLAIN)
                plain_tab=await w.evaluate("async u=>(await chrome.runtime.sendMessage({type:'tl:sources'})).data.find(x=>x.url===u)",plain.url)
                assert (await w.evaluate("async t=>chrome.runtime.sendMessage({type:'tl:openTools',tabId:t.id,expectedUrl:t.url})",plain_tab))['ok']
                plain_tools=plain.locator('#chatflow-page-tools')
                await poll(plain,"()=>document.querySelector('#chatflow-page-tools')?.shadowRoot.textContent.includes('264 条')")
                plain_query=plain_tools.locator('input[type=search]')
                question_count=await plain_tools.locator('.row').count()
                assert question_count>1
                await plain_query.fill('Question number 0')
                assert await plain_tools.locator('.cf-headings').count()==0
                assert await plain_tools.locator('.row').count()==1
                # IME Escape is not a request to clear or dismiss navigation.
                for ime in ({'isComposing':True},{'keyCode':229}):
                    await plain_query.evaluate("(input,ime)=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,composed:true,cancelable:true,...ime}))",ime)
                    assert await plain_query.input_value()=='Question number 0'
                    assert await plain_tools.count()==1
                # Escape from another panel control restores the questions and
                # focuses search; only the next Escape closes the floating panel.
                await plain_tools.get_by_role('button',name='下一条',exact=True).press('Escape')
                assert await plain_query.input_value()==''
                assert await plain_tools.locator('.row').count()==question_count
                assert await plain_query.evaluate("input=>input.getRootNode().activeElement===input")
                await plain_query.press('Escape')
                await plain_tools.wait_for(state='detached')
                report['cases'].append({'name':'navigation_escape_clears_search_then_closes_and_ignores_ime','result':'pass'})
                await plain.close()
                report['cases'].append({'name':'no_generic_chapter_buttons_without_real_headings','result':'pass'})
                # Page-only fallback still contains real rendered H2/H3/H6,
                # despite innerText lacking Markdown '#' syntax. These are
                # observed DOM headings, not evidence of complete history.
                observed=await ctx.new_page()
                await observed.goto('https://chatgpt.com/c/'+CID_DOM)
                observed_tab=await w.evaluate("async u=>(await chrome.runtime.sendMessage({type:'tl:sources'})).data.find(x=>x.url===u)",observed.url)
                assert (await w.evaluate("async t=>chrome.runtime.sendMessage({type:'tl:openTools',tabId:t.id,expectedUrl:t.url})",observed_tab))['ok']
                await poll(observed,"()=>{const r=document.querySelector('#chatflow-page-tools')?.shadowRoot;return r&&r.textContent.includes('仅已加载消息')&&r.querySelector('.cf-retry')?.hidden===false;}")
                observed_tools=observed.locator('#chatflow-page-tools')
                await observed_tools.locator('input[type=search]').fill('Question number 260')
                observed_outline=observed_tools.locator('.cf-headings').first
                await observed_outline.locator('summary').wait_for(state='visible')
                assert 'Section' in await observed_outline.locator('summary').inner_text()
                await observed_outline.locator('summary').click()
                # details.toggle fires asynchronously after the summary click;
                # wait for the rendered outline instead of racing the callback.
                await poll(observed,"()=>{const root=document.querySelector('#chatflow-page-tools')?.shadowRoot;return root&&root.querySelectorAll('.cf-heading,.cf-outline').length===4;}")
                names=await observed_outline.locator('.cf-heading,.cf-outline').all_text_contents()
                assert names==['Section','Duplicate','Duplicate','Deep'],names
                assert await observed.evaluate("()=>document.querySelector('#chatflow-page-tools')?.shadowRoot?.textContent.includes('仅已加载')")
                report['cases'].append({'name':'api_outage_shows_rendered_dom_headings_without_full_history_claim','result':'pass'})
                await observed.close()
                # Previously the 8 MiB page-tool cap dropped full-branch retrieval
                # for large conversations. Check an API response above 9 MiB.
                large=await ctx.new_page();await large.goto('https://chatgpt.com/c/'+CID_LARGE)
                large_tab=await w.evaluate("async u=>(await chrome.runtime.sendMessage({type:'tl:sources'})).data.find(x=>x.url===u)",large.url)
                assert (await w.evaluate("async t=>chrome.runtime.sendMessage({type:'tl:openTools',tabId:t.id,expectedUrl:t.url})",large_tab))['ok']
                await poll(large,"()=>{const root=document.querySelector('#chatflow-page-tools')?.shadowRoot;return !!root&&root.querySelector('p.hint')?.textContent.includes('264 条')&&root.querySelector('.cf-retry')?.hidden===true;}",seconds=40)
                assert not await large.evaluate("()=>document.querySelector('#chatflow-page-tools').shadowRoot.textContent.includes('仅已加载')")
                report['cases'].append({'name':'large_full_branch_read_above_previous_eight_megabyte_cap','result':'pass'})
                await large.close()
                await page.set_viewport_size({'width':390,'height':800})
                await page.screenshot(path=str(OUT/'headings-light-390.png'),full_page=True)
                await page.emulate_media(color_scheme='dark')
                await page.screenshot(path=str(OUT/'headings-dark-390.png'),full_page=True)
                assert await tools.evaluate("host=>{const p=host.shadowRoot.querySelector('.panel');return p.scrollWidth<=p.clientWidth+2;}")
                report['cases'].append({'name':'heading_panel_narrow_layout','result':'pass'})
                print(json.dumps(report),flush=True)
            except Exception as error:
                report['errors'].append({'error':str(error),'trace':traceback.format_exc()})
                if 'page' in locals():
                    await page.screenshot(path=str(OUT/'headings-failure.png'),full_page=True)
                raise
            finally:
                (OUT/'headings-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
                await ctx.close()
if __name__=='__main__':asyncio.run(main())
