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
                if path.startswith('/backend-api/conversation/'):return await r.fulfill(json=model(CID))
                if path.startswith('/c/'):
                    fixture=nav_html(CID).replace('sp.append(a);',"if(window.fixtureHeadingEdit&&i===1)body.querySelector('h3').textContent='edited';sp.append(a);")
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
