"""Installed-extension visual/contrast checks, synthetic content only.
Computed contrast and screenshots do not certify screen-reader or human usability.
"""
import asyncio
import json
import os
import re
import tempfile
import traceback
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
CHECK=r'''()=>{
 const color=s=>{const a=s.match(/[\d.]+/g)?.map(Number);return a&&a.length>=3?[a[0],a[1],a[2],a[3]??1]:[0,0,0,0];};
 const blend=(top,bottom)=>top.slice(0,3).map((v,i)=>v*top[3]+bottom[i]*(1-top[3]));
 const background=e=>{const chain=[];while(e){chain.unshift(e);e=e.parentElement;}let out=[255,255,255];for(const x of chain)out=blend(color(getComputedStyle(x).backgroundColor),out);return out;};
 const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const failures=[],checked=[];
 for(const e of document.querySelectorAll('button,a,label,p,span,small,strong,h1,h2,h3,summary,pre,input,textarea,select')){
  const st=getComputedStyle(e),rect=e.getBoundingClientRect();if(!rect.width||!rect.height||st.visibility!=='visible'||e.closest('[hidden],:disabled')||Number(st.opacity)<1)continue;
  const direct=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim(),text=direct||(e.matches('input,textarea,select')?e.value:'');if(!text)continue;
  const bg=background(e),fg=blend(color(st.color),bg),l1=luminance(fg),l2=luminance(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),large=parseFloat(st.fontSize)>=24||(parseFloat(st.fontSize)>=18.66&&parseInt(st.fontWeight)>=700),minimum=large?3:4.5;
  const record={element:e.id||e.tagName,text:text.slice(0,55),ratio:+ratio.toFixed(2),minimum,color:st.color,background:bg};checked.push(record);if(ratio+.01<minimum)failures.push(record);
 }
 return{width:innerWidth,documentWidth:document.documentElement.scrollWidth,checked:checked.length,failures};
}'''

async def main():
 report={'scope':'installed_mv3_synthetic_visual_and_computed_contrast_not_human_accessibility','status':'fail','cases':[],'errors':[]}
 async with async_playwright() as pw:
  with tempfile.TemporaryDirectory(prefix='chatflow-visual-') as profile:
   context=await pw.chromium.launch_persistent_context(profile,channel='chromium',executable_path=os.environ.get('CHATFLOW_CHROMIUM'),headless=False,args=['--disable-extensions-except='+str(ROOT/'dist/edge'),'--load-extension='+str(ROOT/'dist/edge'),'--no-sandbox'])
   try:
    await context.route(re.compile(r'^https?://'),lambda r:r.abort())
    worker=context.service_workers[0] if context.service_workers else await context.wait_for_event('serviceworker')
    base='chrome-extension://'+worker.url.split('/')[2]+'/workspace/'
    page=await context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)));await page.goto(base+'index.html');await page.wait_for_function('!!globalThis.ChatFlowWorkspace&&!!globalThis.ChatFlowTaskUI')
    await page.evaluate("""async()=>{await chrome.storage.local.set({cfPreferences:{context:true,live:true,diagnostics:true,passages:true,tools:true}});const raw={conversation_id:'visual_fixture_20261103',title:'合成项目方案',current_node:'a',mapping:{a:{parent:null,children:[],message:{id:'m',author:{role:'assistant'},content:{parts:['仅用于界面回归的合成材料。']}}}}};await TLStore.snapshot('visual-capture',TLCore.normalizeConversation(raw,'https://chatgpt.com/c/visual_fixture_20261103'));await TLStore.finishCapture('visual-capture');}""")
    await page.reload();await page.wait_for_function('!!globalThis.ChatFlowWorkspace&&document.body.classList.contains("feature-context")')
    for scheme in ['light','dark']:
     await page.emulate_media(color_scheme=scheme)
     for width in [320,360,1440]:
      await page.set_viewport_size({'width':width,'height':950})
      for view in ['home','capture','archive','handoff','tasks','settings']:
       await page.evaluate('v=>ChatFlowWorkspace.show(v)',view);await page.wait_for_timeout(160)
       if view=='archive':await page.locator('.archive-button').first.click();await page.locator('#detail h2').wait_for()
       if view=='tasks':await page.locator('#task-mode-return').click()
       value=await page.evaluate(CHECK);value.update({'view':view,'scheme':scheme,'result':'fail' if value['documentWidth']>width+2 or value['failures'] else 'pass'})
       if (width==360 and scheme=='dark') or (width==1440 and scheme=='light'):await page.screenshot(path=str(OUT/f'ui-{view}-{scheme}-{width}.png'),full_page=True)
       report['cases'].append(value)
    experiment=await context.new_page();experiment.on('pageerror',lambda e:report['errors'].append(str(e)));await experiment.goto(base+'experiments.html');await experiment.wait_for_function("()=>!document.querySelector('#ff-notice').textContent.includes('正在检查')&&!document.querySelector('#ff-enable').disabled");await experiment.locator('#ff-enable').check();await experiment.wait_for_function("()=>document.querySelector('#ff-enable').checked&&!document.querySelector('#ff-enable').disabled&&!document.querySelector('#ff-local').hidden");await experiment.locator('#ff-p').fill('合成比较任务')
    for scheme in ['light','dark']:
     await experiment.emulate_media(color_scheme=scheme)
     for width in [320,360,1440]:
      await experiment.set_viewport_size({'width':width,'height':950});value=await experiment.evaluate(CHECK);value.update({'view':'experiments','scheme':scheme,'result':'fail' if value['documentWidth']>width+2 or value['failures'] else 'pass'});report['cases'].append(value)
      if width in [360,1440]:await experiment.screenshot(path=str(OUT/f'ui-experiments-{scheme}-{width}.png'),full_page=True)
    failed=[case for case in report['cases'] if case['result']!='pass'];assert not failed,failed
    assert not report['errors'],report['errors'];report['status']='pass';print('PASS visual_and_contrast',len(report['cases']),flush=True)
   except Exception as e:report['error']={'message':str(e),'traceback':traceback.format_exc()};raise
   finally:
    (OUT/'ui-visual-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');await context.close()
if __name__=='__main__':asyncio.run(main())
