/* Two primary user journeys. Everything below runs on the extension origin. MIT. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),T=TLTasks,S=TLTaskStore;
 const labels={missing:'未找到任务标记，请人工选择来源。',unknown:'本地没有这个任务。可恢复任务备份，或人工指定来源。',invalid:'任务标记格式不正确。',conflict:'出现多个任务标记，不自动判断归属。'};
 const errors={TASK_SOURCE_CHANGED:'来源页面已改变，请重新选择对话。',TASK_NOT_FOUND:'任务已不在本地，请刷新列表。',TASK_IMPORT_CONFLICT:'备份与本地任务冲突，没有导入或覆盖任何记录。',TASK_MATCH_CONFLICT:'任务归属已变化，请重新确认。',TASK_BUNDLE_LIMIT:'备份超过当前支持的任务数量或容量。',TASK_LEGACY_BACKUP_LIMIT:'旧格式备份超过 4 MiB，未恢复任何内容。请用新版重新导出。',TASK_BACKUP_RECORD_LIMIT:'备份中有一条记录超过安全上限，未恢复任何内容。',TASK_BACKUP_INTEGRITY_INVALID:'备份校验失败，未恢复任何内容。',TASK_BACKUP_INCOMPLETE:'备份不完整，未恢复任何内容。',TASK_STORAGE_LIMIT:'任务数量已达上限，请先备份再整理旧任务。',TASK_RESULT_STORAGE_LIMIT:'结果数量已达上限，请先备份再整理旧任务。',TASK_TEXT_LIMIT:'任务需包含 1—20,000 个字符；输入内容已保留。',TASK_RESULT_LIMIT:'结果需包含 1—262,144 个字符；输入内容已保留。'};
 Object.assign(errors,{WORKSPACE_WINDOW_REQUIRED:'无法确认工作区所在窗口，请从当前窗口重新打开 ChatFlow。',EXTENSION_UNAVAILABLE:'扩展后台暂时无响应，请刷新工作区或重启扩展。',IDB_UPGRADE_BLOCKED_CLOSE_OTHER_WINDOWS:'本地存储升级被其他 ChatFlow 窗口阻挡，请关闭其他工作区后重试。',TASK_RESULT_CONFLICT:'检测到内容或归属冲突，未覆盖已有结果。请先备份并核对。',TASK_RESULT_INVALID:'已保存结果校验失败，无法继续回传。',TASK_RESULT_INTEGRITY_INVALID:'已保存结果校验失败，无法继续回传。',TASK_RESULT_METADATA_INVALID:'已保存结果校验失败，无法继续回传。',TASK_MARKER_MISMATCH:'已保存结果校验失败，无法继续回传。',TASK_RECORD_INVALID:'已保存任务校验失败，无法继续回传。',TASK_INTEGRITY_INVALID:'已保存任务校验失败，无法继续回传。',TASK_SOURCE_ID_MISMATCH:'任务来源校验失败，请重新选择对话。',TASK_SOURCE_URL_INVALID:'任务来源地址无效，请重新选择对话。',TASK_SOURCE_REQUIRED:'缺少任务来源，请重新选择对话。'});
 function n(tag,text,attrs={}){const e=document.createElement(tag);if(text!=null)e.textContent=text;for(const[k,v]of Object.entries(attrs)){if(k==='class')e.className=v;else e.setAttribute(k,v);}return e;}
 function button(text,id,fn,cls='quiet'){const e=n('button',text,{type:'button',class:cls,...(id?{id}:{})});if(fn)e.addEventListener('click',()=>safe(fn));return e;}
 function field(label,input){const l=n('label',label,{for:input.id});return[l,input];}
 // Identifiers are retained in backing records; users see readable labels.
 function readableTitle(raw,fallback='未命名对话',limit=90){
  const value=String(raw??'').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim();
  return value?[...value].slice(0,limit).join(''):fallback;
 }
 function displayLabels(rows,titleOf,kind){
  const names=rows.map(row=>readableTitle(titleOf(row))),counts=new Map(),positions=new Map();
  for(const title of names)counts.set(title,(counts.get(title)||0)+1);
  return names.map(title=>{
   if(counts.get(title)===1)return title;
   const number=(positions.get(title)||0)+1;positions.set(title,number);
   return title+' · '+kind+' '+number;
  });
 }
 const noticeTimers=new WeakMap();
 function say(text,error=false){
  const e=!$('tasks-view')?.hidden?$('task-status'):!$('settings-view')?.hidden?$('settings-status'):$('status');if(!e)return;
  clearTimeout(noticeTimers.get(e));const message=String(text||'');
  e.textContent=message;e.classList.toggle('error',!!error&&!!message);
  if(message&&error){const close=n('button','关闭提示',{type:'button',class:'status-dismiss','aria-label':'关闭当前错误提示'});close.addEventListener('click',()=>{e.textContent='';e.classList.remove('error');});e.append(close);}
  else if(message)noticeTimers.set(e,setTimeout(()=>{if(e.textContent===message)e.textContent='';},4500));
 }
 function taskError(e){const key=String(e?.message||e||'');if(Object.hasOwn(errors,key))return errors[key];if(/[\u3400-\u9fff]/.test(key)&&key.length<=200)return key;return '任务操作未完成，请重试；如持续失败，可在高级功能中查看诊断信息。';}
 async function safe(fn){try{return await fn();}catch(e){say(taskError(e),true);}}
 async function call(type,data={}){const r=await chrome.runtime.sendMessage({type,...data});if(!r?.ok)throw Error(r?.code||'EXTENSION_UNAVAILABLE');return r.data;}
 async function currentWorkspaceWindow(){
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});
  const tab=tabs.find(t=>t.active&&Number.isInteger(t.id)&&Number.isInteger(t.windowId));
  if(!tab)throw Error('WORKSPACE_WINDOW_REQUIRED');
  return{windowId:tab.windowId,activeTabId:tab.id};
 }
 const defaults={context:false,live:false,diagnostics:false,passages:false,tools:true};let prefs={...defaults},created=null,prepared=null,matchEpoch=0,createEpoch=0,creating=false,taskPageEpoch=0,taskCursor=null,choicesFresh=false,savedResultOpenEpoch=0;
 const main=document.querySelector('main');
 const home=n('section',null,{id:'home-view',class:'view'}),intro=n('div',null,{class:'home-intro'});
 intro.append(n('h1','把工作带到下一段对话'));
 intro.append(n('span','选择一个操作开始',{class:'eyebrow home-eyebrow'}));
 intro.append(n('p','保存已有聊天，或将任务交给其他助手后准确带回结果。你的原对话和草稿都不会被改动。',{class:'home-lead'}));
 const choices=n('div',null,{class:'flow-choices'});
 const journeys=[['capture','保存并接到新对话','保存聊天与文件，在新的 ChatGPT 对话里继续。'],['tasks','任务回传','复制任务给其他助手，完成后把结果放回正确的来源。']];
 for(const [index,[view,title,description]] of journeys.entries()){
  const b=n('button',null,{type:'button','data-view':view,class:'flow-choice'});
  const number=n('span',String(index+1).padStart(2,'0'),{class:'flow-number','aria-hidden':'true'});
  const content=n('span',null,{class:'flow-copy'});content.append(n('strong',title),n('span',description,{class:'muted'}));
  const arrow=n('span','›',{class:'flow-arrow','aria-hidden':'true'});
  b.append(number,content,arrow);choices.append(b);
 }
 const setup=n('section',null,{class:'first-run',id:'first-run-prereqs','aria-label':'开始前确认'});
 setup.append(n('p','使用前：请先在普通浏览器标签页登录 ChatGPT，并打开已有对话。',{class:'first-run-tip'}));
 const requirements=n('details',null,{class:'first-run-details'});requirements.append(n('summary','查看使用条件'));
 const prerequisites=n('ol');for(const item of ['使用 Chrome 116+ 或支持侧边栏的 Edge，且不是无痕窗口。','已在浏览器标签页登录 ChatGPT。','打开一段已有的 ChatGPT 对话；空白新聊天无法保存。'])prerequisites.append(n('li',item));requirements.append(prerequisites);setup.append(requirements);
 const openChat=n('a','打开 ChatGPT',{class:'chatgpt-link',href:'https://chatgpt.com/',target:'_blank',rel:'noopener noreferrer'});setup.append(openChat);
 home.append(intro,choices,setup,n('p','工程试用候选 · 资料保存在此浏览器 · 不会代你发送消息',{class:'home-footnote'}));main.insertBefore(home,$('capture-view'));
 const taskView=n('section',null,{id:'tasks-view',class:'view',hidden:''}),head=n('div',null,{class:'view-heading'});
 head.append(n('button','‹ 首页',{type:'button','data-view':'home',class:'back quiet'}),n('h1','任务回传'));
 const taskStatus=n('p',null,{id:'task-status',role:'status','aria-live':'polite'});
 const modes=n('div',null,{class:'mode-switch',role:'group','aria-label':'任务操作'});
 function invalidateSavedResultOpen(){savedResultOpenEpoch++;matchEpoch++;}
 function mode(value){invalidateSavedResultOpen();$('task-compose').hidden=value!=='compose';$('task-return').hidden=value!=='return';$('task-mode-compose').setAttribute('aria-pressed',String(value==='compose'));$('task-mode-return').setAttribute('aria-pressed',String(value==='return'));}
 modes.append(button('交出任务','task-mode-compose',()=>mode('compose')),button('回传结果','task-mode-return',()=>mode('return')));
 const compose=n('div',null,{id:'task-compose',class:'task-card'}),source=n('select',null,{id:'task-source'}),text=n('textarea',null,{id:'task-text',rows:5,'aria-describedby':'task-text-count',placeholder:'例如：检查这段 SQL 的连接条件。'}),sourceActions=n('div',null,{class:'actions source-actions'}),taskCount=n('p',null,{id:'task-text-count',class:'input-count',role:'status'});
 sourceActions.append(button('刷新对话','task-refresh-source',refreshSources),button('使用原对话中的选文','task-use-selection',async()=>{const v=await readSource();if(v.selectionTooLong)throw Error('选文超过20,000个字符，请缩短后再选；当前草稿已保留。');if(!v.selection)throw Error('请先在原对话的单条消息中选择文字。');if(text.value&&!confirm('替换当前任务草稿？'))return;text.value=v.selection;invalidateCreation();}));
 const prompt=n('textarea',null,{id:'task-envelope',rows:6,readonly:'','aria-label':'带标记的任务文本'}),promptBox=n('div',null,{id:'task-envelope-box',hidden:''}),promptDetails=n('details',null,{class:'advanced compact'}),promptState=n('p','任务已保存到浏览器',{class:'task-outcome',id:'task-copy-state'});promptDetails.append(n('summary','查看任务文本'),prompt);promptBox.append(promptState,n('p','将任务文本复制给你选择的外部助手；完成后回到这里粘贴答复。扩展不会替你发送。',{class:'hint'}),button('回传结果','task-next-return',()=>{mode('return');resultText.focus();},'primary full'),button('再次复制任务','task-copy-again',()=>copy(prompt.value,prompt)),promptDetails);
 const create=button('复制任务','task-create',async()=>{
  if(creating)return;if(!inputWithinLimit(text,taskCount,T.LIMITS.task))throw Error('TASK_TEXT_LIMIT');creating=true;create.disabled=true;const epoch=createEpoch;try{const capturedText=text.value,selectedTab=source.value,v=await readSource();if(createEpoch!==epoch||text.value!==capturedText||source.value!==selectedTab)throw Error('TASK_SOURCE_CHANGED');const saved=await S.create(v.source,capturedText);await refreshTasks();if(createEpoch!==epoch||text.value!==capturedText||source.value!==selectedTab)throw Error('TASK_SOURCE_CHANGED');created=saved;prompt.value=T.envelope(saved);promptBox.hidden=false;create.hidden=true;const copied=await copy(prompt.value,prompt);promptState.textContent=copied?'任务已复制':'任务已保存，请手动复制';}finally{creating=false;updateCreateState();}
 },'primary full');
 compose.append(n('p','本功能只复制带来源标记的文本，不连接外部助手，也不自动发送。',{class:'task-explainer'}),...field('来源对话',source),sourceActions,...field('要交给外部助手的任务',text),taskCount,create,promptBox);
 const ret=n('div',null,{id:'task-return',class:'task-card',hidden:''}),resultText=n('textarea',null,{id:'task-result-text',rows:7,'aria-describedby':'task-result-count',placeholder:'粘贴外部助手的回复，包括任务标记。'}),preview=n('div',null,{id:'task-match',class:'match-preview',role:'status'}),resultCount=n('p',null,{id:'task-result-count',class:'input-count',role:'status'});
 const manual=n('div',null,{id:'task-manual',hidden:''}),manualSource=n('select',null,{id:'task-manual-source'}),confirmBox=n('input',null,{id:'task-manual-confirm',type:'checkbox'}),confirmLabel=n('label',null,{class:'check'});confirmLabel.append(confirmBox,n('span','我已核对，关联到所选任务'));
 manual.append(...field('人工选择原任务',manualSource),confirmLabel);
 const save=button('保存结果','task-save-result',async()=>{
  if(!inputWithinLimit(resultText,resultCount,T.LIMITS.result))throw Error('TASK_RESULT_LIMIT');
  const value=resultText.value,selected=manualSource.value,confirmed=confirmBox.checked,epoch=matchEpoch,m=await S.match(value);
  if(value!==resultText.value||selected!==manualSource.value||confirmed!==confirmBox.checked||epoch!==matchEpoch)throw Error('TASK_MATCH_CONFLICT');
  const userAssigned=m.state!=='matched';
  if(userAssigned&&!confirmBox.checked)throw Error('请先确认人工选择的来源。');
  const id=userAssigned?manualSource.value:m.task.id;if(!id)throw Error('TASK_NOT_FOUND');
  const out=await S.saveResult(id,value,userAssigned);prepared={...out.result};
  if(resultText.value!==value||epoch!==matchEpoch||selected!==manualSource.value||confirmed!==confirmBox.checked){prepared=null;throw Error('内容已改变，原结果已保存；请重新确认。');}
  save.hidden=true;returnAction.hidden=false;await refreshTasks();say(out.duplicate?'这份结果已保存，没有重复新建。':'结果已保存到本地，尚未发送。');
 },'primary full');
 const returnAction=button('复制结果并返回原对话','task-return-origin',async()=>{
  if(!prepared||prepared.text!==resultText.value)throw Error('TASK_MATCH_CONFLICT');
  const r={...prepared};const copied=await copy(r.text,resultText);
  if(!prepared||prepared.id!==r.id||resultText.value!==r.text)throw Error('TASK_MATCH_CONFLICT');
  if(!copied){openOnly.hidden=false;return;}await call('tl:taskReturn',{taskId:r.taskId,...await currentWorkspaceWindow()});say('已复制并打开来源对话；请自行粘贴、核对和发送。');
 },'primary full');returnAction.hidden=true;
 const openOnly=button('只打开原对话','task-open-only',async()=>{if(!prepared)throw Error('TASK_NOT_FOUND');await call('tl:taskReturn',{taskId:prepared.taskId,...await currentWorkspaceWindow()});});openOnly.hidden=true;
 ret.append(...field('外部助手的结果',resultText),resultCount,preview,manual,save,returnAction,openOnly,n('p','返回后自行粘贴并发送。',{class:'hint'}));
 const recent=n('details',null,{class:'recent-tasks',open:''});recent.append(n('summary','最近的任务'),n('div',null,{id:'task-list',class:'list'}));taskView.append(head,taskStatus,modes,compose,ret,recent);main.append(taskView);mode('compose');
 async function readSource(){const tabId=Number(source.value);if(!tabId)throw Error('请选择一个已打开的 ChatGPT 对话。');return call('tl:taskSource',{tabId,expectedUrl:source.selectedOptions[0]?.dataset.sourceUrl});}
 function inputWithinLimit(input,count,limit){const length=input.value.length,over=length>limit;input.setAttribute('aria-invalid',String(over));count.classList.toggle('error',over);count.textContent=over?'已输入 '+length.toLocaleString()+' / '+limit.toLocaleString()+' 字符；内容已完整保留，请缩短后再试。':length?length.toLocaleString()+' / '+limit.toLocaleString()+' 字符':'';return !over&&!!input.value.trim();}
 function updateCreateState(){const valid=inputWithinLimit(text,taskCount,T.LIMITS.task);create.disabled=creating||!source.value||!valid;}
 function invalidateCreation(){createEpoch++;created=null;promptBox.hidden=true;create.hidden=false;updateCreateState();}
 text.addEventListener('input',invalidateCreation);source.addEventListener('change',invalidateCreation);
 async function copy(value,fallback){try{await navigator.clipboard.writeText(value);say('已复制。');return true;}catch{const details=fallback.closest('details');if(details)details.open=true;fallback.focus();fallback.select();say('未能复制。文本已选中，请手动复制。',true);return false;}}
 async function refreshSources(){const rows=await call('tl:sources'),old=source.value||new URL(location.href).searchParams.get('source'),oldUrl=source.selectedOptions[0]?.dataset.sourceUrl;source.replaceChildren(new Option('选择来源对话',''));const names=displayLabels(rows,r=>r.title,'标签页');for(const [i,r] of rows.entries()){const option=new Option(names[i],String(r.id));option.dataset.sourceUrl=r.url;source.add(option);}if(rows.some(r=>String(r.id)===old))source.value=old;else{const [activeTab]=await chrome.tabs.query({active:true,currentWindow:true});if(rows.some(r=>r.id===activeTab?.id))source.value=String(activeTab.id);else if(rows.length===1)source.value=String(rows[0].id);}if(oldUrl&&oldUrl!==source.selectedOptions[0]?.dataset.sourceUrl)invalidateCreation();else updateCreateState();}
 async function refreshChoices(epoch=matchEpoch){
  if(choicesFresh)return epoch===matchEpoch;
  const old=manualSource.value,rows=await S.taskChoices();if(epoch!==matchEpoch)return false;
  manualSource.replaceChildren(new Option('请选择原任务',''));
  const names=displayLabels(rows,t=>t.preview,'任务');for(const [i,t] of rows.entries())manualSource.add(new Option(names[i],t.id));
  if(rows.some(t=>t.id===old))manualSource.value=old;choicesFresh=true;return true;
 }
 async function openSavedResult(id,taskId){
  mode('return');const ticket=++savedResultOpenEpoch,current=()=>ticket===savedResultOpenEpoch;
  prepared=null;save.disabled=true;save.hidden=false;returnAction.hidden=true;openOnly.hidden=true;
  const before=resultText.value,epoch=matchEpoch,[r,t]=await Promise.all([S.getResult(id),S.get(taskId)]);
  if(!current())return;if(!r||!t)throw Error('TASK_NOT_FOUND');if(epoch!==matchEpoch||before!==resultText.value)return;
  const task=T.validateTask(t),result=T.validateResult(r,task);
  if(before&&before!==result.text&&!confirm('替换当前结果草稿？'))return;
  if(!current())return;resultText.value=result.text;confirmBox.checked=false;await refreshChoices();if(!current())return;
  manualSource.value=task.id;await updateMatch();if(!current()||resultText.value!==result.text)return;
  if(result.assignment==='manual_assigned'){manual.hidden=false;confirmBox.checked=true;}
  prepared={...result};preview.replaceChildren();showSource(task,result.assignment==='manual_assigned'?'人工关联的来源':'已保存结果的来源');save.hidden=true;returnAction.hidden=false;
 }
 async function refreshTasks(append=false){
  if(!append)choicesFresh=false;
  const epoch=++taskPageEpoch,page=await S.listPage({limit:25,cursor:append?taskCursor:null});if(epoch!==taskPageEpoch)return;
  const list=$('task-list'),priorFocus=document.activeElement,focusedTask=priorFocus?.closest?.('[data-task-id]')?.getAttribute('data-task-id'),focusedAction=priorFocus?.getAttribute?.('data-task-action');
  taskCursor=page.nextCursor;list.querySelector('.task-more')?.remove();if(!append)list.replaceChildren();
  const taskLabels=displayLabels(page.items,t=>t.preview,'任务');
  for(const [itemIndex,t] of page.items.entries()){
   const count=t.resultCount,row=n('div',null,{class:'task-row','data-task-id':t.id});row.append(n('strong',taskLabels[itemIndex]),n('small',readableTitle(t.source.title,'ChatGPT')+' · '+new Date(t.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+' · '+(count?count+' 份结果':'尚无结果')));
   const actions=n('div',null,{class:'actions'});
   actions.append(button('复制任务',null,async()=>{const full=await S.get(t.id);if(!full)throw Error('TASK_NOT_FOUND');prompt.value=T.envelope(full);promptBox.hidden=false;create.hidden=true;mode('compose');const copied=await copy(prompt.value,prompt);promptState.textContent=copied?'任务已复制':'任务已保存，请手动复制';}),button('回传结果',null,async()=>{mode('return');await refreshChoices();manualSource.value=t.id;confirmBox.checked=false;resultText.focus();await updateMatch();}),button('删除',null,async()=>{if(!confirm('删除本地任务及结果？原对话不受影响。'))return;await S.remove(t.id);prepared=null;await refreshTasks();await updateMatch();}));for(const [index,name]of ['copy','return','delete'].entries())actions.children[index]?.setAttribute('data-task-action',name);row.append(actions);
   if(count){
    const d=n('details'),body=n('div',null,{class:'task-result-list'});d.append(n('summary','查看 '+count+' 份结果'),body);let cursor=null,loading=false,loaded=false;
    async function loadResults(more=false){if(loading)return;loading=true;try{const result=await S.resultPage(t.id,{limit:25,cursor:more?cursor:null});if(!row.isConnected)return;cursor=result.nextCursor;body.querySelector('.result-more')?.remove();if(!more)body.replaceChildren();for(const r of result.items)body.append(button(new Date(r.createdAt).toLocaleString()+' · '+(r.assignment==='manual_assigned'?'人工关联':'标记匹配'),null,()=>openSavedResult(r.id,t.id)));if(cursor)body.append(button('加载更多结果',null,()=>loadResults(true),'quiet result-more'));loaded=true;}finally{loading=false;}}
    d.addEventListener('toggle',()=>{if(d.open&&!loaded)safe(()=>loadResults());});row.append(d);
   }
   list.append(row);
  }
  if(taskCursor)list.append(button('加载更多任务','task-load-more',()=>refreshTasks(true),'quiet task-more'));
  if(!list.children.length)list.append(n('p','还没有任务。',{class:'muted'}));
  if(focusedTask&&focusedAction){
   const row=[...list.querySelectorAll('[data-task-id]')].find(el=>el.getAttribute('data-task-id')===focusedTask);
   const target=row?.querySelector('[data-task-action="'+focusedAction+'"]');
   if(target&&!target.disabled)target.focus({preventScroll:true});
  }
 }
 function showSource(task,label){const t=T.validateTask(task);preview.append(n('strong',label),n('p',readableTitle(t.source.title,'ChatGPT')),n('small',t.text.slice(0,180)),n('a','查看来源对话',{href:t.source.url,title:t.source.url,target:'_blank',rel:'noopener noreferrer'}));}
 async function updateMatch(){const epoch=++matchEpoch;prepared=null;save.hidden=false;returnAction.hidden=true;openOnly.hidden=true;save.disabled=true;const value=resultText.value;if(!inputWithinLimit(resultText,resultCount,T.LIMITS.result)){preview.textContent='';manual.hidden=true;return;}const m=await S.match(value);if(epoch!==matchEpoch||value!==resultText.value)return;preview.replaceChildren();manual.hidden=m.state==='matched';
  if(m.task){showSource(m.task,'来源已匹配');save.disabled=false;}else{if(!await refreshChoices(epoch))return;const chosen=manualSource.value?await S.get(manualSource.value):null;if(epoch!==matchEpoch||value!==resultText.value)return;preview.replaceChildren(n('p',labels[m.state]));if(chosen)showSource(chosen,'待人工确认的来源');save.disabled=!(chosen&&confirmBox.checked);}
 }
 resultText.addEventListener('input',()=>{invalidateSavedResultOpen();taskStatus.textContent='';confirmBox.checked=false;safe(updateMatch);});manualSource.addEventListener('change',()=>{invalidateSavedResultOpen();taskStatus.textContent='';confirmBox.checked=false;safe(updateMatch);});confirmBox.addEventListener('change',()=>{invalidateSavedResultOpen();safe(updateMatch);});
 const settings=n('section',null,{id:'settings-view',class:'view',hidden:''}),sh=n('div',null,{class:'view-heading'});sh.append(n('button','‹ 首页',{type:'button','data-view':'home',class:'back quiet'}),n('h1','高级功能'));settings.append(sh);
 const diagnosticDetails=n('details',null,{class:'advanced'}),diagnosticOutput=n('pre',null,{id:'diagnostic-codes'});
 diagnosticDetails.append(n('summary','\u5de5\u7a0b\u8bca\u65ad\uff08\u4e0d\u542b\u5bf9\u8bdd\u539f\u6587\uff09'),button('\u8bfb\u53d6\u672c\u5730\u9519\u8bef\u7c7b\u578b','read-diagnostics',async()=>{diagnosticOutput.textContent=JSON.stringify(await TLDiagnostics.list(),null,2);}),diagnosticOutput);
 settings.append(diagnosticDetails);

 const settingsBox=n('div',null,{class:'task-card'});
 const featureRows=[
  ['context','组合多份档案','从选中的本地档案生成来源清楚的上下文包。'],
  ['live','实时缓存当前对话','只有对指定对话主动开启后才追踪新生成文件。'],
  ['diagnostics','存储与文件诊断','显示本地占用情况并申请持久化存储。'],
  ['passages','重点片段与分支','保存关键原文，查看可访问分支及定位状态。'],
  ['tools','对话搜索与时间轴','按需在选定的 ChatGPT 标签页打开搜索工具。']
 ];
 for(const[key,title,description]of featureRows){
  const input=n('input',null,{type:'checkbox',id:'pref-'+key}),l=n('label',null,{class:'preference-row'}),copy=n('span',null,{class:'preference-copy'});
  copy.append(n('span',title,{class:'preference-title'}),n('small',description,{class:'preference-hint'}));
  l.append(copy,input);settingsBox.append(l);input.addEventListener('change',()=>safe(async()=>{prefs[key]=input.checked;await chrome.storage.local.set({cfPreferences:prefs});applyPreferences();}));
 }
 const experimentInfo=n('details',null,{class:'advanced compact experiment-explainer'});
 experimentInfo.append(n('summary','并行实验怎样工作？'),n('p','对每个新聊天使用同一份材料；你需自行点击发送，扩展不会自动重试。',{class:'hint'}),n('a','查看并行实验说明',{href:'https://github.com/siskosun/ChatFlow/blob/main/docs/EXPERIMENTS.md',target:'_blank',rel:'noopener noreferrer'}));

 const backup=n('details',null,{class:'advanced'});backup.append(n('summary','任务备份与恢复'));
 const backupButton=button('下载任务备份','task-backup',async()=>{
  backupButton.disabled=true;let url=null,downloadId=null;
  try{
   say('正在校验并生成任务备份…');
   const blob=await S.exportBackup();url=URL.createObjectURL(blob);
   downloadId=await chrome.downloads.download({url,filename:'chatflow-tasks.jsonl',saveAs:true});
   let cleaned=false;
   const cleanup=()=>{if(cleaned)return;cleaned=true;chrome.downloads.onChanged.removeListener(onChanged);URL.revokeObjectURL(url);};
   const onChanged=change=>{if(change.id!==downloadId)return;
    if(change.state?.current==='complete'){cleanup();say('任务备份下载完成，请妥善保存。');}
    else if(change.state?.current==='interrupted'||change.error){cleanup();say('任务备份下载中断；本地记录仍保留。',true);}
   };
   chrome.downloads.onChanged.addListener(onChanged);
   const records=await chrome.downloads.search({id:downloadId}).catch(()=>[]);
   if(records[0]?.state==='complete')onChanged({id:downloadId,state:{current:'complete'}});
   else if(records[0]?.state==='interrupted')onChanged({id:downloadId,state:{current:'interrupted'}});
   else say('已发起任务备份下载，请在浏览器下载列表核对。');
  }catch(e){if(!downloadId&&url)URL.revokeObjectURL(url);throw e;}
  finally{backupButton.disabled=false;}
 });backup.append(backupButton);
 const restore=n('input',null,{type:'file',id:'task-restore',accept:'.jsonl,.json,application/x-ndjson,application/json'});backup.append(...field('恢复任务备份',restore));const settingsStatus=n('p',null,{id:'settings-status',role:'status','aria-live':'polite'});restore.addEventListener('change',async()=>{try{const f=restore.files[0];if(!f)return;restore.disabled=true;backupButton.disabled=true;say('正在校验备份…');const r=await S.restoreBackup(f);say('已恢复 '+r.tasks+' 个任务、'+r.results+' 份结果。');await refreshTasks();}catch(e){say(e.name==='QuotaExceededError'?'空间不足，恢复未完成；原任务仍保留。':errors[e.message]||(/^TASK_BACKUP_/.test(e.message)?'备份校验未通过，未恢复任何内容。':'恢复未完成，请检查备份文件；如持续失败，可在高级功能中查看诊断信息。'),true);}finally{restore.value='';restore.disabled=false;backupButton.disabled=false;}});settings.append(settingsBox,experimentInfo,backup,settingsStatus);main.append(settings);
 function applyPreferences(){for(const[k,v]of Object.entries(prefs)){document.body.classList.toggle('feature-'+k,!!v);$('pref-'+k).checked=!!v;}if(!prefs.live)$('live').checked=false;}
 document.addEventListener('chatflow:view',e=>{invalidateSavedResultOpen();if(e.detail==='tasks')safe(async()=>{await refreshSources();await refreshTasks();await updateMatch();});});
 window.addEventListener('focus',()=>{if(!$('tasks-view').hidden)safe(async()=>{await refreshSources();await refreshTasks();});});
 $('open-tools').onclick=()=>safe(async()=>{const id=Number($('source').value);await call('tl:openTools',{tabId:id,expectedUrl:$('source').selectedOptions[0]?.dataset.sourceUrl});});
 chrome.storage.local.get('cfPreferences').then(r=>{for(const k of Object.keys(defaults))if(typeof r.cfPreferences?.[k]==='boolean')prefs[k]=r.cfPreferences[k];applyPreferences();}).catch(()=>applyPreferences());
 globalThis.ChatFlowTaskUI=Object.freeze({refreshTasks,refreshSources,updateMatch,mode});
})();
