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
        await navigation_cases(page)
        await browser.close()

async def navigation_cases(page):
    await page.add_script_tag(path=str(ROOT / 'src/tl-navigation.js'))
    records = []
    for count in (264, 1000):
        for reverse in (False, True):
            for target in (0, 19, count // 2, count - 1):
                result = await page.evaluate("""async ({count, reverse, target}) => {
                  const root=document.createElement('main');
                  root.className='thread-scroll-container';
                  root.setAttribute('data-chatgpt-selection-conversation-id','source_alpha_1234');
                  root.style.cssText='height:420px;overflow:auto;position:relative;display:flex;flex-direction:'+(reverse?'column-reverse':'column')+';overflow-anchor:auto;scroll-behavior:smooth';
                  const spacer=document.createElement('div');
                  spacer.style.cssText='position:relative;flex:none;height:'+count*100+'px';
                  root.append(spacer);document.body.replaceChildren(root);
                  const render=()=>{
                    const max=root.scrollHeight-root.clientHeight;
                    const logical=reverse?root.scrollTop+max:root.scrollTop;
                    const first=Math.max(0,Math.floor(logical/100)-2);
                    spacer.replaceChildren();
                    for(let i=first;i<Math.min(count,first+12);i++){
                      const el=document.createElement('article');el.dataset.messageId='m'+i;
                      el.dataset.messageAuthorRole=i%2?'assistant':'user';
                      el.style.cssText='position:absolute;top:'+i*100+'px;height:95px';
                      el.textContent='Repeated paragraph';spacer.append(el);
                    }
                  };
                  root.addEventListener('scroll',render);
                  root.scrollTop=reverse?0:root.scrollHeight;render();
                  const lease=TLPageScope.freeze();
                  const r=await TLNavigation.run({targetIndex:target,
                    assertCurrent:()=>TLPageScope.assert(lease),scroller:()=>root,
                    resolve:()=>{const el=root.querySelector('[data-message-id="m'+target+'"]');return el?{el,confidence:'verified_message_id'}:null;},
                    sample:()=>({rows:[...root.querySelectorAll('[data-message-id]')].map(el=>({el,index:Number(el.dataset.messageId.slice(1))}))})
                  });
                  if(r.status!=='located')throw Error(JSON.stringify({count,reverse,target,result:r.status,steps:r.steps}));
                  const rectangle=r.element.getBoundingClientRect(),bounds=root.getBoundingClientRect();
                  if(rectangle.bottom<=bounds.top||rectangle.top>=bounds.bottom)throw Error('WRONG_VISUAL_LOCATION');
                  if(root.style.overflowAnchor!=='auto'||root.style.scrollBehavior!=='smooth')throw Error('STYLES_NOT_RESTORED');
                  const {element,...metrics}=r;return {count,reverse,target,...metrics};
                }""", {'count': count, 'reverse': reverse, 'target': target})
                assert result['elapsedMs'] <= 12000, result
                assert result['steps'] <= 60, result
                records.append(result)
    assert len(records) == 16 and all(r['status'] == 'located' for r in records)
    out=ROOT/'test-results';out.mkdir(exist_ok=True)
    (out/'navigation-browser-report.json').write_text(json.dumps({
        'scope':'synthetic_real_chromium_not_authenticated',
        'positive_controls':len(records),'successes':len(records),'false_successes':0,
        'cases':records},indent=2),encoding='utf-8')
    print('NAVIGATION_POSITIVE_CONTROLS',len(records),flush=True)

if __name__ == '__main__':
    asyncio.run(main())
