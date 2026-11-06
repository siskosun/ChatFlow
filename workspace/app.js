/* ChatFlow workspace: all user content is rendered with textContent, never HTML. */
(() => {
 'use strict';
 const C=TLCore,S=TLStore,A=TLArchive,$=id=>document.getElementById(id);
 let selectedId=null,selectedKeys=new Set(),contextSelectedIds=new Set(),contextSelectedPassageIds=new Set(),branchSelections=new Map(),reanchorPassageId=null,handoffId=null,planFingerprint=null,staged=new Map(),view='home',refreshing=false,messageLimit=100,detailEpoch=0,sourceLookupKey=null,sourceLookupCaptureId=null,sourceOptionsSignature=null,runningSignature=null,runningEpoch=0,downloadStatusNonce=0;
 // Session pointers provide fast resumption; complete handoff materials live in
 // IndexedDB and remain recoverable after session storage or panel reload.
 const handoffSessionKey=captureId=>'cfHandoffActive:'+captureId;
 const resumableHandoffStates=new Set(['prepared','target_opened','claimed','draft_prepared','upload_unknown','upload_confirmed','injection_blocked','partial_injection','user_verified_upload']);
 async function rememberHandoff(h){
  try{await chrome.storage.session.set({[handoffSessionKey(h.captureId)]:{id:h.id,at:Date.now()}});}catch{/* IDB remains the durable recovery source. */}
 }
 async function resumeHandoffForCapture(captureId){
  const rows=(await S.handoffsForCapture(captureId)).filter(h=>resumableHandoffStates.has(h.state))
   .sort((a,b)=>String(b.retriedAt||b.createdAt||'').localeCompare(String(a.retriedAt||a.createdAt||'')));
  let ptr=null;
  try{ptr=(await chrome.storage.session.get(handoffSessionKey(captureId)))[handoffSessionKey(captureId)];}catch{}
  const pointed=rows.find(row=>row.id===ptr?.id),latest=rows[0];
  // Session pointers are hints. A newer prepared/attempted record supersedes
  // an older pointer created by another sidebar, not the other way around.
  const date=h=>String(h?.retriedAt||h?.createdAt||'');
  const h=pointed&&date(pointed)>=date(latest)?pointed:latest;
  if(!h)return false;
  const capture=await S.get('captures',captureId);
  if(!capture?.snapshot||TLPassages.snapshotHash(capture.snapshot)!==h.snapshotHash)return false;
  const input=h.resumeForm;
  if(input&&typeof input.instructions==='string'&&input.instructions.length<=4000&&
   Number.isInteger(input.batchLimit)&&input.batchLimit>=2&&input.batchLimit<=50&&
   Array.isArray(input.selectedKeys)&&input.selectedKeys.every(k=>typeof k==='string')){
   $('instructions').value=input.instructions;$('batch-limit').value=String(input.batchLimit);
   selectedKeys=new Set(input.selectedKeys);
   if(input.branchEndNode&&branchChoices(capture.snapshot).some(c=>c.endNode===input.branchEndNode))
    branchSelections.set(captureId,input.branchEndNode);
   planFingerprint=fingerprint()===input.fingerprint?input.fingerprint:null;
  }else planFingerprint=null;
  handoffId=h.id;
  try{await renderHandoff(h);await rememberHandoff(h);return true;}
  catch(e){handoffId=null;planFingerprint=null;$('handoff-result').hidden=true;status('已有接续记录，但相关文件暂时无法验证；请回到档案重新准备。',true);return false;}
 }
 async function latestResumeCapture(){
  const rows=(await S.all('handoffs')).filter(h=>resumableHandoffStates.has(h.state))
   .sort((a,b)=>String(b.retriedAt||b.createdAt||'').localeCompare(String(a.retriedAt||a.createdAt||'')));
  for(const h of rows.slice(0,30)){const c=await S.get('captures',h.captureId);if(c?.snapshot&&TLPassages.snapshotHash(c.snapshot)===h.snapshotHash)return h.captureId;}
  return null;
 }
 async function refreshResumeButton(){
  const button=$('resume-handoff');if(!button)return;
  const id=await latestResumeCapture();button.hidden=!id;button.dataset.captureId=id||'';
 }
 async function resumeLatestHandoff(){
  const id=$('resume-handoff')?.dataset.captureId||await latestResumeCapture();
  C.check(id,'HANDOFF_NOT_PREPARED');await choose(id);switchView('handoff');
 }
 const labels={ready:'可访问快照已保存',partial:'部分保存',capturing:'保存中',interrupted:'已中断',error:'保存失败',cancelled:'已取消',saved:'文件已保存',excluded:'按保存范围跳过',unavailable:'未取得文件字节',discovered:'待下载',downloading:'下载中',corrupt:'本地校验失败',prepared:'接续包已生成',target_opened:'新聊天标签页已打开',claimed:'准备草稿与文件中',draft_prepared:'草稿已预填',upload_confirmed:'网页曾显示首批附件就绪（仅页面观察）',upload_unknown:'首批上传结果未知',injection_blocked:'自动注入已停止',partial_injection:'注入未完整确认',user_verified_upload:'用户已核对首批上传'};
 const errors={SOURCE_SELECTION_CHANGED:'所选对话已变化，请重新选择后保存。',SOURCE_CHANGED:'来源对话已变化，保存已停止。',SOURCE_IDENTITY_MISMATCH:'来源身份不一致，未保存其他对话。',ARCHIVE_BUSY:'文件仍在下载，请完成或停止采集后再备份。',ARCHIVE_EXPORT_LIMIT:'当前内容超过可恢复备份的容量，未生成备份；本地内容仍保留。',HANDOFF_SOURCE_CHANGED:'来源档案或分支已变化，请重新准备接续包。',HANDOFF_SOURCE_CHANGED_REGENERATE:'来源档案已变化，请重新准备接续包。',PASSAGE_COUNT_LIMIT:'每份档案最多保存 5000 条重点片段。',PASSAGE_NOT_FOUND:'这条重点片段已不存在，请重新打开档案。',PASSAGE_NOT_ANCHORED_TO_SOURCE:'片段来源已变化，请刷新档案并重新选择。',CONTEXT_PASSAGE_NOT_ANCHORED:'部分重点片段已过期或有歧义，请重新定位后再编译。',CONTEXT_PASSAGE_OUTSIDE_BRANCH_SCOPE:'所选重点片段不属于当前分支；请切换分支或选择全部可访问分支。',NO_SELECTED_CONTEXT_PASSAGES:'请先选择要编译的重点片段。',CHATGPT_PAGE_NOT_READY:'ChatGPT 页面尚未准备好，请打开原对话后重试。',CHATGPT_LOGIN_REQUIRED:'请先在所选 ChatGPT 标签页登录。',NO_CONVERSATION_ID:'请选择已有的 ChatGPT 对话，而不是空白首页。',SOURCE_ALREADY_RUNNING:'这个对话已有采集在运行，请先停止。',LOCAL_STORAGE_FULL:'本地存储空间不足。已保存的文件保留，请先导出 ZIP 或清理本地档案。',MEDIA_PERMISSION_REQUIRED:'未授予 OpenAI 文件域名权限，正文可保存，但有关文件尚未取得字节。',OUT_OF_SAVE_SCOPE:'该文件未尝试下载，因为它不在本次保存范围内。',SAVE_SCOPE_SOURCE_UNRESOLVED:'文件来源或消息位置无法确认，不能判断它是否为当前分支最后生成文件；未自动下载。',LIVE_CACHE_REQUIRES_ALL_SCOPE:'仅保存最后生成文件不能同时开启实时缓存，请选择全部文件或关闭实时缓存。',USER_DRAFT_PRESENT:'目标窗口已有草稿，自动预填已停止，不会覆盖。',SELECTED_FILE_NOT_SAVED:'所选文件尚未取得实际字节，不能加入接续。',CAPTURE_NOT_READY:'该档案仍在采集，或没有可用快照。',SNAPSHOT_HASH_MISMATCH:'档案快照哈希不匹配，恢复已中止。',ARCHIVE_FILE_HASH_MISMATCH:'归档文件哈希不匹配，恢复已中止。',LOCAL_FILE_HASH_MISMATCH:'本地文件校验失败，不会上传。',ZIP_RESOURCE_LIMIT:'档案超过当前版本的安全恢复上限（单个 ZIP 条目 64 MiB，合计 256 MiB）；恢复已中止，原有档案未更改。',ZIP_COMPRESSION_RATIO_LIMIT:'ZIP 内文件压缩比例超过安全上限，已拒绝恢复。',ZIP_EXPANSION_LIMIT:'ZIP 实际展开尺寸超过安全上限，已中止恢复。',UNRECOGNIZED_ARCHIVE:'这不是可识别的ChatFlow档案 ZIP。官方导出请使用“对照官方 ZIP”。',INVALID_ZIP:'文件不是有效 ZIP，请选择正确的备份文件。',ZIP_END_NOT_FOUND:'ZIP 文件不完整或损坏，未导入任何数据。',INVALID_ZIP_DIRECTORY:'ZIP 文件结构损坏，未导入任何数据。',INVALID_HANDOFF_BRANCH_PATH:'所选分支路径不完整或已变化，请重新选择分支。',INVALID_CONTEXT_BRANCH_PATH:'所选分支路径不完整，请重新选择分支。',WORKSPACE_WINDOW_REQUIRED:'无法确认工作区所在的浏览器窗口，未创建新标签页。请从当前窗口重新打开 ChatFlow。',NEW_TAB_FAILED:'无法在当前浏览器窗口创建新标签页。'};
 Object.assign(errors,{SNAPSHOT_MESSAGE_SIZE_LIMIT:'对话正文超过单份档案的容量限制（约 24 MiB）；已停止保存，不能将截断内容当作完整历史。',CANCELLED_OR_TIMEOUT:'读取超时或已取消。请确认来源对话仍打开后重试；原档案不会被截断覆盖。'});
 Object.assign(errors,{API_JSON_RESPONSE_TOO_LARGE:'对话数据超过安全读取上限，已在解析前停止；未保存不完整数据。',API_JSON_LENGTH_MISMATCH:'API 响应字节数与声明不符，本次读取已停止。',API_JSON_NOT_JSON:'ChatGPT 返回了非 JSON 页面，请确认登录状态并重试。',API_JSON_BODY_MISSING:'对话接口返回空响应体，本次读取已停止。',TOOLS_SOURCE_UNVERIFIED:'当前页面内容来源尚未确认，不能将这些内容作为已核验的对话导出或公式。',SOURCE_CONVERSATION_CHANGED:'来源对话已切换，请重新选择后保存。',SOURCE_DOCUMENT_CHANGED:'来源页面已刷新，请重新选择后保存。',SOURCE_NAVIGATED:'来源对话已切换，采集已停止。',SOURCE_LOCK_REQUIRED:'请重新打开 ChatFlow，再选择来源对话。',DOCUMENT_ID_UNAVAILABLE:'无法确认来源页面，请刷新后重试。',CAPTURE_SESSION_NOT_FOUND:'采集已停止，请重新保存。',LOCAL_FILE_INTEGRITY_FAILED:'本地文件校验失败，未生成备份。请重新保存该文件。',ARCHIVE_SOURCE_MISMATCH:'备份来源与正文不一致，恢复已停止。',ARCHIVE_METADATA_TOO_LARGE:'对话或清单超过备份容量，未生成备份；本地内容仍保留。',HANDOFF_INSTRUCTIONS_TOO_LONG:'接续目标超过 4,000 个字符；全文已保留，请缩短后继续。',INVALID_CONTEXT_QUERY:'筛选关键词超过 500 个字符；全文已保留，请缩短后继续。'});
 Object.assign(errors,{RESTORE_DATABASE_READBACK_FAILED:'档案已导入，但数据库回读失败；请保留原备份。',RESTORE_SNAPSHOT_READBACK_FAILED:'档案已导入，但正文结构回读不一致；请保留原备份。',RESTORE_ASSET_READBACK_FAILED:'档案已导入，但附件清单回读不一致；请保留原备份。',RESTORE_PASSAGE_READBACK_FAILED:'档案已导入，但重点片段回读不一致；请保留原备份。',RESTORE_BLOB_READBACK_FAILED:'档案已导入，但文件字节回读不一致；请保留原备份。',RESTORE_RECEIPT_WRITE_FAILED:'档案已导入并完成读回，但无法保存验证回执；请保留原备份。'});
 Object.assign(errors,{INVALID_CONTEXT_SOURCES:'上下文来源选择无效，请重新选择本地档案。',CONTEXT_SOURCE_NOT_READY:'所选档案尚未准备好，请完成保存或换一份档案。',PASSAGE_SELECTION_REQUIRED:'请先选择要使用的重点片段。',PASSAGE_REANCHOR_SOURCE_MISMATCH:'片段所在对话已经变化，请返回原档案重新定位。',USER_CONFIRMATION_REQUIRED:'请先勾选人工核对确认；这并不代表模型已读取附件。',HANDOFF_NOT_PREPARED:'接续包尚未准备，请先检查历史与文件。',REGENERATE_HANDOFF_AFTER_CHANGES:'接续选项已经变化，请重新准备历史与文件。',EXTENSION_UNAVAILABLE:'扩展后台暂时无响应，请刷新工作区；如仍失败，请重启扩展。',HANDOFF_ALREADY_OPENED:'已经打开此接续包的新聊天，不会重复打开。',NO_VISIBLE_MESSAGES:'当前对话没有可访问的消息，不能生成快照。',SAVE_SCOPE_CHANGED:'保存期间文件范围已更改；未使用过期选择，请重新开始保存。',LIVE_SAVE_MODE_CHANGED:'保存期间实时缓存选项已更改；请重新开始保存。',TAB_CLOSED:'来源标签页已关闭，请重新选择对话。',DOCUMENT_ID_INVALID:'原页面已重载，请重新打开来源对话。',INJECT_FAILED:'无法注入读取脚本，请检查扩展网站权限。',IDB_UPGRADE_BLOCKED_CLOSE_OTHER_WINDOWS:'本地存储升级被其他 ChatFlow 窗口阻挡；请关闭其他扩展工作区后重试。',STARTUP_FAILED:'扩展启动未完成，请检查存储权限并重新打开工作区。',FF_CRITERIA_REQUIRED:'请填写判断依据后再提交。'});
 Object.assign(errors,{
  HANDOFF_NOT_CONFIRMED:'自动接续未能确认具体原因。请检查新聊天已有草稿和附件，再手动补齐；不会自动重试或发送。',
  HANDOFF_OLD_TARGET_STILL_OPEN:'原接续标签页仍打开，可能已有未发送草稿或附件。请先点“查看新聊天”检查并保存必要内容，关闭原标签页后再重新准备；不会同时打开第二份草稿。',
  HANDOFF_TARGET_CHECK_UNAVAILABLE:'无法确认原接续标签页是否已关闭。为避免两份草稿，已拒绝重试。请检查浏览器标签页后再试。',
  TARGET_NAVIGATION_UNCONFIRMED:'无法确认新聊天已正确打开。请检查目标标签页，必要时手动打开新聊天并使用接续文件。',
  COMPOSER_NOT_READY:'新聊天输入框未准备好。请先确认 ChatGPT 页面已加载，再手动粘贴接续内容。',
  COMPOSER_UNAVAILABLE_OR_AMBIGUOUS:'无法唯一识别新聊天输入框，自动预填已停止。请使用接续文件手动继续。',
  NON_STANDARD_CHAT:'目标不是普通新聊天，自动预填已停止。请在普通新聊天中手动继续。',
  EXISTING_CHAT_REJECTED:'目标对话已经有消息，未修改原有对话。请在新的普通聊天中手动继续。',
  USER_FILES_PRESENT:'目标输入区已有附件，为避免覆盖或重复上传已停止。请先核对已有附件。',
  USER_DRAFT_CHANGED:'输入框内容已经变化，自动预填已停止，现有草稿保留。',
  PREFILL_NOT_CONFIRMED:'页面未确认接续提示完整填入。请核对草稿，勿直接发送。',
  COMPOSER_REPLACED:'ChatGPT 重新渲染了输入框或附件区域。请核对已填入内容和附件后手动继续。',
  GENERAL_FILE_INPUT_UNAVAILABLE_OR_AMBIGUOUS:'无法确定唯一的上传入口。接续提示可保留，请手动上传文件。',
  FILE_INPUT_IS_SINGLE_ONLY:'页面目前仅支持选择单个文件。请按接续索引手动上传其余文件。',
  HANDOFF_FILE_SIZE_CHANGED:'接续文件在读取期间大小不一致，未确认上传。请重新检查本地文件。',
  HANDOFF_FILE_TRUNCATED:'接续文件未完整读取，未确认上传。请从接续包手动补齐。',
  HANDOFF_FILE_HASH_MISMATCH:'接续文件校验失败，未确认上传。请使用已核验的接续文件手动补齐。',
  EMPTY_FILE_REJECTED:'接续文件为空，不能代替真实附件。请检查原档案文件。',
  HANDOFF_TARGET_MISMATCH:'新聊天身份已变化，不会向其他页面自动注入。请核对当前标签页。',
  HANDOFF_ATTEMPT_MISMATCH:'接续请求已过期或改变，不会重用旧请求。请核对新聊天后手动继续。',
  HANDOFF_ALREADY_FINISHED:'接续尝试已结束，不会重复注入。请检查新聊天和已准备的文件。'
 });
 function explain(e){const key=String(e?.message||e||'');if(Object.hasOwn(errors,key))return errors[key];if(/^HTTP_\d+$/.test(key))return '文件暂时无法下载，请检查登录和网络后重试；不能据此认定文件已被删除。';return '操作未完成，请重试；如持续失败，可在高级功能中查看诊断信息。';}
 let statusTimeout=null;
 function status(text,error=false){
  const el=$('status'),value=String(text||'').trim();clearTimeout(statusTimeout);
  el.replaceChildren(document.createTextNode(value));el.classList.toggle('error',!!error&&!!value);
  if(value&&error){const close=node('button','×','status-dismiss');close.type='button';close.setAttribute('aria-label','关闭当前错误提示');close.onclick=()=>status('');el.append(close);}
  else if(value)statusTimeout=setTimeout(()=>{if(el.textContent===value)status('');},4500);
 }
 function node(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}
 function readableTitle(raw,fallback='未命名对话'){
  const clean=String(raw??'').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim();
  return clean?[...clean].slice(0,100).join(''):fallback;
 }
 function readableLabels(rows,titleOf,kind){
  const names=rows.map(row=>readableTitle(titleOf(row))),counts=new Map(),seen=new Map();
  for(const title of names)counts.set(title,(counts.get(title)||0)+1);
  return names.map(title=>{if(counts.get(title)===1)return title;
   const index=(seen.get(title)||0)+1;seen.set(title,index);return title+' · '+kind+' '+index;});
 }
 function preserveIdentityFocus(container){
  const focused=document.activeElement;
  if(!focused||!container.contains(focused)||!focused.dataset?.focusId||!focused.dataset?.focusRole)return()=>{};
  const key=focused.dataset.focusId,role=focused.dataset.focusRole,tag=focused.tagName;
  return()=>{const item=[...container.querySelectorAll('[data-focus-id]')].find(el=>el.dataset.focusId===key&&el.dataset.focusRole===role&&el.tagName===tag&&!el.disabled);item?.focus({preventScroll:true});};
 }
 function button(text,fn,cls){const b=node('button',text,cls);b.type='button';b.addEventListener('click',()=>guard(fn));return b;}
 async function guard(fn){try{return await fn();}catch(e){status(explain(e),true);if(['IDB_UPGRADE_BLOCKED_CLOSE_OTHER_WINDOWS','STARTUP_FAILED','EXTENSION_UNAVAILABLE'].includes(e?.message))$('retry-workspace').hidden=false;}}
 async function call(type,data={}){const r=await chrome.runtime.sendMessage({type,...data});if(!r?.ok)throw new Error(r?.code||'EXTENSION_UNAVAILABLE');return r.data;}
 async function currentWorkspaceWindow(){
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});
  const tab=tabs.find(t=>t.active&&Number.isInteger(t.id)&&Number.isInteger(t.windowId));
  C.check(tab,'WORKSPACE_WINDOW_REQUIRED');
  return{windowId:tab.windowId,activeTabId:tab.id};
 }
 function bytes(n){return n>=1024**3?(n/1024**3).toFixed(2)+' GB':n>=1024**2?(n/1024**2).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B';}

 // One experiment tab across all workspace entrances. The button reflects the
 // actual browser tab state, not whether the last click returned successfully.
 const experimentUrl=chrome.runtime.getURL('workspace/experiments.html');
 let experimentTogglePending=false,experimentSyncTimer=null;
 async function experimentTabs(){
  const tabs=await chrome.tabs.query({});
  // Tab IDs survive navigation: never mistake a redirected user tab for an experiment.
  return tabs.filter(t=>Number.isInteger(t.id)&&(
   t.url?.split(/[?#]/,1)[0]===experimentUrl ||
   t.pendingUrl?.split(/[?#]/,1)[0]===experimentUrl));
 }
 function experimentButtons(){
  return ['home-experiment','settings-open-experiments'].map($).filter(Boolean);
 }
 async function refreshExperimentButtons(){
  const tabs=await experimentTabs(),open=tabs.length>0;
  for(const button of experimentButtons()){
   const text=open?'关闭并行实验':'打开并行实验';
   const strong=button.id==='home-experiment'?button.querySelector('strong'):null;
   if(strong)strong.textContent=text;else button.textContent=text;
   button.setAttribute('aria-pressed',String(open));
   button.setAttribute('aria-label',text);
   button.disabled=experimentTogglePending;
  }
  return tabs;
 }
 async function toggleExperiment(){
  if(experimentTogglePending)return;
  experimentTogglePending=true;
  for(const b of experimentButtons())b.disabled=true;
  try{
   const existing=await experimentTabs();
   if(existing.length){
    await chrome.tabs.remove(existing.map(tab=>tab.id));
   }else{
    await chrome.tabs.create({url:experimentUrl});
   }
  }finally{
   experimentTogglePending=false;
   await refreshExperimentButtons();
  }
 }
 function scheduleExperimentSync(){
  clearTimeout(experimentSyncTimer);
  experimentSyncTimer=setTimeout(()=>refreshExperimentButtons().catch(()=>{}),100);
 }
 chrome.tabs.onCreated.addListener(scheduleExperimentSync);
 chrome.tabs.onRemoved.addListener(scheduleExperimentSync);
 chrome.tabs.onUpdated.addListener((_id,change)=>{
  if(change.url||change.status==='complete')scheduleExperimentSync();
 });
 globalThis.ChatFlowExperimentTabs=Object.freeze({
  toggle:toggleExperiment,refresh:refreshExperimentButtons
 });
 setTimeout(scheduleExperimentSync,0);
 // A successful action belongs to the view that produced it; stale banners
 // must not follow users across workflows. Failures remain until dismissed.
 function clearTransientFeedback(){
  const banner=$('status');
  if(banner&&!banner.classList.contains('error'))status('');
  for(const id of ['task-status','settings-status']){
   const el=$(id);if(el&&!el.classList.contains('error'))el.textContent='';
  }
 }
 function switchView(v){if(!document.getElementById(v+'-view'))return;if(v!==view)clearTransientFeedback();view=v;for(const e of document.querySelectorAll('.view'))e.hidden=e.id!==v+'-view';for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-current',b.dataset.view===v?'page':'false');if(v==='capture')guard(syncSources);if(v==='archive')guard(refreshArchives);if(v==='handoff'){guard(updateSelection);if(handoffId)guard(renderHandoffState);}document.dispatchEvent(new CustomEvent('chatflow:view',{detail:v}));}
 function fingerprint(){return JSON.stringify([selectedId,branchSelections.get(selectedId)||null,[...selectedKeys].sort(),$('instructions').value,$('batch-limit').value]);}
 function invalidate(){if(handoffId&&planFingerprint!==fingerprint()){$('open-target').disabled=true;$('open-target').hidden=true;$('prepare').hidden=false;$('prepare').textContent='重新生成接续材料';status('内容已更改，请重新准备。');}}
 async function quota(){const q=await navigator.storage.estimate();$('quota').textContent='本地已用 '+bytes(q.usage||0)+(q.quota?' / 可用配额 '+bytes(q.quota):'');}
 let sourceRefreshEpoch=0;
 async function sources(){
  const epoch=++sourceRefreshEpoch,rows=await call('tl:sources');
  if(epoch!==sourceRefreshEpoch)return rows;
  const selector=$('source'),signature=JSON.stringify(rows.map(r=>[r.id,r.url,r.title]));
  if(signature===sourceOptionsSignature)return rows;
  const [activeTab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(epoch!==sourceRefreshEpoch)return rows;
  // Read the latest selection after every wait: refresh must never undo a user choice.
  const preferred=selector.value||new URL(location.href).searchParams.get('source')||String(activeTab?.id||'');
  sourceOptionsSignature=signature;sourceLookupKey=null;sourceLookupCaptureId=null;
  selector.replaceChildren();
  $('source-empty-help').hidden=rows.length>0;
  if(!rows.length){selector.append(new Option('未找到已打开的 ChatGPT 对话',''));$('capture').disabled=true;return rows;}
  const names=readableLabels(rows,r=>r.title,'标签页');
  for(const [i,r] of rows.entries()){const option=new Option(names[i],String(r.id));option.dataset.sourceUrl=r.url;selector.append(option);}
  if(rows.some(r=>String(r.id)===preferred))selector.value=String(preferred);
  $('capture').disabled=!rows.some(r=>String(r.id)===selector.value);
  return rows;
 }
 function selectedSource(){return{tabId:Number($('source').value),scope:$('asset-scope').value,live:$('live').checked,expectedUrl:$('source').selectedOptions[0]?.dataset.sourceUrl};}
 function assertSelection(frozen){const now=selectedSource();C.check(now.tabId===frozen.tabId&&now.expectedUrl===frozen.expectedUrl,'SOURCE_SELECTION_CHANGED');C.check(now.scope===frozen.scope,'SAVE_SCOPE_CHANGED');C.check(now.live===frozen.live,'LIVE_SAVE_MODE_CHANGED');}
 async function captureForSelectedSource(selection=selectedSource()){
  const {tabId,scope,expectedUrl}=selection;if(!Number.isInteger(tabId)||tabId<=0)return null;
  const openTabs=await call('tl:sources'),source=openTabs.find(row=>Number(row.id)===tabId);
  if(!source){sourceLookupKey=null;sourceLookupCaptureId=null;return null;}
  if(source.url!==expectedUrl){sourceLookupKey=null;sourceLookupCaptureId=null;return null;}
  // A ChatGPT tab can navigate to another conversation without changing tabId.
  // Cached archive selection is valid only for this exact source URL and save scope.
  const key=String(tabId)+'|'+scope+'|'+source.url;
  if(key===sourceLookupKey)return sourceLookupCaptureId?S.get('captures',sourceLookupCaptureId):null;
  const identity=C.chatUrl(source.url),chosen=await S.findCapture(identity,scope,selectedId);
  sourceLookupKey=key;sourceLookupCaptureId=chosen?.id||null;return chosen;
 }
 function updateScopeUI(){const last=$('asset-scope').value==='last_generated',live=$('live');if(last&&live.checked){live.checked=false;status('已关闭实时缓存：两种模式不能同时使用。');}live.disabled=last;$('scope-hint').textContent=last?'仅当前分支最后生成的文件。':'';$('live-hint').textContent=last?'切换为“所有文件”后才能开启实时缓存。':'';}
 async function start(){
  const selection=Object.freeze(selectedSource());C.check(selection.tabId>0&&selection.expectedUrl,'NO_CONVERSATION_ID');
  $('capture').disabled=true;
  try{
   // Start the optional permission prompt in the original click gesture while
   // freezing the displayed source before either asynchronous operation finishes.
   const freeze=call('tl:freezeSource',selection),permission=$('allow-media').checked?chrome.permissions.request({origins:chrome.runtime.getManifest().optional_host_permissions}):Promise.resolve(true);
   const [frozen,allowed]=await Promise.all([freeze,permission]);assertSelection(selection);
   const existing=await captureForSelectedSource(selection);assertSelection(selection);const request={...selection,expectedConversationId:frozen.expectedConversationId,expectedDocumentId:frozen.expectedDocumentId};
   if(existing?.id)request.captureId=existing.id;
   const r=await call('tl:start',request);selectedId=r.captureId;sourceLookupCaptureId=r.captureId;selectedKeys.clear();messageLimit=100;
   status(existing?'正在更新档案…':allowed?'正在保存对话…':'正在保存正文；部分附件可能无法取得。');await renderRunning();
  }catch(e){sourceLookupKey=null;sourceLookupCaptureId=null;throw e;}finally{$('capture').disabled=!Number.isInteger(Number($('source').value))||Number($('source').value)<=0;}
 }
 async function renderRunning(){
  const epoch=++runningEpoch,active=await call('tl:sessions'),box=$('running');
  if(active.length===0){
   const capture=await captureForSelectedSource();
   const rows=capture?.snapshot?await S.assets(capture.id):[];
   if(epoch!==runningEpoch)return;
   const saved=rows.filter(a=>a.state==='saved').length,excluded=rows.filter(a=>a.state==='excluded').length,missing=rows.filter(a=>a.state!=='saved'&&a.state!=='excluded').length;
   const signature=JSON.stringify(['idle',$('source').value,$('asset-scope').value,capture?.id,capture?.state,capture?.live,capture?.lastError,capture?.snapshot?.messages.length,saved,excluded,missing,rows.some(a=>a.state==='downloading')]);
   $('capture').disabled=!(Number($('source').value)>0);
   if(signature===runningSignature)return;
   runningSignature=signature;box.className='running '+(capture?.snapshot?'':'empty');box.replaceChildren();
   if(capture?.snapshot){
    const failed=capture.state==='error',busy=capture.state==='capturing'||capture.live||rows.some(a=>a.state==='downloading');
    selectedId=capture.id;$('capture').hidden=false;$('capture').textContent=failed?'重试保存':'重新采集对话';$('capture').className=failed?'primary full':'quiet full';$('continue').hidden=failed;$('continue').className='primary full';$('capture-backup').hidden=false;$('capture-backup').dataset.busy=String(busy);$('capture-backup').disabled=busy;$('capture-backup').textContent=busy?'下载完成后可备份':missing?'备份已保存的内容':'下载备份';$('capture-view').dataset.saved=String(!failed);$('capture-heading').textContent=failed?'保存未完成':capture.state==='ready'?'对话已保存':'部分内容已保存';$('asset-scope').disabled=false;
    const outcome=missing?'，'+missing+' 个未取得':'';
    box.textContent=(capture.state==='ready'?'已保存':capture.state==='partial'?'部分保存':capture.state==='interrupted'?'保存中断':capture.state==='cancelled'?'采集已取消':failed?'上次保存失败，旧快照仍保留':'待复查')+' · '+capture.snapshot.messages.length+' 条消息 · '+saved+' 个文件'+outcome+(excluded?' · '+excluded+' 个已排除':'')+(capture.lastError?' · '+explain(capture.lastError):'');
   }else{
    selectedId=capture?.id||null;$('capture-view').dataset.saved='false';$('capture-backup').hidden=true;$('capture-heading').textContent='保存这段对话';$('capture').className='primary full';$('capture').hidden=false;$('capture').textContent=capture?.state==='error'?'重试保存':'保存对话';$('continue').hidden=true;$('asset-scope').disabled=false;
    box.textContent=capture?.lastError?'保存未完成 · '+explain(capture.lastError):$('source').value?'':'请先打开一段 ChatGPT 对话';
   }
   return;
  }
  const items=await Promise.all(active.map(async r=>{
   const c=await S.get('captures',r.captureId),rows=await S.assets(r.captureId);
   return{r,c,saved:rows.filter(a=>a.state==='saved').length,excluded:rows.filter(a=>a.state==='excluded').length,missing:rows.filter(a=>a.state!=='saved'&&a.state!=='excluded').length};
  }));
  if(epoch!==runningEpoch)return;
  const signature=JSON.stringify(['active',items.map(({r,c,saved,excluded,missing})=>[r.captureId,r.phase,r.live,c?.state,c?.snapshot?.messages.length,saved,excluded,missing])]);
  if(signature===runningSignature)return;
  runningSignature=signature;
  $('capture').hidden=true;$('capture').disabled=true;$('continue').hidden=true;$('capture-view').dataset.saved='false';$('capture-backup').hidden=true;$('capture-heading').textContent='正在保存对话';$('asset-scope').disabled=true;
  const activeIds=items.map(x=>x.r.captureId).join('|');
  const displayedIds=[...box.querySelectorAll('.panel[data-capture-id]')].map(x=>x.dataset.captureId).join('|');
  if(activeIds!==displayedIds||box.className!=='running list'){
   box.replaceChildren();box.className='running list';
   for(const {r} of items){
    const el=node('div',null,'panel');el.dataset.captureId=r.captureId;
    el.append(node('strong','当前对话'),node('p','','hint capture-summary'));
    el.append(button('停止采集',async()=>{await call('tl:stop',{captureId:r.captureId});runningSignature=null;await renderRunning();status('采集已停止。');}));
    box.append(el);
   }
  }
  // Progress updates must not destroy and recreate buttons or their focused nodes.
  for(const {r,c,saved,excluded,missing} of items){
   const el=[...box.querySelectorAll('.panel[data-capture-id]')].find(x=>x.dataset.captureId===r.captureId);
   const title=c?.snapshot?.title||c?.title||'当前对话';
   const summary=(r.live?'实时缓存中':'采集中')+' · '+saved+' 个已保存'+(missing?' · '+missing+' 个待处理或未取得':'')+(excluded?' · '+excluded+' 个已排除':'')+(c?.lastError?' · '+explain(c.lastError):'');
   if(el.querySelector('strong').textContent!==title)el.querySelector('strong').textContent=title;
   if(el.querySelector('.capture-summary').textContent!==summary)el.querySelector('.capture-summary').textContent=summary;
  }
 }
 let archivePageEpoch=0,archiveCursor=null;
 const expandedHistoryIds=new Set();
 async function refreshArchives(append=false){
  const epoch=++archivePageEpoch,list=$('archives'),q=$('search').value.trim().toLowerCase(),page=await S.listCaptures({query:q,cursor:append?archiveCursor:null,limit:50});if(epoch!==archivePageEpoch)return;
  archiveCursor=page.nextCursor;const restoreFocus=preserveIdentityFocus(list);list.querySelector('.archive-more')?.remove();
  if(!append)list.replaceChildren();for(const c of page.items){const title=c.title;
   const row=node('div',null,'archive-select-row'),check=document.createElement('input');check.type='checkbox';check.checked=contextSelectedIds.has(c.id);check.disabled=!c.hasSnapshot;check.setAttribute('aria-label','将 '+title+' 加入上下文包');check.dataset.captureId=c.id;check.dataset.focusId='capture:'+c.id;check.dataset.focusRole='checkbox';check.addEventListener('change',()=>{check.checked?contextSelectedIds.add(c.id):contextSelectedIds.delete(c.id);updateContextButton();});
   const b=button('',()=>choose(c.id),'archive-button');b.dataset.focusId='capture:'+c.id;b.dataset.focusRole='open';b.setAttribute('aria-pressed',String(selectedId===c.id));b.append(node('strong',title),node('small',(labels[c.state]||'状态待确认')+' · '+String(c.updatedAt||c.createdAt).slice(0,16).replace('T',' ')));row.append(check,b);list.append(row);}
  if(archiveCursor)list.append(button('加载更多档案',()=>refreshArchives(true),'archive-more'));
  if(!list.children.length){
   if(q)list.append(node('p','没有匹配的本地档案，请调整关键词。','empty'));
   else{const empty=node('div',null,'archive-empty');empty.append(node('strong','还没有本地档案'),node('p','先保存一段已打开的 ChatGPT 对话，就能在这里搜索、备份和接续。'),button('去保存第一份',()=>{switchView('capture');$('source').focus();},'primary'));list.append(empty);}
  }
  $('detail').hidden=!page.items.length&&!append;updateContextButton();restoreFocus();
 }
 function updateContextButton(){$('build-context').disabled=contextSelectedIds.size===0||$('context-query').value.length>500;$('build-context').textContent=contextSelectedIds.size?'创建上下文包（'+contextSelectedIds.size+'）':'创建上下文包';}
 async function buildContextPackage(){
  C.check(contextSelectedIds.size>0,'INVALID_CONTEXT_SOURCES');C.check($('context-query').value.length<=500,'INVALID_CONTEXT_QUERY');status('正在校验所选档案并编译上下文。');
  const mode=$('context-mode').value,sources=[];for(const id of [...contextSelectedIds]){const capture=await S.get('captures',id);C.check(capture?.snapshot&&!['capturing','error'].includes(capture.state),'CONTEXT_SOURCE_NOT_READY');const rows=await S.passages(id),passages=mode==='messages'?[]:rows.filter(p=>contextSelectedPassageIds.has(p.passageId));sources.push({captureId:id,snapshot:capture.snapshot,activeNodes:selectedBranchNodes(capture),assetRows:await S.assets(id),passages});}
  const compiled=TLContext.compile(sources,{allBranches:$('context-all-branches').checked,includeSavedAssets:$('context-include-assets').checked,maxPartChars:Number($('context-part-size').value),query:$('context-query').value,tokenBudget:Number($('context-token-budget').value),passageMode:mode});
  const entries=[{name:'context_manifest.json',content:JSON.stringify(compiled.manifest,null,2)},{name:'context_index.md',content:compiled.index},...compiled.parts.map((part,i)=>({name:'context_part_'+String(i+1).padStart(3,'0')+'.md',content:part}))],included=new Set();
  for(const asset of compiled.assets){const path='assets/'+asset.sha256+'.bin';if(included.has(path))continue;const blob=await S.verifiedBlob(asset.sha256);entries.push({name:path,blob});included.add(path);}
  const zip=await A.buildZip(entries);await download(zip,'chatflow-context-'+new Date().toISOString().replace(/[:.]/g,'-')+'.zip');
  status('上下文包已生成：'+compiled.manifest.sources.length+' 份档案、'+compiled.manifest.sources.reduce((n,s)=>n+s.messageIds.length,0)+' 条消息、'+compiled.parts.length+' 个历史分段、估算 '+compiled.estimatedTokens+' tokens。'+(compiled.manifest.budgetExceeded?'已超过预算，内容已完整分段，请分批上传。':'')+'请核对清单后手动上传。');
 }
 async function choose(id){sourceLookupKey=null;sourceLookupCaptureId=null;
  if(selectedId!==id){
   selectedKeys.clear();reanchorPassageId=null;messageLimit=100;handoffId=null;planFingerprint=null;
   $('handoff-result').hidden=true;$('prepare').hidden=false;$('prepare').textContent='生成接续材料';
   $('open-target').disabled=true;$('open-target').hidden=false;
  }
  selectedId=id;
  if(!handoffId)await resumeHandoffForCapture(id);
  await renderDetail();await refreshArchives();await updateSelection();
 }
 function fileInput(text,onFile){const label=node('label',text,'file-button'),input=document.createElement('input');input.type='file';input.accept='.zip,application/zip';input.addEventListener('change',()=>guard(async()=>{const file=input.files?.[0];try{if(file)await onFile(file);}finally{input.value='';}}));label.append(input);return label;}
 async function download(blob,name){
  const url=URL.createObjectURL(blob),serial=++downloadStatusNonce,filename=C.safeName(name),label=$('download-status');
  const tell=value=>{if(serial===downloadStatusNonce)label.textContent=value;};
  tell('正在下载：'+filename);
  try{
   const id=await chrome.downloads.download({url,filename,saveAs:true});
   let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;chrome.downloads.onChanged.removeListener(listen);URL.revokeObjectURL(url);};
   const listen=async change=>{
    if(change.id!==id)return;
    if(change.state?.current==='complete'){
     let actual='';try{const records=await chrome.downloads.search({id});actual=String(records[0]?.filename||'').split(/[\\/]/).pop();}catch{}
     tell(actual&&actual!==filename?'下载完成，浏览器保存为：'+actual:'下载完成：'+filename);
     cleanup();
    }else if(change.error||change.state?.current==='interrupted'){tell('下载未完成：'+filename);cleanup();}
   };
   chrome.downloads.onChanged.addListener(listen);
   const current=(await chrome.downloads.search({id}))[0];if(current?.state==='complete')await listen({id,state:{current:'complete'}});
   setTimeout(async()=>{try{const item=(await chrome.downloads.search({id}))[0];if(item?.state!=='in_progress')cleanup();}catch{/* Browser may have closed; onChanged or page close still owns the URL */}},15*60*1000);return id;
  }catch(e){URL.revokeObjectURL(url);tell('下载未确认：'+filename);throw e;}
 }
 function clearPassageHighlights(){
  for(const color of ['yellow','green','blue','pink'])globalThis.CSS?.highlights?.delete('chatflow-saved-'+color);
 }
 function selectMessageWithKeyboard(event,pre,changed){
  const all=(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a';
  const extending=event.shiftKey&&!event.ctrlKey&&!event.metaKey&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key);
  if(!all&&!extending)return;
  const text=pre.firstChild,selection=window.getSelection();if(!(text instanceof Text)||!selection)return;
  event.preventDefault();
  let anchor=selection.anchorNode===text?selection.anchorOffset:0,focus=selection.focusNode===text?selection.focusOffset:anchor;
  if(all){anchor=0;focus=text.length;}
  else if(event.key==='Home')focus=0;
  else if(event.key==='End')focus=text.length;
  else if(event.key==='ArrowRight'){
   const width=/[\uD800-\uDBFF]/.test(text.data[focus]||'')&&/[\uDC00-\uDFFF]/.test(text.data[focus+1]||'')?2:1;
   focus=Math.min(text.length,focus+width);
  }else{
   const width=focus>1&&/[\uDC00-\uDFFF]/.test(text.data[focus-1]||'')&&/[\uD800-\uDBFF]/.test(text.data[focus-2]||'')?2:1;
   focus=Math.max(0,focus-width);
  }
  selection.setBaseAndExtent(text,anchor,text,focus);changed();
 }
 function pathToNode(snapshot,endNode){
  const path=[],seen=new Set();let current=endNode;
  while(current&&snapshot.nodes[current]&&!seen.has(current)){seen.add(current);path.unshift(current);current=snapshot.nodes[current].parent;}
  return path;
 }
 function branchChoices(snapshot){
  const byNode=new Map(snapshot.messages.map(m=>[m.nodeId,m])),candidates=[snapshot.currentNode,...Object.values(snapshot.nodes).filter(n=>!n.children?.length).map(n=>n.id)],seen=new Set(),out=[];
  for(const endNode of candidates){const path=pathToNode(snapshot,endNode),key=JSON.stringify(path);if(!path.length||snapshot.nodes[path[0]].parent!==null||seen.has(key)||!path.some(id=>byNode.has(id)))continue;seen.add(key);
   const last=[...path].reverse().map(id=>byNode.get(id)).find(Boolean),label=endNode===snapshot.currentNode?'当前分支':'分支 '+(out.length+1)+' · '+String(last?.text||'').slice(0,36);
   out.push({endNode,path,label});
  }
  return out;
 }
 function selectedBranchNodes(capture){
  const choices=branchChoices(capture.snapshot),selected=branchSelections.get(capture.id);
  return choices.find(x=>x.endNode===selected)?.path||capture.snapshot.active;
 }
 function verificationPanel(capture,assets,passages){
  const proof=TLEvidence.report({capture,assets,passages}),panel=node('section');panel.id='verification-report';
  panel.setAttribute('aria-label','\u4fdd\u5b58\u4e0e\u5907\u4efd\u8bc1\u636e');
  const local=labels[capture.state]||'状态待确认';
  const texts={not_checked:'\u672a\u6267\u884c',passed:'\u8be5\u7248\u672c\u6821\u9a8c\u901a\u8fc7',failed:'\u6821\u9a8c\u5931\u8d25',stale:'\u5386\u53f2\u7ed3\u679c\uff1b\u5f53\u524d\u5185\u5bb9\u5df2\u53d8\u5316'};
  const backup=proof.backup.state==='not_checked'?'\u5c1a\u672a\u751f\u6210\u5e76\u6821\u9a8c ZIP':texts[proof.backup.state];
  const restored=proof.restore.state==='not_checked'?(proof.imported?'\u5df2\u5bfc\u5165\uff1b\u5c1a\u65e0\u56de\u8bfb\u9a8c\u8bc1\u8bc1\u636e':'\u672a\u6267\u884c\u5bfc\u5165\u6062\u590d'):texts[proof.restore.state];
  for(const [key,title,text]of[['local','\u672c\u5730\u4fdd\u5b58',local],['backup','ZIP \u5907\u4efd\u6821\u9a8c',backup],['restore','\u5b9e\u9645\u6062\u590d\u56de\u8bfb',restored]]){
   const row=node('p',title+'\uff1a'+text,'hint');row.dataset.evidence=key;panel.append(row);
  }
  panel.append(node('p','\u4ec5\u6838\u67e5\u5df2\u53d6\u5f97\u7684\u53ef\u8bbf\u95ee\u5185\u5bb9\u3002ZIP \u6821\u9a8c\u4e0d\u4ee3\u8868\u5df2\u5bfc\u5165\uff0c\u4e5f\u4e0d\u4fdd\u8bc1\u6587\u4ef6\u5c06\u6765\u4e0d\u4f1a\u635f\u574f\u3002','hint'));
  const detail=node('details');detail.append(node('summary','\u6838\u67e5\u5177\u4f53\u7248\u672c\u4e0e\u6587\u4ef6\u54c8\u5e0c'),node('pre',JSON.stringify(proof,null,2)));panel.append(detail);return panel;
 }
 async function renderDetail(){
  const epoch=++detailEpoch,captureId=selectedId,c=captureId&&await S.get('captures',captureId);if(epoch!==detailEpoch||captureId!==selectedId)return;const host=$('detail'),restoreFocus=host.dataset.captureId===captureId?preserveIdentityFocus(host):()=>{},el=node('div');if(!c){el.append(node('p','请选择一个本地档案。','empty'));host.replaceChildren(el);clearPassageHighlights();return;}
  const title=c.snapshot?.title||c.title||'读取中';el.append(node('h2',title),node('p',(labels[c.state]||'状态待确认')+(c.live?' · 实时缓存开启':''),'state '+(c.state==='ready'?'good':'warn')));
  if(c.lastError)el.append(node('p',explain(c.lastError),'note'));
  if(!c.snapshot){el.append(node('p','尚未取得对话快照，请查看采集状态。','empty'));host.replaceChildren(el);clearPassageHighlights();return;}
  const snapshot=c.snapshot,rows=await S.assets(c.id),choices=branchChoices(snapshot),savedBranch=branchSelections.get(c.id),choice=choices.find(x=>x.endNode===savedBranch)||choices.find(x=>x.endNode===snapshot.currentNode)||choices[0],activeNodes=choice?.path||snapshot.active,source=node('a','打开源对话');source.href=C.chatUrl(snapshot.source.url).url;source.target='_blank';source.rel='noopener noreferrer';el.append(source);
  if(choices.length>1){const label=node('label','查看历史分支');label.htmlFor='archive-branch';const select=document.createElement('select');select.id='archive-branch';select.setAttribute('aria-label','选择历史分支');for(const item of choices)select.add(new Option(item.label,item.endNode));select.value=choice.endNode;select.addEventListener('change',async()=>{branchSelections.set(c.id,select.value);messageLimit=100;reanchorPassageId=null;invalidate();await renderDetail();});el.append(label,select);}
  const proofPassages=await S.passages(c.id);el.append(verificationPanel(c,rows,proofPassages));
  const savedCount=rows.filter(a=>a.state==='saved').length,excludedCount=rows.filter(a=>a.state==='excluded').length,missingCount=rows.filter(a=>a.state!=='saved'&&a.state!=='excluded').length;el.append(node('p',snapshot.messages.length+' 条消息 · '+savedCount+' 个文件已保存'+(missingCount?' · '+missingCount+' 个未取得':'')+(excludedCount?' · '+excludedCount+' 个已排除':''),'hint'));if(c.saveScope==='last_generated')el.append(node('p','保存范围：最后生成文件','hint'));
  const busy=c.state==='capturing'||c.live||rows.some(a=>a.state==='downloading'),backup=button(busy?'下载完成后可备份':missingCount?'备份已保存的内容':'下载归档 ZIP',async()=>{backup.disabled=true;try{status('正在校验备份可恢复性…');const out=await A.exportVerified(c.id);await download(out.blob,C.safeName(title)+'.chatflow.zip');status('备份已通过恢复校验，已发起下载。');}finally{backup.disabled=busy;if(selectedId===c.id)await renderDetail();}});backup.disabled=busy;
  const next=c.state==='error'?button('返回保存页重试',()=>{switchView('capture');guard(renderRunning);},'primary'):button('继续到新对话',()=>{switchView('handoff');},'primary');next.disabled=c.state==='capturing';
  const actions=node('div',null,'actions');actions.append(next,backup,fileInput('对照官方 ZIP',async file=>{status('正在本地读取官方导出，未识别格式不会被当作文件不存在。');const report=await A.compareOfficial(c.id,file);await download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),'official-comparison.json');status('对照完成：'+report.records.filter(x=>x.result==='bytes_match').length+'/'+report.records.length+' 个文件字节一致。详情见下载报告。');}));
  if(c.live)actions.append(button('停止实时缓存',async()=>{await call('tl:stop',{captureId:c.id});await renderDetail();}));
  el.append(actions);
  if(snapshot.integrity.issues.length){
   const issueLabels={INVALID_NODE:'存在无法读取的对话节点',DUPLICATE_CHILD:'存在重复的分支关系',
    DUPLICATE_MESSAGE_ID:'消息编号重复',BROKEN_PARENT:'部分回复的上级节点缺失',
    PARENT_CHILD_MISMATCH:'上级和下级的分支关系不一致',
    CHILD_PARENT_MISMATCH:'子节点和上级的分支关系不一致',
    PARENT_CYCLE:'分支关系出现循环',MISSING_CURRENT_NODE:'无法确认归档时所在的分支',
    UNREACHABLE_NODE:'部分消息不属于可访问的分支',
    CONTENT_REFERENCE_LIMIT:'引用信息超出可核验范围',
    UNRESOLVED_CONTENT_REFERENCE:'部分内容引用无法对应有效来源'};
   const box=node('section',null,'integrity-summary');
   box.append(node('strong','发现 '+snapshot.integrity.issues.length+' 项分支或内容完整性问题'));
   const list=node('ul');
   for(const issue of snapshot.integrity.issues.slice(0,30))
    list.append(node('li',issueLabels[issue.code]||'有一项结构或引用问题尚无法自动解释'));
   box.append(list);
   if(snapshot.integrity.issues.length>30)box.append(node('p','另有 '+(snapshot.integrity.issues.length-30)+' 项，请展开技术详情查看。','hint'));
   const detail=node('details');detail.append(node('summary','查看技术详情'),node('pre',JSON.stringify(snapshot.integrity.issues,null,2)));
   box.append(detail);el.append(box);
  }
  el.append(node('h3','选择本次接续需要的原始文件'));
  const fileDetails=node('details');fileDetails.append(node('summary','选择要带到新聊天的原始附件'));
  const fileList=node('div',null,'list');
  if(!rows.length)fileList.append(node('p','这份可访问快照中没有识别到文件引用。','hint'));
  for(const a of rows){
   const row=node('div',null,'file-row'),check=document.createElement('input');check.type='checkbox';check.disabled=a.state!=='saved';check.checked=selectedKeys.has(a.key);check.setAttribute('aria-label','选择 '+a.name);check.dataset.assetKey=a.key;
   check.addEventListener('change',()=>{check.checked?selectedKeys.add(a.key):selectedKeys.delete(a.key);guard(updateSelection);invalidate();});
   const origin=a.origin==='assistant_generated'||(!a.origin&&a.kind==='generated')?'助手生成':a.origin==='user_uploaded'?'用户上传':'来源未确认';const info=node('div');info.append(node('strong',a.name),node('span',labels[a.state]||'状态待确认','state '+(a.state==='saved'?'good':'warn')),node('small',origin+(a.state==='saved'?' · '+bytes(a.size):'')));
   if(a.reason)info.append(node('p',explain(a.reason),'hint'));
   if(a.state==='saved'){const buttons=node('div',null,'actions');buttons.append(button('下载原件',async()=>download(await S.verifiedBlob(a.sha256),a.name)));info.append(buttons);const d=node('details');d.append(node('summary','文件信息'),node('pre','SHA-256: '+a.sha256+'\nMIME: '+a.mime+'\n消息: '+a.messageId));info.append(d);}
   row.append(check,info);fileList.append(row);
  }
  fileDetails.append(fileList);el.append(fileDetails);
  const passageRows=proofPassages,passageSection=node('section',null,'passage-section');
  passageSection.append(node('h3','重点片段（'+passageRows.length+'）'));
  if(!passageRows.length)passageSection.append(node('p','在历史消息中选中一段文字，即可保存为重点片段。','hint'));
  const passageStates=new Map();
  for(const passage of passageRows){
   const resolved=TLPassages.resolve(passage,snapshot);passageStates.set(passage.passageId,resolved);
   if(passage.status!==resolved.status)await S.updatePassageStatus(passage.passageId,resolved.status,resolved.reason);
   const row=node('div',null,'passage-row'),check=document.createElement('input');check.type='checkbox';check.checked=contextSelectedPassageIds.has(passage.passageId);check.disabled=resolved.status!=='anchored';check.setAttribute('aria-label','将重点片段加入上下文：'+passage.text.slice(0,60));
   check.dataset.focusId='passage:'+passage.passageId;check.dataset.focusRole='checkbox';
   check.addEventListener('change',()=>{check.checked?contextSelectedPassageIds.add(passage.passageId):contextSelectedPassageIds.delete(passage.passageId);});
   const sourceChoice=choices.find(x=>x.path.includes(passage.nodeId));
   const info=node('div');info.append(node('strong',passage.text),node('small',(resolved.status==='anchored'?'已定位':resolved.status==='ambiguous'?'定位有歧义':'来源已变化')+(sourceChoice?' · '+sourceChoice.label:'')));
   const controls=node('div',null,'actions'),colorSelect=document.createElement('select');
   colorSelect.setAttribute('aria-label','重点片段颜色');colorSelect.dataset.focusId='passage:'+passage.passageId;colorSelect.dataset.focusRole='color';
   for(const color of ['yellow','green','blue','pink']){const option=new Option(({yellow:'黄色',green:'绿色',blue:'蓝色',pink:'粉色'})[color],color);colorSelect.add(option);}
   colorSelect.value=passage.color||'yellow';colorSelect.addEventListener('change',()=>guard(async()=>{const previous=passage.color||'yellow',next=colorSelect.value;try{C.check(await S.updatePassageColor(passage.passageId,next),'PASSAGE_NOT_FOUND');}catch(error){colorSelect.value=previous;throw error;}await renderDetail();}));
   controls.append(colorSelect);
   if(resolved.status!=='anchored'&&sourceChoice&&!activeNodes.includes(passage.nodeId))controls.append(button('切换到来源分支',async()=>{branchSelections.set(c.id,sourceChoice.endNode);messageLimit=100;reanchorPassageId=null;invalidate();await renderDetail();status('已切换到重点片段来源分支，请重新定位。');}));
   if(resolved.status!=='anchored'&&snapshot.messages.some(m=>m.id===passage.messageId&&m.nodeId===passage.nodeId)&&activeNodes.includes(passage.nodeId))controls.append(button('重新选择片段',async()=>{
    reanchorPassageId=passage.passageId;expandedHistoryIds.add(c.id);messageLimit=Math.max(messageLimit,activeNodes.indexOf(passage.nodeId)+1);
    await renderDetail();status('请在原始消息中重新选中文字，再点击“更新重点片段”。');
   }));
   if(resolved.status==='anchored')controls.append(button('跳转原文',async()=>{
    let targetPath=activeNodes;
    if(!targetPath.includes(passage.nodeId)){
     const targetChoice=choices.find(x=>x.path.includes(passage.nodeId));
     if(!targetChoice){status('该片段来源节点不在当前可访问分支中。',true);return;}
     branchSelections.set(c.id,targetChoice.endNode);targetPath=targetChoice.path;
    }
    const index=targetPath.indexOf(passage.nodeId);expandedHistoryIds.add(c.id);messageLimit=Math.max(messageLimit,index+1);
    invalidate();await renderDetail();const target=[...$('detail').querySelectorAll('.message')].find(e=>e.dataset.messageId===passage.messageId&&e.dataset.nodeId===passage.nodeId);target?.scrollIntoView({behavior:'smooth',block:'center'});
   }));
   controls.append(button('删除片段',async()=>{await S.deletePassage(passage.passageId);contextSelectedPassageIds.delete(passage.passageId);await renderDetail();}));
   info.append(controls);row.append(check,info);passageSection.append(row);
  }
  el.append(passageSection);
  // Do not build hundreds of message elements unless the user explicitly
  // expands history. Rebuild only for the selected archive on demand.
  const historyOpen=expandedHistoryIds.has(c.id),d=node('details');
  d.open=historyOpen;d.dataset.archiveHistory='true';
  d.append(node('summary',(historyOpen?'收起':'查看')+'历史消息（'+activeNodes.length+' 条）'));
  d.addEventListener('toggle',()=>{if(!d.isConnected||d.open===expandedHistoryIds.has(c.id))return;
   if(d.open)expandedHistoryIds.add(c.id);else expandedHistoryIds.delete(c.id);
   guard(renderDetail);
  });
  const byNode=new Map(snapshot.messages.map(m=>[m.nodeId,m])),messages=activeNodes.map(n=>byNode.get(n)).filter(Boolean),messageElements=new Map(),rangesByColor=new Map();
  for(const color of ['yellow','green','blue','pink'])rangesByColor.set(color,[]);
  if(historyOpen)for(const [index,m] of messages.slice(0,messageLimit).entries()){
   const block=node('div',null,'message');block.dataset.messageId=m.id;block.dataset.nodeId=m.nodeId;
   block.append(node('strong',({user:'我',assistant:'ChatGPT',system:'系统消息',tool:'工具结果'}[m.role]||'历史消息')+' · 第 '+(index+1)+' 条'));
   const pre=node('pre',m.text||'（仅附件）');pre.dataset.messageText='true';pre.dataset.focusId='message:'+m.nodeId;pre.dataset.focusRole='text';pre.tabIndex=0;pre.setAttribute('aria-label','历史消息正文，可用键盘选择文字并保存重点片段');block.append(pre);
   let pending=null;const save=button('保存选中片段',async()=>{
    C.check(pending,'PASSAGE_SELECTION_REQUIRED');
    const prior=reanchorPassageId?passageRows.find(p=>p.passageId===reanchorPassageId):null;
    C.check(!prior||(prior.messageId===m.id&&prior.nodeId===m.nodeId),'PASSAGE_REANCHOR_SOURCE_MISMATCH');
    const now=Date.now(),record=TLPassages.create({passageId:prior?.passageId,captureId:c.id,snapshot,message:m,text:pending.text,startOffset:pending.startOffset,endOffset:pending.endOffset,createdAt:prior?.createdAt??now,updatedAt:now,reanchoredAt:prior?now:null,previousMessageHash:prior?.messageHash||null,originPassageId:prior?.originPassageId||null,color:prior?.color||'yellow'});
    await S.putPassage(record);pending=null;reanchorPassageId=null;save.hidden=true;window.getSelection()?.removeAllRanges();await renderDetail();status(prior?'重点片段已在原始消息内重新定位。':'重点片段已保存，并绑定到原始消息与分支。');
   },'passage-save');save.hidden=true;block.append(save);
   const updatePending=()=>{
    const selection=window.getSelection();if(!selection||selection.isCollapsed||selection.rangeCount!==1){pending=null;save.hidden=true;return;}
    const range=selection.getRangeAt(0);if(!pre.contains(range.commonAncestorContainer)){pending=null;save.hidden=true;return;}
    const before=document.createRange();before.selectNodeContents(pre);try{before.setEnd(range.startContainer,range.startOffset);}catch{pending=null;save.hidden=true;return;}
    const text=range.toString(),startOffset=before.toString().length,endOffset=startOffset+text.length;
    if(!text.trim()||m.text.slice(startOffset,endOffset)!==text){pending=null;save.hidden=true;return;}
    pending={text,startOffset,endOffset};save.textContent=reanchorPassageId?'更新重点片段':'保存选中片段';save.hidden=false;
   };
   pre.addEventListener('keydown',event=>selectMessageWithKeyboard(event,pre,updatePending));
   pre.addEventListener('mouseup',updatePending);pre.addEventListener('pointerup',updatePending);pre.addEventListener('keyup',updatePending);
   d.append(block);messageElements.set(m.id+'\u0000'+m.nodeId,pre);
  }
  for(const passage of passageRows){
   const resolved=passageStates.get(passage.passageId);if(resolved?.status!=='anchored')continue;
   const pre=messageElements.get(passage.messageId+'\u0000'+passage.nodeId),textNode=pre?.firstChild;
   const start=resolved.startOffset??resolved.start,end=resolved.endOffset??resolved.end;
   if(!(textNode instanceof Text)||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end>textNode.length)continue;
   const range=document.createRange();range.setStart(textNode,start);range.setEnd(textNode,end);
   rangesByColor.get(passage.color||'yellow')?.push(range);
  }
  if(epoch!==detailEpoch||captureId!==selectedId)return;
  const registry=globalThis.CSS?.highlights;
  if(registry&&typeof globalThis.Highlight==='function'){
   for(const color of ['yellow','green','blue','pink']){const name='chatflow-saved-'+color;registry.delete(name);const ranges=rangesByColor.get(color)||[];if(ranges.length)registry.set(name,new Highlight(...ranges));}
  }
  if(historyOpen&&messages.length>messageLimit)d.append(button('再显示 100 条',async()=>{messageLimit+=100;await renderDetail();}));el.append(d);
  el.append(button('删除此本地档案',async()=>{if(!confirm('仅删除扩展中的这份本地档案，不会删除 ChatGPT 对话。尚未导出 ZIP 的文件可能失去本地副本。确认删除？'))return;await call('tl:stop',{captureId:c.id});for(const passage of await S.passages(c.id))contextSelectedPassageIds.delete(passage.passageId);await S.removeCapture(c.id);contextSelectedIds.delete(c.id);branchSelections.delete(c.id);expandedHistoryIds.delete(c.id);selectedId=null;selectedKeys.clear();reanchorPassageId=null;detailEpoch++;host.replaceChildren(node('p','本地档案已删除。'));clearPassageHighlights();await refreshArchives();await quota();},'danger'));
  if(epoch===detailEpoch&&captureId===selectedId){host.replaceChildren(el);host.dataset.captureId=captureId;restoreFocus();}
 }
 async function updateSelection(){const c=selectedId&&await S.get('captures',selectedId),rows=c?.snapshot?await S.assets(c.id):[],excluded=rows.filter(a=>a.state==='excluded').length,missing=rows.filter(a=>a.state!=='saved'&&a.state!=='excluded').length;$('handoff-source').textContent=c?.snapshot?'来源：'+c.snapshot.title:'先在本地档案中选择来源。';$('selection-summary').textContent=(selectedKeys.size?'已选 '+selectedKeys.size+' 个原始文件；':'历史文件将自动准备。')+(missing?' '+missing+' 个文件未取得。':'')+(excluded?' '+excluded+' 个按范围排除。':'');$('prepare').disabled=!c?.snapshot||['capturing','error'].includes(c.state)||$('instructions').value.length>4000;}
 async function prepare(){
  const frozenFingerprint=fingerprint();
  C.check(selectedId,'CAPTURE_NOT_READY');C.check($('instructions').value.length<=4000,'HANDOFF_INSTRUCTIONS_TOO_LONG');
  const previous=handoffId&&await S.get('handoffs',handoffId);
  const same=previous&&planFingerprint===frozenFingerprint;
  if(same&&['injection_blocked','partial_injection'].includes(previous.state)){
   if(!window.confirm('旧标签页可能仍保留完整草稿和附件。请先使用“查看新聊天”核对。若仍打开，系统将拒绝重试；请妥善保存内容并关闭旧标签页后再试。不会自动清除、重传或发送。确认已核对？'))return;
  }
  status('正在校验接续文件。');
  const capture=await S.get('captures',selectedId);C.check(capture?.snapshot,'CAPTURE_NOT_READY');
  const h=await call('tl:prepareHandoff',{captureId:selectedId,activeNodes:selectedBranchNodes(capture),keys:[...selectedKeys],
   instructions:$('instructions').value,batchLimit:Number($('batch-limit').value),
   retryBlocked:!!(same&&previous?.state==='injection_blocked')});
  if(fingerprint()!==frozenFingerprint){status('准备期间接续选项已经变化，请核对后重新准备。',true);return;}
  const bound={...h,resumeForm:{fingerprint:frozenFingerprint,selectedKeys:[...selectedKeys],
   branchEndNode:branchSelections.get(selectedId)||null,instructions:$('instructions').value,
   batchLimit:Number($('batch-limit').value)}};
  await S.set('handoffs',bound);
  handoffId=bound.id;planFingerprint=frozenFingerprint;await rememberHandoff(bound);
  await renderHandoff(bound);await refreshResumeButton();
  status('接续包已准备。将只在新的普通聊天中操作，发送由你完成。');
 }
 async function renderHandoff(h){
  $('handoff-result').hidden=false;$('prepare').hidden=true;$('staging-details').open=false;$('manual-handoff').open=false;$('manual-copy-status').textContent='';$('prompt').textContent=h.prompt;$('confirmed').checked=false;$('open-target').disabled=h.state!=='prepared';$('focus-target').disabled=!h.targetTabId;
  const box=$('staging');box.replaceChildren();staged=new Map();
  for(let batch=0;batch<h.batches.length;batch++){
   box.append(node('h3','第 '+(batch+1)+' 批（'+h.batches[batch].length+' 个文件）'));
   for(const i of h.batches[batch]){const f=h.files[i],blob=await S.verifiedBlob(f.sha256),file=new File([blob],f.uploadName||f.name,{type:f.mime});staged.set(i,file);
    const row=node('div',null,'staged');row.draggable=true;row.append(node('strong',file.name),node('small',bytes(file.size)+' · '+(f.kind==='history'?'历史记录':f.kind==='index'?'接续索引':'原始附件')));
    row.addEventListener('dragstart',e=>{try{e.dataTransfer.items.add(file);e.dataTransfer.effectAllowed='copy';}catch{status('此浏览器未允许跨页文件拖拽，请使用下载后手动上传。',true);}});
    row.append(button('下载文件',()=>download(file,file.name)));const evidenceLabel=node('small');evidenceLabel.dataset.fileEvidence=String(i);row.append(evidenceLabel);
    const verify=button('\u6807\u8bb0\u4e3a\u5df2\u4eba\u5de5\u6838\u5bf9',async()=>{C.check(window.confirm('\u786e\u8ba4\u4f60\u5df2\u5728\u76ee\u6807\u9875\u9762\u6838\u5bf9\u8fd9\u4e2a\u6587\u4ef6\uff1f\u8fd9\u4e0d\u4ee3\u8868\u6a21\u578b\u5df2\u8bfb\u53d6\u3002'),'USER_CONFIRMATION_REQUIRED');await call('tl:confirmFile',{id:h.id,index:i,confirmed:true});await renderHandoffState();});verify.dataset.verifyFile=String(i);row.append(verify);box.append(row);
   }
   const indices=h.batches[batch];box.append(button('下载第 '+(batch+1)+' 批',async()=>download(await A.buildZip(indices.map(i=>({name:staged.get(i).name,blob:staged.get(i)}))),'handoff-batch-'+(batch+1)+'.zip')));
  }
  if(h.missing.length)box.append(node('p','原档案仍有 '+h.missing.length+' 个文件不可用，未作为空附件注入。','note'));if(h.excluded?.length)box.append(node('p','原档案按保存范围跳过 '+h.excluded.length+' 个文件；如需这些文件，请重新保存全部文件。','note'));
  await renderHandoffState();
 }
 async function renderHandoffState(){
  if(!handoffId)return;const h=await S.get('handoffs',handoffId);if(!h)return;
  const source=await S.get('captures',h.captureId),snapshotMatches=!!source?.snapshot&&TLPassages.snapshotHash(source.snapshot)===h.snapshotHash,branchMatches=!!source?.snapshot&&JSON.stringify(selectedBranchNodes(source))===JSON.stringify(h.branchNodeIds||[]);
  const fresh=snapshotMatches&&branchMatches;
  const fileLabels={prepared:'\u672c\u5730\u5b57\u8282\u5df2\u6821\u9a8c\uff0c\u672a\u786e\u8ba4\u4ea4\u7ed9\u7f51\u9875',offered:'\u5df2\u5c1d\u8bd5\u4ea4\u7ed9\u7f51\u9875',page_ready:'\u7f51\u9875\u66fe\u663e\u793a\u5c31\u7eea\uff08\u4ec5\u9875\u9762\u89c2\u5bdf\uff09',unknown:'网页未提供足够证据，无法自动确认（附件名可能截断）。请在新聊天人工核对',user_checked:'\u7528\u6237\u5df2\u6838\u5bf9\uff08\u4e0d\u4ee3\u8868\u5df2\u53d1\u9001\uff09',legacy_unverified:'\u65e7\u8bb0\u5f55\u65e0\u9010\u6587\u4ef6\u8bc1\u636e'};
  for(const label of $('staging').querySelectorAll('[data-file-evidence]')){const index=Number(label.dataset.fileEvidence),proof=TLEvidence.fileReport(h,index);label.textContent=fileLabels[proof.state]+(proof.observedAt?' \u00b7 '+new Date(proof.observedAt).toLocaleString():'');label.dataset.evidenceState=proof.state;}
  for(const control of $('staging').querySelectorAll('[data-verify-file]')){
   const checked=TLEvidence.fileReport(h,Number(control.dataset.verifyFile)).state==='user_checked';
   control.disabled=checked||!fresh||!h.targetTabId||!['upload_unknown','upload_confirmed','draft_prepared','partial_injection','user_verified_upload'].includes(h.state);
   control.textContent=checked?'\u5df2\u4eba\u5de5\u6838\u5bf9':'\u6807\u8bb0\u4e3a\u5df2\u4eba\u5de5\u6838\u5bf9';
  }

  const blocked=['injection_blocked','partial_injection'].includes(h.state);
  const reason=h.lastError?(Object.hasOwn(errors,h.lastError)?errors[h.lastError]:blocked?'无法确认具体原因，请先检查目标聊天并手动继续。':explain(h.lastError)):'';
  const message=(labels[h.state]||'状态待确认')+(reason?' · '+reason:'')+(h.batches.length>1?'；还有 '+(h.batches.length-1)+' 批待手动上传':'')+(!fresh?'；来源已变化，请重新准备':'');if($('handoff-state').textContent!==message)$('handoff-state').textContent=message;
  const recovery=$('handoff-recovery');
  recovery.hidden=!blocked;
  if(blocked)$('manual-handoff').open=true;
  recovery.textContent=!blocked?'':h.state==='partial_injection'?
   '草稿或部分附件可能已经进入新聊天。先点击“查看新聊天”核对，避免重复上传；再用“下载全部接续文件”手动补齐缺失内容。不会自动重试或发送。':
   '本次自动预填未完成确认。先点击“查看新聊天”核对已有草稿与附件，再用“下载全部接续文件”手动继续。不会自动重试或发送。';
  const ready=h.state==='prepared'&&planFingerprint===fingerprint()&&fresh;
  $('prepare').hidden=ready;
  $('prepare').textContent='重新生成接续材料';
  $('open-target').disabled=!ready;
  $('open-target').hidden=!ready;
  $('focus-target').disabled=!h.targetTabId;
  const mayConfirm=fresh&&['upload_unknown','upload_confirmed','draft_prepared','partial_injection'].includes(h.state);
  $('confirm-upload').dataset.allowed=String(mayConfirm);
  $('confirm-upload').disabled=!mayConfirm||!$('confirmed').checked;
 }
 // Copy only the selected, source-validated prepared prompt. Never paste into
 // ChatGPT or overwrite a destination draft; the browser owns the clipboard.
 async function copyHandoffPrompt(){
  C.check(handoffId,'HANDOFF_NOT_PREPARED');
  const h=await S.get('handoffs',handoffId),source=h&&await S.get('captures',h.captureId);
  C.check(h?.prompt&&h.prompt===$('prompt').textContent,'HANDOFF_NOT_PREPARED');
  C.check(source?.snapshot&&TLPassages.snapshotHash(source.snapshot)===h.snapshotHash&&JSON.stringify(selectedBranchNodes(source))===JSON.stringify(h.branchNodeIds||[]),'HANDOFF_SOURCE_CHANGED');
  const label=$('manual-copy-status');
  try {
   if(!navigator.clipboard?.writeText)throw new Error('CLIPBOARD_UNAVAILABLE');
   await navigator.clipboard.writeText(h.prompt);
   label.textContent='已复制接续提示。请在新聊天粘贴，并核对文件后手动发送。';
  }catch {
   // A denied clipboard write must never look successful. Give a standard,
   // selectable DOM fallback even when the native clipboard API is disabled.
   const prompt=$('prompt');prompt.closest('details').open=true;
   const range=document.createRange(),selection=window.getSelection();
   C.check(selection,'CLIPBOARD_UNAVAILABLE');
   range.selectNodeContents(prompt);selection.removeAllRanges();selection.addRange(range);
   prompt.scrollIntoView({block:'nearest'});
   label.textContent='浏览器未允许自动复制。已选中接续提示，请按 Ctrl+C 复制；仍需手动粘贴并核对附件。';
  }
 }
 async function downloadHandoff(){
  C.check(handoffId,'HANDOFF_NOT_PREPARED');const h=await S.get('handoffs',handoffId),source=await S.get('captures',h.captureId);C.check(source?.snapshot&&TLPassages.snapshotHash(source.snapshot)===h.snapshotHash&&JSON.stringify(selectedBranchNodes(source))===JSON.stringify(h.branchNodeIds||[]),'HANDOFF_SOURCE_CHANGED');const entries=[];
  for(let b=0;b<h.batches.length;b++)for(const i of h.batches[b]){const f=h.files[i];entries.push({name:'batch-'+String(b+1).padStart(3,'0')+'/'+C.safeName(f.uploadName||f.name),blob:await S.verifiedBlob(f.sha256)});}
  entries.push({name:'handoff_prompt.md',content:h.prompt},{name:'handoff_manifest.json',content:JSON.stringify({schema:1,captureId:h.captureId,sourceConversationId:h.sourceConversationId,snapshotHash:h.snapshotHash,branchNodeIds:h.branchNodeIds||[],files:h.files,batches:h.batches,missing:h.missing,excluded:h.excluded||[],note:'A prepared pack is not proof of webpage upload or model reading.'},null,2)});
  await download(await A.buildZip(entries),'chatflow-handoff.zip');status('接续包已生成。请解压后上传实际文件，不要假设 ChatGPT 一定能读取 ZIP 内的全部内容。');
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;e.preventDefault();switchView(b.dataset.view);});
 globalThis.ChatFlowWorkspace=Object.freeze({show:switchView,resume:resumeLatestHandoff});
 $('capture-backup').onclick=()=>guard(async()=>{const captureId=selectedId;C.check(captureId,'CAPTURE_NOT_READY');const control=$('capture-backup');control.disabled=true;try{const capture=await S.get('captures',captureId),title=capture?.snapshot?.title||'ChatFlow';status('正在校验备份可恢复性…');const out=await A.exportVerified(captureId);await download(out.blob,C.safeName(title)+'.chatflow.zip');status('已为「'+title+'」生成备份并发起下载。');}finally{control.disabled=control.dataset.busy==='true';}});
 function singleFlight(id,fn){let pending=false;return ()=>guard(async()=>{if(pending)return;const control=$(id);pending=true;control.dataset.pending='true';const original=control.textContent;control.disabled=true;control.textContent='处理中…';try{return await fn();}finally{pending=false;delete control.dataset.pending;control.textContent=original;if(id==='prepare'){control.disabled=!selectedId||$('instructions').value.length>4000;}else if(id==='open-target'||id==='confirm-upload'){if(handoffId)await renderHandoffState().catch(e=>status(explain(e),true));}else control.disabled=false;}});}
 $('refresh-source').onclick=singleFlight('refresh-source',async()=>{await sources();selectedId=null;guard(renderRunning);});$('capture').onclick=()=>guard(start);$('source').onchange=()=>{selectedId=null;sourceLookupKey=null;sourceLookupCaptureId=null;$('capture').hidden=false;$('capture').textContent='保存对话';$('continue').hidden=true;guard(renderRunning);};$('asset-scope').onchange=()=>{selectedId=null;sourceLookupKey=null;sourceLookupCaptureId=null;updateScopeUI();guard(renderRunning);};$('continue').onclick=()=>guard(async()=>{await choose(selectedId);switchView('handoff');});$('refresh').onclick=singleFlight('refresh',async()=>{await refreshArchives();if(selectedId)await renderDetail();});$('build-context').onclick=singleFlight('build-context',buildContextPackage);
 let searchTimer;$('search').oninput=()=>{clearTimeout(searchTimer);archivePageEpoch++;searchTimer=setTimeout(()=>guard(refreshArchives),150);};$('prepare').onclick=singleFlight('prepare',prepare);$('instructions').oninput=invalidate;$('batch-limit').onchange=invalidate;
 function boundedInput(id,limit,onValidityChange){
  const input=$(id),notice=node('p','','hint');notice.id=id+'-length-notice';notice.setAttribute('role','status');notice.hidden=true;input.after(notice);input.setAttribute('aria-describedby',notice.id);let invalid=false;
  input.addEventListener('input',()=>{const excess=input.value.length-limit,next=excess>0;notice.hidden=!next;notice.textContent=next?'超出 '+excess.toLocaleString()+' 个字符；全文已保留，请缩短后继续。':'';input.setCustomValidity(next?notice.textContent:'');input.setAttribute('aria-invalid',String(next));if(next!==invalid){invalid=next;onValidityChange(next);}});
 }
 boundedInput('context-query',500,updateContextButton);boundedInput('instructions',4000,invalid=>{if(invalid)$('prepare').disabled=true;else guard(updateSelection);});
 $('restore').onchange=()=>guard(async()=>{const input=$('restore'),f=input.files?.[0];if(!f)return;status('正在检查备份…');try{const restored=await A.restoreVerified(f);await choose(restored.id);switchView('archive');status(restored.verified?'档案已导入并通过数据库回读校验。':explain(new Error(restored.code||'RESTORE_READBACK_FAILED')),!restored.verified);await quota();}finally{input.value='';}});
 $('open-target').onclick=singleFlight('open-target',async()=>{C.check(planFingerprint===fingerprint(),'REGENERATE_HANDOFF_AFTER_CHANGES');const h=await S.get('handoffs',handoffId),source=await S.get('captures',h.captureId);C.check(source?.snapshot&&TLPassages.snapshotHash(source.snapshot)===h.snapshotHash&&JSON.stringify(selectedBranchNodes(source))===JSON.stringify(h.branchNodeIds||[]),'HANDOFF_SOURCE_CHANGED');const context=await currentWorkspaceWindow();await call('tl:openHandoff',{id:handoffId,...context});await renderHandoffState();status('新聊天已打开。请核对文件，再由你手动发送。');});
 $('focus-target').onclick=()=>guard(()=>call('tl:focusTarget',{id:handoffId}));$('download-handoff').onclick=()=>guard(downloadHandoff);
 $('copy-handoff-prompt').onclick=()=>guard(copyHandoffPrompt);
 $('confirmed').addEventListener('change',()=>{$('confirm-upload').disabled=!$('confirmed').checked||$('confirm-upload').dataset.allowed!=='true';});
 $('confirm-upload').onclick=singleFlight('confirm-upload',async()=>{C.check($('confirmed').checked,'USER_CONFIRMATION_REQUIRED');await call('tl:confirmUpload',{id:handoffId,confirmed:true});await renderHandoffState();status('已记录首批上传的人工核对。未代你发送消息，也未认证模型已完整读取。');});
 $('persist').onclick=()=>guard(async()=>{const yes=await navigator.storage.persist();status(yes?'浏览器已允许保留本地存储。仍建议下载独立 ZIP。':'浏览器未授予持久化存储。请保留独立 ZIP 备份。');await quota();});
 setInterval(()=>{if(refreshing||document.hidden)return;refreshing=true;Promise.resolve().then(async()=>{if(view==='capture')await renderRunning();if(view==='handoff'&&handoffId)await renderHandoffState();}).catch(e=>TLDiagnostics.record('workspace-refresh',e)).finally(()=>refreshing=false);},3000);
 // A browser may surface the ChatGPT tab after the workspace first loads.
 // Do not require a manual refresh, and never wipe a user's current selection.
 const syncSources=()=>guard(async()=>{const prior=sourceOptionsSignature;await sources();if(view==='capture'){if(prior!==sourceOptionsSignature)runningSignature=null;await renderRunning();}});
 // Navigation can change a tab URL without refocusing this panel. Keep the
 // visible source URLs current while preserving an explicit user selection.
 let sourceSyncTimer=null;
 function scheduleSourceSync(){
  clearTimeout(sourceSyncTimer);
  sourceSyncTimer=setTimeout(()=>{sourceSyncTimer=null;syncSources();},120);
 }
 chrome.tabs.onUpdated.addListener((_tabId,change)=>{
  if(view==='capture'&&(change.url||change.status==='complete'))scheduleSourceSync();
 });
 chrome.tabs.onRemoved.addListener(()=>{if(view==='capture')scheduleSourceSync();});
 setTimeout(syncSources,1200);setTimeout(syncSources,4200);
 window.addEventListener('focus',syncSources);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncSources();});
 async function initializeWorkspace(){
  await S.open();updateScopeUI();
  const failed=[];
  for(const [label,task] of [['来源对话',sources],['当前采集',renderRunning],['本地档案',refreshArchives],['上下文选项',updateContextButton],['存储配额',quota],['接续来源',updateSelection]]){
   try{await task();}catch{failed.push(label);}
  }
  if(failed.length){$('retry-workspace').hidden=false;status('工作区部分初始化失败（'+failed.join('、')+'），已保留可用数据；可点击重试。',true);return false;}
  await refreshResumeButton().catch(()=>{});
  status('');return true;
 }
 $('retry-workspace').onclick=()=>guard(async()=>{const button=$('retry-workspace');if(button.disabled)return;button.disabled=true;try{await S.open();await call('tl:retryBoot');const ready=await initializeWorkspace();if(ready){button.hidden=true;status('工作区已恢复，可以继续操作。');}}finally{button.disabled=false;}});
 switchView('home');guard(initializeWorkspace);
})();
