// Development visual checks only. Chrome service responses are synthetic;
// production HTML/CSS/JS and IndexedDB run unchanged. This is NOT MV3 acceptance.
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
const require=createRequire(import.meta.url)
const {chromium}=process.env.PROTOTYPE_NODE_MODULES?require(path.join(process.env.PROTOTYPE_NODE_MODULES,'playwright-core')):require('playwright-core')
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(root,'../../..'),out=path.join(root,'screenshots')
await mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'})})
const context=await browser.newContext({viewport:{width:1100,height:1000}})
const errors=[],checks=[]
const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)))
async function shot(name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true})}
try{
 for(const dark of [false,true])for(const [screen,width] of [['capture',1100],['saved',1100],['task',390],['returned',390],['backup',390],['home',320]]){
  await page.setViewportSize({width,height:1000});await page.goto(pathToFileURL(path.join(root,'index.html')).href+'?screen='+screen+'&dark='+(dark?'1':'0'));await page.waitForTimeout(100);await shot('prototype-'+screen+'-'+(dark?'dark':'light')+'-'+width)
 }
 await page.addInitScript(()=>{
  const source={id:1,title:'春季活动方案',url:'https://chatgpt.com/c/synthetic_ui_source_20261103'}
  const prefs={cfPreferences:{context:false,experiments:true,live:false,diagnostics:false,passages:false,tools:true}}
  function response(m){switch(m.type){case'tl:sources':return[source];case'tl:sessions':return[];case'tl:taskSource':return{source:{origin:'https://chatgpt.com',conversationId:'synthetic_ui_source_20261103',url:source.url,title:source.title},selection:''};case'FF_STATUS':return{enabled:true};case'FF_LIST':return[];default:throw Error('Visual fixture does not implement '+m.type)}}
  globalThis.chrome={runtime:{sendMessage(m,cb){let r;try{r={ok:true,data:response(m)}}catch(e){r={ok:false,code:e.message}}if(cb){queueMicrotask(()=>cb(r));return}return Promise.resolve(r)},getURL:p=>new URL('../'+p,location.href).href,getManifest:()=>({optional_host_permissions:[]})},storage:{local:{get:async()=>prefs,set:async data=>Object.assign(prefs,data)}},downloads:{onChanged:{addListener(){},removeListener(){}},search:async()=>[]}}
 })
 await page.goto(pathToFileURL(path.join(repo,'workspace/index.html')).href)
 await page.waitForFunction(()=>globalThis.ChatFlowTaskUI&&globalThis.TLStore)
 await page.evaluate(async()=>{
  const source='https://chatgpt.com/c/synthetic_ui_source_20261103',mapping={}
  for(let i=0;i<24;i++)mapping['n'+i]={parent:i?'n'+(i-1):null,children:i<23?['n'+(i+1)]:[],message:{id:'m'+i,author:{role:i%2?'assistant':'user'},content:{content_type:'text',parts:['合成活动方案消息 '+i]},metadata:{}}}
  const snapshot=TLCore.normalizeConversation({conversation_id:'synthetic_ui_source_20261103',title:'春季活动方案',current_node:'n23',mapping},source)
  await TLStore.snapshot('visual-fixture',snapshot);await TLStore.finishCapture('visual-fixture')
 })
 await page.reload();await page.waitForFunction(()=>globalThis.ChatFlowTaskUI&&globalThis.TLStore)
 for(const dark of [false,true]){
  await page.emulateMedia({colorScheme:dark?'dark':'light'})
  for(const width of [1100,390,320]){
   await page.setViewportSize({width,height:1000})
   for(const view of ['home','capture','tasks','settings']){
    await page.evaluate(v=>ChatFlowWorkspace.show(v),view);await page.waitForTimeout(view==='capture'?3100:150)
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)
    checks.push({view,theme:dark?'dark':'light',width,overflow})
    await shot('production-'+view+'-'+(dark?'dark':'light')+'-'+width)
   }
  }
 }
 await page.evaluate(async()=>{const c=await TLStore.get('captures','visual-fixture');await TLStore.set('captures',{...c,state:'error',lastError:'SOURCE_CHANGED'})})
 await page.reload();await page.waitForFunction(()=>globalThis.ChatFlowTaskUI&&globalThis.TLStore)
 await page.setViewportSize({width:390,height:1000});await page.evaluate(()=>ChatFlowWorkspace.show('capture'))
 await page.waitForFunction(()=>document.querySelector('#capture-heading').textContent==='保存未完成')
 const failedCapture={test:'failed_capture_retains_old_snapshot_retry_primary',retry:await page.locator('#capture').textContent(),primary:await page.locator('#capture').evaluate(e=>e.classList.contains('primary')),continueHidden:await page.locator('#continue').isHidden()};checks.push(failedCapture)
 if(failedCapture.retry!=='重试保存'||!failedCapture.primary||!failedCapture.continueHidden)throw Error('Failed capture offers an unavailable continuation')
 await shot('production-capture-failed-dark-390')
 await page.evaluate(async()=>{const c=await TLStore.get('captures','visual-fixture');await TLStore.set('captures',{...c,state:'ready',lastError:null})});await page.reload();await page.waitForFunction(()=>globalThis.ChatFlowTaskUI&&globalThis.TLStore)
 await page.evaluate(()=>ChatFlowWorkspace.show('tasks'));await page.waitForTimeout(100)
 await page.locator('#task-source').selectOption('1');await page.locator('#task-text').fill('任务'.repeat(10001))
 checks.push({test:'task_text_retains_20002_utf16_units',value:await page.locator('#task-text').inputValue().then(s=>s.length),blocked:await page.locator('#task-create').isDisabled(),notice:await page.locator('#task-text-count').textContent()})
 await shot('production-task-over-limit')
 await page.locator('#task-text').fill('核对活动预算的计算公式，列出需要修改的地方。');await page.locator('#task-create').click();await page.locator('#task-envelope-box').waitFor({state:'visible'})
 await page.locator('#task-mode-return').click();const task=await page.evaluate(async()=>(await TLTaskStore.list())[0]);await page.locator('#task-result-text').fill('['+task.code+']\n检查完成：预算公式一致；建议补充费用假设。');await page.waitForFunction(()=>!document.querySelector('#task-save-result').disabled);await page.locator('#task-save-result').click();await page.locator('#task-return-origin').waitFor({state:'visible'});await shot('production-return-saved-dark-390')
 await page.goto(pathToFileURL(path.join(repo,'workspace/experiments.html')).href);await page.locator('#ff-local').waitFor({state:'visible'})
 for(const dark of [false,true])for(const width of [1100,390,320]){await page.emulateMedia({colorScheme:dark?'dark':'light'});await page.setViewportSize({width,height:1000});await shot('production-experiments-'+(dark?'dark':'light')+'-'+width);checks.push({view:'experiments',theme:dark?'dark':'light',width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)})}
 if(checks.some(x=>x.overflow))throw Error('Production page overflows at a checked viewport')
 if(errors.length)throw Error(errors.join('\n'))
}finally{await writeFile(path.join(out,'visual-checks.json'),JSON.stringify({scope:'synthetic_development_visual_only',checks,errors},null,2));await browser.close()}
console.log(JSON.stringify({checks:checks.length,errors:errors.length,out}))
