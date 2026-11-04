/* ChatFlow MV3 service worker. No model API, automatic Send, or source mutation. */
importScripts('tl-core.js','tl-evidence.js','tl-diagnostics.js','tl-provider.js','tl-passages.js','tl-store.js','experiment-core.js','experiment-db.js','experiment-service.js','tl-tasks.js','tl-task-store.js','tl-task-service.js');
const C=globalThis.TLCore,P=globalThis.ChatFlowProviders,S=globalThis.TLStore,api=chrome,runs=new Map();
function errorCode(e){
 if(e?.name==='QuotaExceededError')return'LOCAL_STORAGE_FULL';
 if(e?.name==='AbortError')return'CANCELLED_OR_TIMEOUT';
 const key=String(e?.message||'');
 const experimentCodes={'criteria required':'FF_CRITERIA_REQUIRED','invalid preference':'FF_INVALID_PREFERENCE','invalid confidence':'FF_INVALID_CONFIDENCE','verdict already recorded':'FF_VERDICT_ALREADY_RECORDED','no comparison mapping assigned yet':'FF_COMPARISON_MAPPING_REQUIRED'};
 return experimentCodes[key]||(/^[A-Z][A-Z0-9_]{2,100}$/.test(key)?key:'OPERATION_FAILED');
}
const trusted=sender=>sender?.id===api.runtime.id;
function workspace(sender){C.check(trusted(sender)&&String(sender.url||'').startsWith(api.runtime.getURL('workspace/')),'WORKSPACE_ONLY');}
async function workspaceWindow(msg,sender){
 const direct=sender?.tab?.windowId;if(Number.isInteger(direct))return direct;
 C.check(Number.isInteger(msg?.windowId)&&Number.isInteger(msg?.activeTabId),'WORKSPACE_WINDOW_REQUIRED');
 const active=await api.tabs.get(msg.activeTabId);
 C.check(active?.windowId===msg.windowId&&active.active===true,'WORKSPACE_WINDOW_REQUIRED');
 return msg.windowId;
}
const startingTabs=new Set();
async function freezeSource(msg){
 C.check(Number.isInteger(msg.tabId)&&typeof msg.expectedUrl==='string','SOURCE_LOCK_REQUIRED');
 const expected=P.identify(msg.expectedUrl).identity,tab=await api.tabs.get(msg.tabId),source=P.identify(tab.url).identity;
 C.check(source.origin===expected.origin&&source.conversationId===expected.conversationId,'SOURCE_CONVERSATION_CHANGED');
 let frames;try{frames=await api.scripting.executeScript({target:{tabId:msg.tabId,...(msg.expectedDocumentId?{documentIds:[msg.expectedDocumentId]}:{frameIds:[0]})},func:()=>location.href});}catch{throw new Error('SOURCE_DOCUMENT_CHANGED');}
 const frame=frames?.find(r=>r.frameId===0);C.check(frame?.documentId,'DOCUMENT_ID_UNAVAILABLE');
 if(msg.expectedDocumentId)C.check(frame.documentId===msg.expectedDocumentId,'SOURCE_DOCUMENT_CHANGED');
 const observed=P.identify(frame.result).identity,current=P.identify((await api.tabs.get(msg.tabId)).url).identity;
 C.check([observed,current].every(s=>s.origin===expected.origin&&s.conversationId===expected.conversationId),'SOURCE_CONVERSATION_CHANGED');
 return{tabId:msg.tabId,source:expected,expectedUrl:expected.url,expectedConversationId:expected.conversationId,expectedDocumentId:frame.documentId};
}
async function keepRuns(){await api.storage.session.set({tlRuns:[...runs.values()].map(({controller,pending,...r})=>r)});}
let bootError=null;
const boot=(async()=>{
 const old=(await api.storage.session.get('tlRuns')).tlRuns||[];
 for(const r of old){const c=await S.get('captures',r.captureId);if(c)await S.set('captures',{...c,state:c.state==='capturing'?'interrupted':c.state,live:false,lastError:'WORKER_RESTARTED_RETRY_EXPLICITLY'});}
 await S.recover([]);await ChatFlowExperimentService.recover(api,S);await api.storage.session.set({tlRuns:[]});
})().catch(e=>{bootError=errorCode(e);});
async function sourceRun(msg,sender){
 C.check(trusted(sender)&&Number.isInteger(sender.tab?.id),'SOURCE_TAB_REQUIRED');const run=runs.get(msg.nonce);C.check(run&&!run.cancelled&&run.tabId===sender.tab.id,'CAPTURE_SESSION_NOT_FOUND');
 // The content script may have been injected at a blank new-chat URL and then
 // stayed in the same document through a ChatGPT history.pushState transition.
 // MessageSender.url can retain that original document URL; tab.url is the
 // current route. Preserve origin + exact document + selected conversation gates.
 let pageOrigin;try{pageOrigin=new URL(sender.url||sender.tab.url).origin;}catch{}
 C.check(pageOrigin===run.source.origin,'SOURCE_ORIGIN_CHANGED');
 if(run.documentId)C.check(sender.documentId===run.documentId,'SOURCE_DOCUMENT_CHANGED');else{C.check(sender.documentId,'DOCUMENT_ID_UNAVAILABLE');run.documentId=sender.documentId;await keepRuns();}
 const now=P.identify((await api.tabs.get(run.tabId)).url).identity;C.check(runs.get(msg.nonce)===run&&!run.cancelled,'CAPTURE_SESSION_NOT_FOUND');C.check(now.conversationId===run.source.conversationId&&now.origin===run.source.origin,'SOURCE_NAVIGATED');return run;
}
async function sendToSource(tabId,message,documentId){
 const target={tabId,documentIds:[documentId]},options={documentId};
 try{return await api.tabs.sendMessage(tabId,message,options);}catch{await api.scripting.executeScript({target,files:['src/tl-core.js','src/tl-provider.js','src/tl-capture.js','src/tl-inject.js']});return api.tabs.sendMessage(tabId,message,options);}
}
async function startCapture(msg){
 C.check(Number.isInteger(msg.tabId),'INVALID_TAB_ID');
 C.check(typeof msg.expectedDocumentId==='string'&&msg.expectedDocumentId.length>0&&(typeof msg.expectedUrl==='string'||typeof msg.expectedConversationId==='string'),'SOURCE_LOCK_REQUIRED');
 C.check(!startingTabs.has(msg.tabId)&&![...runs.values()].some(r=>r.tabId===msg.tabId),'SOURCE_ALREADY_RUNNING');startingTabs.add(msg.tabId);
 try{return await startLockedCapture(msg);}finally{startingTabs.delete(msg.tabId);}
}
async function startLockedCapture(msg){
 const scope=msg.scope==null?'all':msg.scope;C.check(['all','last_generated'].includes(scope),'INVALID_SAVE_SCOPE');C.check(!(msg.live&&scope==='last_generated'),'LIVE_CACHE_REQUIRES_ALL_SCOPE');
 const tab=await api.tabs.get(msg.tabId),source=P.identify(tab.url).identity,captureId=msg.captureId||C.id(),previous=await S.get('captures',captureId);
 if(msg.expectedConversationId)C.check(msg.expectedConversationId===source.conversationId,'SOURCE_CONVERSATION_CHANGED');
 const frozen=await freezeSource({...msg,expectedUrl:msg.expectedUrl||source.url});
 if(previous){const p=previous.snapshot?.source||previous.source;C.check(p?.conversationId===source.conversationId&&p.origin===source.origin,'CAPTURE_SOURCE_CHANGED');C.check((previous.saveScope||'all')===scope,'CAPTURE_SCOPE_CHANGED');}
 else await S.set('captures',{id:captureId,title:C.scrubText(tab.title||'读取对话中'),source,snapshot:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),state:'capturing',live:!!msg.live,saveScope:scope});
 const nonce=C.id(),run={nonce,tabId:tab.id,source,captureId,live:!!msg.live,scope,phase:'reading',documentId:frozen.expectedDocumentId,cancelled:false};runs.set(nonce,run);await keepRuns();
 try{const response=await sendToSource(tab.id,{type:'tl:capture',nonce,live:run.live,scope:run.scope,expectedSource:source},run.documentId);C.check(response?.ok,response?.code||'CHATGPT_PAGE_NOT_READY');}
 catch(e){runs.delete(nonce);await keepRuns();const c=await S.get('captures',captureId);await S.set('captures',{...c,state:'error',live:false,lastError:errorCode(e)});throw e;}
 return{captureId};
}
async function stopCapture(captureId){
 for(const[nonce,r]of runs)if(r.captureId===captureId){r.cancelled=true;r.controller?.abort();runs.delete(nonce);await r.pending?.catch(()=>{});await api.tabs.sendMessage(r.tabId,{type:'tl:stopCapture',nonce},{documentId:r.documentId}).catch(()=>{});}
 await keepRuns();const c=await S.get('captures',captureId);if(c){for(const a of await S.assets(captureId))if(a.state==='downloading')await S.failAsset(captureId,a.key,'CANCELLED_BY_USER');await S.set('captures',{...c,state:c.state==='capturing'?'cancelled':c.state,live:false});}
}
async function externalDownload(run,msg){
 const asset=await S.get('assets',[run.captureId,msg.key]);C.check(asset&&asset.state!=='saved'&&asset.state!=='excluded','INVALID_DOWNLOAD_ASSET');const target=P.get('chatgpt').mediaUrl(msg.url);C.check(await api.permissions.contains({origins:[target.origin+'/*']}),'MEDIA_PERMISSION_REQUIRED');
 const deadlineAt=Math.min(Date.now()+60000,Number.isSafeInteger(msg.deadlineAt)?msg.deadlineAt:Date.now()+60000);
 const controller=new AbortController();run.controller=controller;const timer=setTimeout(()=>controller.abort(),Math.max(1,deadlineAt-Date.now()));
 try{C.check(deadlineAt>Date.now(),'ASSET_DOWNLOAD_TIMEOUT');
  const r=await fetch(target.href,{method:'GET',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',signal:controller.signal});C.check(r.ok,'HTTP_'+r.status);C.check(r.body,'NO_DOWNLOAD_BODY');
  const estimate=await navigator.storage.estimate(),declared=Number(r.headers.get('content-length')||0);if(estimate.quota&&declared)C.check(declared<Math.max(0,estimate.quota-(estimate.usage||0)),'LOCAL_STORAGE_FULL');
  await S.beginAsset(run.captureId,msg.key);const reader=r.body.getReader();let seq=0,total=0;
  try{while(true){C.check(!run.cancelled&&runs.has(run.nonce),'CANCELLED_BY_USER');C.check(Date.now()<deadlineAt,'ASSET_DOWNLOAD_TIMEOUT');const x=await reader.read();if(x.done)break;for(let i=0;i<x.value.length;i+=C.TRANSFER_CHUNK_BYTES){const part=x.value.subarray(i,i+C.TRANSFER_CHUNK_BYTES);await S.chunk(run.captureId,msg.key,seq++,part);total+=part.length;}}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
  C.check(Date.now()<deadlineAt,'ASSET_DOWNLOAD_TIMEOUT');if(declared&&!r.headers.get('content-encoding'))C.check(total===declared,'DOWNLOAD_SIZE_MISMATCH');return await S.finishAsset(run.captureId,msg.key,r.headers.get('content-type'));
 }catch(e){await S.failAsset(run.captureId,msg.key,errorCode(e));throw e;}finally{clearTimeout(timer);delete run.controller;}
}
async function prepareHandoff(msg){
 const c=await S.get('captures',msg.captureId);C.check(c?.snapshot,'CAPTURE_NOT_READY');C.check(!['capturing','error'].includes(c.state),'CAPTURE_NOT_READY');
 C.check(msg.activeNodes==null||Array.isArray(msg.activeNodes),'INVALID_HANDOFF_BRANCH_PATH');
 const snapshot=C.persistedSnapshot(c.snapshot),branchNodeIds=Array.isArray(msg.activeNodes)?msg.activeNodes:snapshot.active;
 C.check(branchNodeIds.length>0&&branchNodeIds.every(id=>typeof id==='string'&&Object.hasOwn(snapshot.nodes,id))&&new Set(branchNodeIds).size===branchNodeIds.length&&snapshot.nodes[branchNodeIds[0]].parent===null,'INVALID_HANDOFF_BRANCH_PATH');
 for(let i=1;i<branchNodeIds.length;i++)C.check(snapshot.nodes[branchNodeIds[i]].parent===branchNodeIds[i-1],'INVALID_HANDOFF_BRANCH_PATH');
 snapshot.active=[...branchNodeIds];
 const selected=Array.isArray(msg.keys)?msg.keys:[],instructions=msg.instructions||'',batchLimit=msg.batchLimit||10;
 const rows=await S.assets(c.id),plan=C.handoff(snapshot,rows,selected,instructions,batchLimit),files=[],names=new Set(['handoff_index.md']);
 // Validated identical preparation is idempotent across repeated UI actions.
 const snapshotHash=new C.SHA256().update(JSON.stringify(C.persistedSnapshot(c.snapshot))).hex();
 const prepareFingerprint=new C.SHA256().update(JSON.stringify([c.id,snapshotHash,branchNodeIds,[...new Set(selected)],instructions,batchLimit])).hex();
 const previous=(await S.all('handoffs')).find(row=>row.state==='prepared'&&row.captureId===c.id&&row.snapshotHash===snapshotHash&&row.prepareFingerprint===prepareFingerprint);
 if(previous)return previous;
 for(const f of plan.files){
  const base=C.safeName(f.name);let uploadName=base,sequence=2;while(names.has(uploadName.toLowerCase()))uploadName=sequence+++'_'+base;names.add(uploadName.toLowerCase());
  if(f.kind==='asset'){const b=await S.verifiedBlob(f.sha256);files.push({...f,uploadName,size:b.size});}
  else{const blob=new Blob([f.text],{type:f.mime}),info=await S.putBlob(blob);files.push({kind:'history',name:f.name,uploadName,mime:f.mime,...info});}
 }
 const index=['# 接续文件索引','','仅下列文件已准备；网页是否上传成功需另行核对。',...files.map(f=>'- 上传名：'+f.uploadName+'；原名：'+f.name+'；SHA-256：'+f.sha256),...plan.missing.map(f=>'- 未取得文件：'+f.name+'（'+f.reason+'）'),...plan.excluded.map(f=>'- 按保存范围跳过：'+f.name+'（未取得文件字节）')].join('\n');
 const indexInfo=await S.putBlob(new Blob([index],{type:'text/markdown'}));files.unshift({kind:'index',name:'handoff_index.md',uploadName:'handoff_index.md',mime:'text/markdown',...indexInfo});
 const batches=[];for(let i=0;i<files.length;i+=plan.batchLimit)batches.push(files.slice(i,i+plan.batchLimit).map((_,j)=>i+j));
 const prompt=plan.prompt.replace(/准备批次：\d+/,'准备批次：'+batches.length)+'\n\n请先查看 handoff_index.md；同名原文件已分配不同上传名，必须按索引及哈希区分。'+(batches.length>1?' 首批不是全部材料，剩余批次需要用户手动补充。':'');
 const h={id:C.id(),evidenceVersion:1,captureId:c.id,sourceConversationId:snapshot.source.conversationId,snapshotHash,prepareFingerprint,createdAt:new Date().toISOString(),state:'prepared',prompt,files,batches,missing:plan.missing,excluded:plan.excluded,branchNodeIds:[...branchNodeIds]};await S.set('handoffs',h);return h;
}
async function announce(tabId){const h=(await S.all('handoffs')).find(h=>h.targetTabId===tabId&&h.state==='target_opened');if(h)await api.tabs.sendMessage(tabId,{type:'tl:handoffAvailable'}).catch(()=>{});}
// A single write queue protects whole-record handoff state transitions from
// concurrent open, claim, progress and user acknowledgement lost updates.
let handoffWriteQueue=Promise.resolve();
function serializeHandoffWrite(task){
 const result=handoffWriteQueue.then(task);
 handoffWriteQueue=result.then(()=>{},()=>{});
 return result;
}
// A new tab must not load ChatGPT before it is durably bound to this handoff.
function openHandoff(id,sender,context){
 return serializeHandoffWrite(async()=>{
  const h=await S.get('handoffs',id);C.check(h?.state==='prepared','HANDOFF_ALREADY_OPENED');
  if(h.snapshotHash){const source=await S.get('captures',h.captureId);C.check(source?.snapshot,'HANDOFF_SOURCE_DELETED');C.check(new C.SHA256().update(JSON.stringify(C.persistedSnapshot(source.snapshot))).hex()===h.snapshotHash,'HANDOFF_SOURCE_CHANGED_REGENERATE');}
  const windowId=await workspaceWindow(context,sender);
  // Keep the continuation beside the source/workspace in the same Edge window.
  // Bind ownership while the new tab is still blank, then navigate it to ChatGPT.
  const target=await api.tabs.create({windowId,url:'about:blank',active:true});C.check(Number.isInteger(target?.id),'NEW_TAB_FAILED');
  const updated={...h,state:'target_opened',targetTabId:target.id,targetWindowId:target.windowId??windowId,targetDocumentId:null};
  try{
   await S.set('handoffs',updated);
   const loaded=await api.tabs.update(target.id,{url:'https://chatgpt.com/'});
   if(loaded.status==='complete')await announce(target.id);
   return updated;
  }catch(e){
   await S.set('handoffs',{...updated,state:'injection_blocked',lastError:'TARGET_NAVIGATION_UNCONFIRMED'}).catch(()=>{});
   throw new Error('TARGET_NAVIGATION_UNCONFIRMED');
  }
 });
}
async function targetHandoff(msg,sender){
 C.check(trusted(sender)&&Number.isInteger(sender.tab?.id)&&sender.documentId,'TARGET_TAB_REQUIRED');const h=await S.get('handoffs',msg.id);C.check(h&&h.targetTabId===sender.tab.id&&h.targetDocumentId===sender.documentId,'HANDOFF_TARGET_MISMATCH');P.identify(sender.url||sender.tab.url,{target:true}).identity;P.identify((await api.tabs.get(sender.tab.id)).url,{target:true}).identity;return h;
}
async function claim(sender){
 return serializeHandoffWrite(async()=>{
  C.check(trusted(sender)&&Number.isInteger(sender.tab?.id)&&sender.documentId,'TARGET_TAB_REQUIRED');
  const h=(await S.all('handoffs')).find(x=>x.targetTabId===sender.tab.id&&x.state==='target_opened');if(!h)return null;
  P.identify(sender.url||sender.tab.url,{target:true}).identity;
  P.identify((await api.tabs.get(sender.tab.id)).url,{target:true}).identity;const attemptId=C.id();await S.set('handoffs',{...h,state:'claimed',targetDocumentId:sender.documentId,attemptId});
  return{id:h.id,attemptId,prompt:h.prompt,files:h.batches[0].map(i=>({...h.files[i],index:i})),remainingBatches:h.batches.length-1};
 });
}
// All handoff writes share the same queue. A late progress report cannot
// overwrite a terminal receipt or erase a concurrent manual check.
async function applyHandoffEvidence(msg,sender){
 const E=globalThis.TLEvidence;
 if(msg.type==='tl:confirmUpload'||msg.type==='tl:confirmFile'){
  workspace(sender);
  const h=await S.get('handoffs',msg.id);C.check(h&&h.targetTabId,'HANDOFF_NOT_CONFIRMABLE');
  const source=await S.get('captures',h.captureId);
  C.check(source?.snapshot&&new C.SHA256().update(JSON.stringify(C.persistedSnapshot(source.snapshot))).hex()===h.snapshotHash,'HANDOFF_SOURCE_CHANGED');
  C.check(msg.confirmed===true,'USER_CONFIRMATION_REQUIRED');
  C.check(['upload_unknown','upload_confirmed','draft_prepared','partial_injection','user_verified_upload'].includes(h.state),'HANDOFF_NOT_CONFIRMABLE');
  const indices=msg.type==='tl:confirmUpload'?h.batches[0]:[msg.index];
  C.check(indices.every(i=>Number.isInteger(i)&&i>=0&&i<h.files.length),'INVALID_FILE_EVIDENCE_INDEX');
  const checks=[...new Set([...(h.userFileChecks||[]),...indices])].sort((a,b)=>a-b);
  await S.set('handoffs',{...h,userFileChecks:checks,state:msg.type==='tl:confirmUpload'?'user_verified_upload':h.state,
   userVerifiedAt:new Date().toISOString(),note:'User attestation only; not provider receipt, model reading or message sending.'});
  return {confirmed:true};
 }
 const h=await targetHandoff(msg,sender);C.check(h.state==='claimed','HANDOFF_ALREADY_FINISHED');
 let evidence=null;
 if(h.evidenceVersion===1){
  C.check(typeof h.attemptId==='string'&&msg.attemptId===h.attemptId,'HANDOFF_ATTEMPT_MISMATCH');
  evidence=E.validateFileEvidence(h,msg.files);
 }
 const terminal=msg.type==='tl:handoffStatus';
 if(terminal){
  C.check(['draft_prepared','upload_confirmed','upload_unknown','injection_blocked','partial_injection'].includes(msg.state),'INVALID_HANDOFF_STATE');
  if(msg.state==='upload_confirmed'&&evidence)C.check(evidence.every(row=>row.state==='page_ready'),'UNPROVEN_UPLOAD_SUCCESS');
 }
 const code=/^[A-Z0-9_]{1,100}$/.test(msg.code||'')?msg.code:null;
 const updated={...h,...(evidence?{fileEvidence:evidence}:{}),state:terminal?msg.state:h.state,
  lastError:code,reportedAt:new Date().toISOString()};
 await S.set('handoffs',updated);return updated;
}
async function handle(msg,sender){
 await boot;C.check(!bootError,bootError||'STARTUP_FAILED');C.check(trusted(sender),'FOREIGN_EXTENSION');
 if(['tl:handoffProgress','tl:handoffStatus','tl:confirmUpload','tl:confirmFile'].includes(msg.type))return serializeHandoffWrite(()=>applyHandoffEvidence(msg,sender));
 const taskResult=await globalThis.TLTaskService?.handle(msg,sender,api);if(taskResult!==undefined)return taskResult;
 const experimentResult=await ChatFlowExperimentService.handle(msg,sender,api,{startCapture});if(experimentResult!==undefined)return experimentResult;
 if(msg.type==='tl:claimHandoff')return claim(sender);
 if(msg.type==='tl:handoffChunk'){
  const h=await targetHandoff(msg,sender);C.check(h.state==='claimed'&&h.batches[0].includes(msg.index),'HANDOFF_NOT_READABLE');const f=h.files[msg.index],row=await S.get('files',f.sha256);C.check(row?.blob&&row.blob.size===f.size,'LOCAL_FILE_MISSING');C.check(Number.isSafeInteger(msg.offset)&&msg.offset>=0&&msg.offset<row.blob.size,'INVALID_FILE_OFFSET');
  const b=new Uint8Array(await row.blob.slice(msg.offset,msg.offset+C.TRANSFER_CHUNK_BYTES).arrayBuffer());return{data:C.bytesToBase64(b),total:row.blob.size};
 }
 if(['tl:sources','tl:freezeSource','tl:start','tl:stop','tl:sessions','tl:prepareHandoff','tl:openHandoff','tl:confirmUpload','tl:focusTarget'].includes(msg.type)){
  workspace(sender);
  if(msg.type==='tl:sources'){const tabs=await api.tabs.query({url:['https://chatgpt.com/*','https://chat.openai.com/*']});return tabs.flatMap(t=>{try{const source=P.identify(t.url).identity;return[{id:t.id,title:C.scrubText(t.title),url:source.url}];}catch{return[];}});}
  if(msg.type==='tl:freezeSource')return freezeSource(msg);
  if(msg.type==='tl:start')return startCapture(msg);
  if(msg.type==='tl:stop'){await stopCapture(msg.captureId);return{stopped:true};}
  if(msg.type==='tl:sessions')return[...runs.values()].map(r=>({captureId:r.captureId,tabId:r.tabId,live:r.live,phase:r.phase}));
  if(msg.type==='tl:prepareHandoff')return serializeHandoffWrite(()=>prepareHandoff(msg));
  if(msg.type==='tl:openHandoff')return openHandoff(msg.id,sender,msg);
  if(msg.type==='tl:focusTarget'){const h=await S.get('handoffs',msg.id);C.check(h?.targetTabId,'NO_TARGET');await api.tabs.update(h.targetTabId,{active:true});await api.windows.update(h.targetWindowId,{focused:true});return{focused:true};}

 }
 const run=await sourceRun(msg,sender);
 // Serialize writes for this run. A stop marks the run cancelled immediately,
 // drains an already-started write, then commits its final stable state.
 const operation=(run.pending||Promise.resolve()).then(()=>{C.check(runs.get(run.nonce)===run&&!run.cancelled,'CAPTURE_SESSION_NOT_FOUND');run.phase=msg.type.slice(3);return handleRunMessage(msg,run);});
 run.pending=operation.catch(()=>{});return operation;
}
async function handleRunMessage(msg,run){
 if(msg.type==='tl:snapshot'){
  C.check(msg.snapshot?.source?.conversationId===run.source.conversationId&&msg.snapshot?.source?.origin===run.source.origin,'SNAPSHOT_SOURCE_MISMATCH');C.check(JSON.stringify(msg.snapshot).length<=16*1024*1024,'SNAPSHOT_MESSAGE_SIZE_LIMIT');
  await S.snapshot(run.captureId,msg.snapshot);const c=await S.get('captures',run.captureId);await S.set('captures',{...c,live:run.live});const rows=await S.assets(run.captureId);return{savedKeys:rows.filter(a=>a.state==='saved').map(a=>a.key)};
 }
 if(msg.type==='tl:assetBegin'){await S.beginAsset(run.captureId,msg.key);return{ok:true};}
 if(msg.type==='tl:assetChunk'){await S.chunk(run.captureId,msg.key,msg.seq,C.base64ToBytes(msg.data));return{ok:true};}
 if(msg.type==='tl:assetEnd')return S.finishAsset(run.captureId,msg.key,msg.mime);
 if(msg.type==='tl:assetFail'){await S.failAsset(run.captureId,msg.key,/^[A-Z0-9_]{1,100}$/.test(msg.code||'')?msg.code:'DOWNLOAD_FAILED');return{ok:true};}
 if(msg.type==='tl:external')return externalDownload(run,msg);
 if(msg.type==='tl:finish'){const c=await S.finishCapture(run.captureId);if(!run.cancelled)await ChatFlowExperimentService.onCaptureFinished(run,S,api);if(run.live&&!run.cancelled){run.phase='watching';await S.set('captures',{...c,live:true});}else runs.delete(run.nonce);await keepRuns();return c;}
 if(msg.type==='tl:heartbeat')return{active:true};
 if(msg.type==='tl:captureFailed'){const c=await S.get('captures',run.captureId);if(c)await S.set('captures',{...c,state:c.snapshot?'partial':'error',live:false,lastError:/^[A-Z0-9_]{1,100}$/.test(msg.code||'')?msg.code:'CAPTURE_FAILED'});run.controller?.abort();runs.delete(run.nonce);await keepRuns();return{stopped:true};}
 throw new Error('UNKNOWN_OPERATION');
}
api.runtime.onMessage.addListener((msg,sender,respond)=>{if(!msg||typeof msg.type!=='string'||(!msg.type.startsWith('tl:')&&!msg.type.startsWith('FF_')))return false;handle(msg,sender).then(data=>respond({ok:true,data})).catch(e=>respond({ok:false,code:errorCode(e)}));return true;});
// Open the native browser side panel beside ChatGPT, not a workspace tab.
api.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{
 TLDiagnostics.record('sidepanel-setup',new Error('SIDEPANEL_SETUP_FAILED'));
});
api.tabs.onUpdated.addListener((tabId,change,tab)=>{
 ChatFlowExperimentService.onTabUpdated(api,tabId,change).catch(e=>TLDiagnostics.record('experiment-tab-update',e));
 if(change.status==='complete')announce(tabId).catch(e=>TLDiagnostics.record('handoff-announce',e));
 if(change.url)for(const r of runs.values())if(r.tabId===tabId){let same=false;try{const now=P.identify(tab.url).identity;same=now.conversationId===r.source.conversationId&&now.origin===r.source.origin;}catch{}if(!same)stopCapture(r.captureId).catch(e=>TLDiagnostics.record('capture-stop',e));}
});
api.tabs.onRemoved.addListener(tabId=>{for(const r of runs.values())if(r.tabId===tabId)stopCapture(r.captureId).catch(e=>TLDiagnostics.record('capture-stop',e));ChatFlowExperimentService.onTabRemoved(tabId,api).catch(e=>TLDiagnostics.record('experiment-tab-close',e));});
