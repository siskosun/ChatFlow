"""Production scope in a real DOM. Synthetic data only; no authenticated service."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = await browser.new_page()
        await page.route('https://chatgpt.com/**', lambda r: r.fulfill(content_type='text/html', body='''<main data-chatgpt-selection-conversation-id="source_alpha_1234"><article data-message-id="m1"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></semantics></math></article></main>'''))
        await page.goto('https://chatgpt.com/c/source_alpha_1234')
        await page.add_script_tag(path=str(ROOT / 'src/tl-core.js'))
        await page.add_script_tag(path=str(ROOT / 'src/tl-page-scope.js'))
        results = await page.evaluate('''() => {
          const scope=TLPageScope.current(), annotation=document.querySelector('annotation');
          if(scope.status!=='confirmed'||!TLPageScope.contains(scope,annotation))throw Error('VISIBLE_FORMULA_METADATA_REJECTED');
          const lease=TLPageScope.freeze();
          const root=document.querySelector('main');
          root.setAttribute('data-chatgpt-selection-conversation-id','source_beta_1234');
          root.setAttribute('data-chatgpt-selection-conversation-id','source_alpha_1234');
          if(TLPageScope.unchanged(lease))throw Error('ABA_REVIVED_LEASE');
          const stable=TLPageScope.freeze(), copy=root.cloneNode(true);root.replaceWith(copy);
          if(TLPageScope.unchanged(stable))throw Error('REPLACEMENT_REVIVED_LEASE');
          copy.hidden=true;
          if(TLPageScope.contains(TLPageScope.current(),copy.querySelector('annotation')))throw Error('HIDDEN_FORMULA_ACCEPTED');
          return {formula:true, attributeABA:true, replacedRoot:true, hiddenFormula:true};
        }''')
        print(json.dumps(results))
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
