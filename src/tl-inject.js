/* ChatFlow new-chat adapter. MIT.
 * Interaction pattern informed by MoveChat v1.2.1; no autoSend path is retained.
 * Upload events are not upload receipts. Unknown states explicitly return control.
 */
(() => {
 'use strict';
 if(globalThis.TLInjectInstalled)return;globalThis.TLInjectInstalled=true;
 const C=globalThis.TLCore,P=globalThis.ChatFlowProviders,api=chrome;let started=false;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const code=e=>/^[A-Z0-9_]{2,100}$/.test(e?.message||'')?e.message:'HANDOFF_NOT_CONFIRMED';
 async function send(type,data={}){const r=await api.runtime.sendMessage({type,...data});if(!r?.ok)throw new Error(r?.code||'EXTENSION_UNAVAILABLE');return r.data;}
 function notice(text){
  let el=document.getElementById('chatflow-handoff-notice');
  if(!el){el=document.createElement('div');el.id='chatflow-handoff-notice';el.setAttribute('role','status');el.style.cssText='position:fixed;bottom:12px;right:12px;max-width:400px;z-index:2147483647;padding:12px 16px;border:1px solid #8193a8;border-radius:8px;background:#eef4fb;color:#23384f;font:14px/1.6 system-ui;box-shadow:0 2px 10px #0002';(document.body||document.documentElement).append(el);}
  el.textContent=text;
 }
 const visible=e=>!!e&&(e.getClientRects().length>0||e.offsetParent!==null);
 const value=e=>e instanceof HTMLTextAreaElement?e.value:(e.innerText||e.textContent||'');
 function editor(){
  const xs=[...document.querySelectorAll('#prompt-textarea[contenteditable="true"],textarea#prompt-textarea,[data-testid="composer-text-input"][contenteditable="true"]')].filter(visible);
  C.check(xs.length===1,'COMPOSER_UNAVAILABLE_OR_AMBIGUOUS');return xs[0];
 }
 function preflight(){
  P.identify(location.href,{target:true}).identity;
  C.check(!document.querySelector('[data-project-id],[data-testid="temporary-chat-banner"],[data-testid="project-header"]'),'NON_STANDARD_CHAT');
  C.check(![...document.querySelectorAll('[data-message-author-role="user"],[data-message-author-role="assistant"]')].some(visible),'EXISTING_CHAT_REJECTED');
  const e=editor();C.check(!value(e).trim(),'USER_DRAFT_PRESENT');
  C.check(![...document.querySelectorAll('input[type="file"]')].some(i=>i.files?.length),'USER_FILES_PRESENT');
  C.check(![...document.querySelectorAll('[data-testid="file-chip"],[data-testid="attachment-chip"],[data-testid="file-upload"]')].some(visible),'USER_FILES_PRESENT');return e;
 }
 function generalFileInput(){
  const xs=[...document.querySelectorAll('input[type="file"]')].filter(i=>{
   if(i.disabled||i.hasAttribute('capture'))return false;
   const types=String(i.accept||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
   return types.length===0||types.includes('*/*')||types.some(t=>t.startsWith('.')&&!/^\.(png|jpg|jpeg|gif|webp|heic|mp3|mp4)$/.test(t)||t.startsWith('application/')||t.startsWith('text/'));
  });
  C.check(xs.length===1,'GENERAL_FILE_INPUT_UNAVAILABLE_OR_AMBIGUOUS');return xs[0];
 }
 async function receiveFile(h,f){
  const parts=[],hash=new C.SHA256();let offset=0;
  while(offset<f.size){P.identify(location.href,{target:true}).identity;const r=await send('tl:handoffChunk',{id:h.id,index:f.index,offset});C.check(r.total===f.size,'HANDOFF_FILE_SIZE_CHANGED');const bytes=C.base64ToBytes(r.data);C.check(bytes.length>0&&offset+bytes.length<=f.size,'HANDOFF_FILE_TRUNCATED');hash.update(bytes);parts.push(bytes);offset+=bytes.length;}
  C.check(offset===f.size&&hash.hex()===f.sha256,'HANDOFF_FILE_HASH_MISMATCH');
  return new File(parts,f.uploadName||f.name,{type:f.mime||'application/octet-stream'});
 }
 function prefill(e,text){
  C.check(!value(e).trim(),'USER_DRAFT_CHANGED');e.focus();
  if(e instanceof HTMLTextAreaElement){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,text);e.dispatchEvent(new Event('input',{bubbles:true}));}
  else{C.check(document.execCommand('insertText',false,text),'PREFILL_NOT_SUPPORTED');e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));}
  C.check(value(e).replace(/\r/g,'').trim()===text.replace(/\r/g,'').trim(),'PREFILL_NOT_CONFIRMED');
 }
 function uploadsConfirmed(names){
  const chips=[...document.querySelectorAll('[data-testid="file-chip"],[data-testid="attachment-chip"],[data-testid="file-upload"],[data-file-id]')].filter(visible),used=new Set();
  for(const name of names){const found=chips.findIndex((chip,i)=>{
   if(used.has(i))return false;
   const text=(chip.getAttribute('title')||'')+' '+(chip.getAttribute('data-filename')||'')+' '+(chip.textContent||'');
   const state=chip.getAttribute('data-state')||chip.getAttribute('data-status');
   return text.includes(name)&&['ready','uploaded','complete','success'].includes(state)&&!chip.querySelector('[role="progressbar"],[aria-busy="true"]');
  });if(found<0)return false;used.add(found);}
  return names.length>0;
 }
 function observeManualExperimentSend(h,e){
  let armed=true;
  function matches(event){
   if(!event.isTrusted||!armed||value(e).trim()!==h.text.trim())return false;
   if(event.type==='keydown')return event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&
    (event.target===e||e.contains(event.target));
   const button=event.target?.closest?.('button');
   return !!button&&!button.disabled&&button.matches('[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Send message"],button[aria-label="发送"]');
  }
  async function onGesture(event){
   if(!matches(event))return;
   armed=false;document.removeEventListener('click',onGesture,true);document.removeEventListener('keydown',onGesture,true);
   try{await send('tl:experimentSendIntent',{experimentId:h.experimentId,branch:h.branch,attemptId:h.attemptId});}
   catch{notice('ChatFlow：无法确认手动发送操作的分支身份。请勿继续采集该分支；不会自动重发。');}
  }
  document.addEventListener('click',onGesture,true);
  document.addEventListener('keydown',onGesture,true);
 }
 async function prepareExperiment(){
  let h;try{h=await send('tl:claimExperimentHandoff');}catch(e){notice('ChatFlow：并行分支预填未确认（'+code(e)+'）。请检查目标页；不会自动重试。');return;}
  if(!h)return;
  try{
   notice('ChatFlow：正在核验冻结任务。不会自动发送消息。');
   let ready=false;for(let i=0;i<40;i++){try{editor();ready=true;break;}catch{await sleep(250);}}
   C.check(ready,'COMPOSER_NOT_READY');const e=preflight();
   prefill(e,h.text);P.identify(location.href,{target:true}).identity;
   C.check(value(e).replace(/\\r/g,'').trim()===h.text.replace(/\\r/g,'').trim(),'PREFILL_NOT_CONFIRMED');
   await send('tl:experimentPrefillAck',{experimentId:h.experimentId,branch:h.branch,attemptId:h.attemptId});
   observeManualExperimentSend(h,e);
   notice('ChatFlow：分支 '+h.branch+' 的冻结任务已逐字预填。请核对后由你手动发送。');
  }catch(e){
   notice('ChatFlow：分支 '+h.branch+' 预填未确认（'+code(e)+'）。不会自动发送或重试；请回实验页手动重新预填。');
  }
 }
 async function prepare(){
  if(started)return;let h;
  try{h=await send('tl:claimHandoff');}catch(e){notice('ChatFlow：新聊天页面未通过身份检查（'+code(e)+'），没有注入材料。请回档案页重新准备；不会自动重试。');return;}
  if(!h)return;started=true;let injected=false;
  try{
   notice('ChatFlow：核验本地接续材料。不会自动发送消息。');
   let ready=false;for(let i=0;i<40;i++){try{editor();ready=true;break;}catch{await sleep(250);}}
   C.check(ready,'COMPOSER_NOT_READY');preflight();
   const files=[];for(const f of h.files)files.push(await receiveFile(h,f));
   const e=preflight();let input=null,manualReason=null;
   try{input=generalFileInput();if(!input.multiple&&files.length!==1)manualReason='FILE_INPUT_IS_SINGLE_ONLY';}
   catch(err){if(code(err)==='GENERAL_FILE_INPUT_UNAVAILABLE_OR_AMBIGUOUS')manualReason=code(err);else throw err;}
   const dt=new DataTransfer();for(const f of files){C.check(f.size>0,'EMPTY_FILE_REJECTED');dt.items.add(f);}
   prefill(e,h.prompt); // Draft is filled only after every file passed hash verification.
   P.identify(location.href,{target:true}).identity;C.check(value(e).trim()===h.prompt.trim(),'USER_DRAFT_CHANGED');
   if(manualReason){
    await send('tl:handoffStatus',{id:h.id,state:'draft_prepared',code:manualReason});
    notice('ChatFlow：接续文字已经预填，但当前页面没有可确认的批量附件入口。请返回档案页下载全部接续文件，解压后手动上传并核对；不会自动发送。');
    return;
   }
   input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));injected=true;
   let confirmed=false;
   for(let i=0;i<32;i++){await sleep(250);P.identify(location.href,{target:true}).identity;if(uploadsConfirmed(files.map(f=>f.name))){confirmed=true;break;}}
   await send('tl:handoffStatus',{id:h.id,state:confirmed?'upload_confirmed':'upload_unknown'});
   notice((confirmed?'ChatFlow：网页已确认首批附件上传。':'ChatFlow：已尝试附加首批文件，但上传结果尚未确认，请检查网页。')+'请核对后手动发送。'+(h.remainingBatches?'另有 '+h.remainingBatches+' 批文件，请从档案页下载并手动补充。':''));
  }catch(e){
   await send('tl:handoffStatus',{id:h.id,state:injected?'partial_injection':'injection_blocked',code:code(e)}).catch(()=>{});
   notice('ChatFlow：自动接续未确认（'+code(e)+'）。不会自动重试或清除草稿。请回档案页下载接续包，手动上传。');
  }
 }
 api.runtime.onMessage.addListener((msg,sender,respond)=>{if(sender.id!==api.runtime.id)return false;if(msg?.type==='tl:handoffAvailable'){prepare();respond({ok:true});}if(msg?.type==='TL_EXPERIMENT_HANDOFF_READY'){prepareExperiment();respond({ok:true});}return false;});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{prepare();prepareExperiment();},{once:true});else{prepare();prepareExperiment();}
})();
