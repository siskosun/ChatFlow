"""Production selection action in a real Chromium DOM; runtime replies are synthetic."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = "https://chatgpt.com/c/selection_alpha_1234"
HTML = """<!doctype html><meta charset="utf-8"><style>
body{margin:0;font:16px/1.6 system-ui}main{margin:160px 24px 0;max-width:720px}
p{margin:0;line-height:26px}button{font:14px system-ui}
</style><main data-chatgpt-selection-conversation-id="selection_alpha_1234">
<article data-testid="conversation-turn-0" data-message-id="selection-m1">
<p id="text">Synthetic selection alpha. Another task beta. Third task gamma.</p>
</article></main>"""

async def select(page, start=0, end=25):
    await page.evaluate("""([start,end]) => {
      const node=document.querySelector('#text').firstChild,range=document.createRange();
      range.setStart(node,start);range.setEnd(node,end);
      const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    }""", [start, end])
    await page.wait_for_timeout(150)
    await page.wait_for_function("""() => {
      const host=document.querySelector('#chatflow-selected-action');
      return host && !host.hidden && !host.shadowRoot.querySelector('button').disabled;
    }""")

async def state(page):
    return await page.evaluate("""() => {
      const host=document.querySelector('#chatflow-selected-action');
      if(!host)return {hidden:true,label:null};
      const button=host.shadowRoot.querySelector('button'),r=host.getBoundingClientRect();
      return {hidden:host.hidden,label:button.textContent,disabled:button.disabled,
        left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    }""")

async def click(page):
    await page.evaluate("""() => document.querySelector('#chatflow-selected-action')
      .shadowRoot.querySelector('button').click()""")

async def main():
    report = {}
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width":900,"height":620})
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.route("https://chatgpt.com/**",
                         lambda route: route.fulfill(content_type="text/html",body=HTML))
        await page.goto(URL)
        await page.evaluate("""() => {
          window.selectionRequests=[];
          window.nextSelectionReply={ok:false,code:'SYNTHETIC_OPEN_FAILURE'};
          window.chrome={runtime:{sendMessage(message){
            selectionRequests.push(message);
            if(window.holdSelectionReply)return new Promise(resolve=>window.finishSelectionReply=resolve);
            return Promise.resolve(window.nextSelectionReply);
          }}};
        }""")
        for name in ["tl-core.js","tl-page-scope.js","tl-selection-action.js"]:
            await page.add_script_tag(path=str(ROOT/"src"/name))

        await select(page)
        initial = await state(page)
        assert initial["label"] == "ChatFlow选文", initial
        design = await page.evaluate("""() => {
          const button=document.querySelector('#chatflow-selected-action').shadowRoot.querySelector('button');
          const style=getComputedStyle(button);
          return {height:button.getBoundingClientRect().height,color:style.backgroundColor,border:style.borderTopWidth};
        }""")
        assert design["height"] <= 38 and design["color"] == "rgb(255, 255, 255)", design
        report["native_scale_secondary_action"] = design
        # A second isolated injection has a new global flag but the same DOM.
        await page.evaluate("() => {delete globalThis.ChatFlowSelectionActionInstalled;}")
        await page.add_script_tag(path=str(ROOT/"src"/"tl-selection-action.js"))
        await select(page)
        assert await page.evaluate("() => document.querySelectorAll('#chatflow-selected-action').length") == 1
        report["duplicate_injection_keeps_one_dom_action"] = True
        # Delay the native portal beyond both old 120ms / 420ms placement attempts.
        await page.evaluate("""() => setTimeout(() => {
          const control=document.createElement('button');control.id='native-ask';
          control.textContent='Ask ChatGPT';
          control.style.cssText='position:fixed;left:300px;top:120px;width:110px;height:32px';
          document.body.append(control);
        }, 750)""")
        await page.wait_for_function("""() => {
          const native=document.querySelector('#native-ask');
          const host=document.querySelector('#chatflow-selected-action');
          if(!native || !host || host.hidden)return false;
          return Math.abs(host.getBoundingClientRect().left-native.getBoundingClientRect().right-6)<2;
        }""", timeout=4000)
        report["late_native_toolbar_followed"] = True

        await click(page)
        await page.wait_for_function("""() => document.querySelector('#chatflow-selected-action')
          .shadowRoot.querySelector('button').textContent==='打开失败，点击重试'""")
        # Cross the old 2.5-second automatic error erasure.
        await page.wait_for_timeout(2800)
        assert (await state(page))["label"] == "打开失败，点击重试"
        report["failure_stays_visible"] = True

        await page.evaluate("""() => {
          const host=document.querySelector('#chatflow-selected-action');
          host.shadowRoot.querySelector('button').style.fontSize='24px';
          const native=document.querySelector('#native-ask');
          native.style.left='210px';native.style.width='90px';
        }""")
        await page.set_viewport_size({"width":320,"height":480})
        await page.wait_for_function("""() => {
          const host=document.querySelector('#chatflow-selected-action'),r=host.getBoundingClientRect();
          return !host.hidden && r.left>=9.5 && r.right<=310.5 && r.top>=9.5 && r.bottom<=470.5;
        }""")
        report["actual_dimensions_with_large_text_and_resize"] = await state(page)

        await page.keyboard.press("Escape")
        await page.evaluate("""() => {
          document.dispatchEvent(new Event('selectionchange'));
          window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('scroll'));
        }""")
        await page.wait_for_timeout(350)
        assert (await state(page))["hidden"]
        report["escape_prevents_same_selection_revival"] = True

        await select(page, 27, 44)
        await page.evaluate("() => {window.holdSelectionReply=true;}")
        await click(page)
        await page.wait_for_function("() => typeof window.finishSelectionReply==='function'")
        await select(page, 45, 60)
        await page.evaluate("() => window.finishSelectionReply({ok:false,code:'OLD_FAILURE'})")
        await page.wait_for_timeout(50)
        current = await state(page)
        assert not current["hidden"] and current["label"] == "ChatFlow选文"
        report["old_async_result_ignores_new_selection"] = True

        before = await page.evaluate("() => selectionRequests.length")
        # The stale click happens synchronously, before the selectionchange debounce.
        await page.evaluate("""() => {
          const node=document.querySelector('#text').firstChild,range=document.createRange();
          range.setStart(node,0);range.setEnd(node,12);
          getSelection().removeAllRanges();getSelection().addRange(range);
          document.querySelector('#chatflow-selected-action').shadowRoot.querySelector('button').click();
        }""")
        assert await page.evaluate("() => selectionRequests.length") == before
        report["stale_range_click_not_dispatched"] = True

        await page.evaluate("() => {window.holdSelectionReply=false;window.nextSelectionReply={ok:true};}")
        await select(page, 10, 25)
        await click(page)
        await page.wait_for_function("() => document.querySelector('#chatflow-selected-action').hidden")
        request = await page.evaluate("() => selectionRequests.at(-1)")
        assert request["text"] == "selection alpha"
        assert request["url"] == URL and isinstance(request["generation"], int)
        report["exact_current_selection_and_generation_dispatched"] = True

        # A document route change cannot reuse the previous button's payload.
        await select(page, 27, 44)
        before = await page.evaluate("() => selectionRequests.length")
        await page.evaluate("""() => {
          const button=document.querySelector('#chatflow-selected-action').shadowRoot.querySelector('button');
          history.pushState({},'', '/c/selection_beta_1234');
          button.click();
        }""")
        assert await page.evaluate("() => selectionRequests.length") == before
        report["route_change_blocks_stale_click"] = True
        assert not errors, errors
        report["page_errors"] = errors
        await browser.close()

    output=ROOT/"test-results"
    output.mkdir(exist_ok=True)
    (output/"selection-action-report.json").write_text(
        json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
