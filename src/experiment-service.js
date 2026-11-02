/* ChatFlow controlled parallel-session orchestration. No automatic Send or retry. */
(() => {
 'use strict';
 const Core=globalThis.ChatFlowExperimentCore,DB=globalThis.ChatFlowExperimentDB;
 const ENABLED='chatflow_experiments_enabled_v1',BIND='chatflow_experiment_bind_',HANDOFF='tl_experiment_handoff_';
 let queue=Promise.resolve();
 const serial=fn=>{const run=queue.then(fn,fn);queue=run.catch(()=>{});return run;};
 const id=()=>crypto.randomUUID();
 const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{6,100}$/.test(x);
 const ownPage=api=>api.runtime.getURL('workspace/experiments.html');
 function trustedPage(sender,api){return !!(sender&&sender.id===api.runtime.id&&sender.url===ownPage(api)&&(!sender.tab||sender.tab.url===ownPage(api)));}
 async function enabled(api){const x=await api.storage.local.get(ENABLED);return x[ENABLED]===true;}
 async function binding(api,tabId){const x=await api.storage.session.get(BIND+tabId);return x[BIND+tabId]||null;}
 async function saveBinding(api,tabId,value){await api.storage.session.set({[BIND+tabId]:value});}
 async function clearBinding(api,tabId){await api.storage.session.remove(BIND+tabId,HANDOFF+tabId);}
 async function advance(bind,event){
  const row=await DB.read(bind.experimentId);if(!row)return null;
  const attempt=row.branches[bind.branch]?.attempts.find(a=>a.id===bind.attemptId);
  if(!attempt||attempt.status!=='pending')return null;
  await Core.verifyFrozen(row.frozen);
  return DB.update(row.id,row.revision,r=>Core.advance(r,{branch:bind.branch,expectedRevision:r.revision,
   operationId:event.operationId,attemptId:bind.attemptId,status:event.status||'pending',
   phase:event.phase||attempt.phase,reason:event.reason||'',evidence:{...attempt.evidence,...(event.updates||{})},
   manualNewAttempt:!!event.manualNewAttempt}));
 }
 async function sendReady(api,tabId){try{await api.tabs.sendMessage(tabId,{type:'TL_EXPERIMENT_HANDOFF_READY'});}catch{}}
 async function onTabUpdated(api,tabId,change){
  if(change.status!=='complete')return;
  const x=await api.storage.session.get(HANDOFF+tabId);if(x[HANDOFF+tabId])await sendReady(api,tabId);
 }
 async function claimHandoff(api,sender){
  if(sender?.id!==api.runtime.id||!Number.isInteger(sender.tab?.id))throw new Error('EXPERIMENT_SOURCE_TAB_REQUIRED');
  const tab=await api.tabs.get(sender.tab.id);const target=globalThis.TLCore.chatUrl(tab.url,{target:true});
  const x=await api.storage.session.get(HANDOFF+tab.id),h=x[HANDOFF+tab.id];if(!h)return null;
  const bind=await binding(api,tab.id);if(!bind||bind.experimentId!==h.experimentId||bind.branch!==h.branch)throw new Error('EXPERIMENT_BINDING_MISMATCH');
  await api.storage.session.remove(HANDOFF+tab.id);
  return {...h,attemptId:bind.attemptId,operationId:bind.operationId};
 }
 async function prefillAck(api,msg,sender){
  if(sender?.id!==api.runtime.id||!Number.isInteger(sender.tab?.id))throw new Error('EXPERIMENT_SOURCE_TAB_REQUIRED');
  const b=await binding(api,sender.tab.id);if(!b||b.experimentId!==msg.experimentId||b.branch!==msg.branch||b.attemptId!==msg.attemptId)throw new Error('EXPERIMENT_BINDING_MISMATCH');
  const tab=await api.tabs.get(sender.tab.id);globalThis.TLCore.chatUrl(tab.url,{target:true});
  return serial(()=>advance(b,{status:'pending',phase:'awaiting_send',operationId:b.operationId+'_'+b.branch+'_prefill_ack',
   updates:{prefill:'exact_ack',inputLevel:'exact',tabId:sender.tab.id},reason:'composer prefill exact readback'}));
 }
 async function handle(msg,sender,api,ctx){
  const type=msg?.type;
  if(type==='tl:claimExperimentHandoff')return claimHandoff(api,sender);
  if(type==='tl:experimentPrefillAck')return prefillAck(api,msg,sender);
  if(type==='tl:experimentStatus')return enabled(api);
  if(!String(type||'').startsWith('FF_'))return undefined;
  if(!trustedPage(sender,api))throw new Error('EXPERIMENT_PAGE_ONLY');
  if(type==='FF_STATUS')return{enabled:await enabled(api),sendsAutomatically:false};
  if(type==='FF_SET_ENABLED'){
   if(typeof msg.enabled!=='boolean'||msg.ack!=='local-only-no-send')throw new Error('EXPLICIT_LOCAL_ONLY_ACK_REQUIRED');
   return serial(async()=>{await api.storage.local.set({[ENABLED]:msg.enabled});return{enabled:msg.enabled};});
  }
  if(!await enabled(api))throw new Error('EXPERIMENTS_DISABLED');
  if(type==='FF_CREATE')return serial(async()=>{
   if(!validId(msg.operationId))throw new Error('EXPLICIT_CREATE_OPERATION_REQUIRED');
   const frozen=await Core.freeze(msg.w0,msg.p),experimentId='exp_'+msg.operationId;
   const row=Core.newExperiment(frozen,experimentId,msg.branchCount===undefined?2:msg.branchCount);
   row.createOperationId=msg.operationId;await DB.create(row);
   return{id:row.id,revision:row.revision,bytes:row.frozen.bytes,sha256:row.frozen.textHashes.frozen,createdAt:row.createdAt};
  });
  if(type==='FF_LIST')return(await DB.list()).map(row=>({
   id:row.id,revision:row.revision,createdAt:row.createdAt,bytes:row.frozen?.bytes,
   branchCount:Object.keys(row.branches||{}).length,taskTitle:Core.shortTaskTitle(row.frozen?.p),
   statuses:Object.fromEntries(Object.entries(row.branches||{}).map(([k,v])=>[k,v.status]))
  })).sort((a,b)=>b.createdAt-a.createdAt);
  if(type==='FF_READ'){const row=await DB.read(msg.id);if(!row)throw new Error('EXPERIMENT_NOT_FOUND');await Core.verifyFrozen(row.frozen);return row;}
  if(type==='FF_RECORD')return serial(async()=>{
   if(!['pending','failed','unknown'].includes(msg.status))throw new Error('MANUAL_DONE_NOT_ALLOWED');
   if(msg.evidence&&Object.keys(msg.evidence).length)throw new Error('WEBPAGE_EVIDENCE_NOT_ACCEPTED_FROM_UI');
   const row=await DB.read(msg.experimentId);if(!row)throw new Error('EXPERIMENT_NOT_FOUND');
   return DB.update(row.id,msg.expectedRevision,r=>Core.advance(r,{branch:msg.branch,expectedRevision:r.revision,
    operationId:msg.operationId,attemptId:msg.attemptId,status:msg.status,phase:msg.phase,
    reason:msg.reason||'',evidence:{},manualNewAttempt:msg.manualNewAttempt===true}));
  });
  if(type==='FF_LAUNCH')return serial(async()=>{
   if(!validId(msg.operationId))throw new Error('EXPLICIT_LAUNCH_OPERATION_REQUIRED');
   let row=await DB.read(msg.experimentId);if(!row)throw new Error('EXPERIMENT_NOT_FOUND');await Core.verifyFrozen(row.frozen);
   const tabIds={},attemptIds={};
   for(const branch of Object.keys(row.branches)){
    const current=row.branches[branch],last=current.attempts.at(-1);
    if(last?.status==='pending')throw new Error('BRANCH_STILL_PENDING:'+branch);
    if(current.status==='done')throw new Error('COMPLETED_BRANCH_IMMUTABLE:'+branch);
   }
   for(const branch of Object.keys(row.branches)){
    const tab=await api.tabs.create({active:false});
    const attemptId='att_'+id(),bind={experimentId:row.id,branch,attemptId,operationId:msg.operationId,tabId:tab.id,createdAt:Date.now()};
    await saveBinding(api,tab.id,bind);await api.storage.session.set({[HANDOFF+tab.id]:{text:row.frozen.text,experimentId:row.id,branch}});
    await api.tabs.update(tab.id,{url:'https://chatgpt.com/'});
    tabIds[branch]=tab.id;attemptIds[branch]=attemptId;
    row=await DB.update(row.id,row.revision,r=>Core.advance(r,{branch,expectedRevision:r.revision,
     operationId:msg.operationId+'_'+branch,attemptId,status:'pending',phase:'created',
     reason:'new inactive ChatGPT tab; manual send required',evidence:{tabId:tab.id}}));
   }
   for(const tabId of Object.values(tabIds))await sendReady(api,tabId);
   return{tabIds,attemptIds,revision:row.revision,branchCount:Object.keys(row.branches).length};
  });
  if(type==='FF_REPREFILL')return serial(async()=>{
   if(!validId(msg.operationId))throw new Error('EXPLICIT_REPREFILL_OPERATION_REQUIRED');
   const row=await DB.read(msg.experimentId),branch=row?.branches?.[msg.branch],attempt=branch?.attempts.at(-1);
   if(!attempt||attempt.status!=='pending'||!Number.isInteger(attempt.evidence?.tabId))throw new Error('NO_PENDING_BRANCH_TAB');
   const tabId=attempt.evidence.tabId,tab=await api.tabs.get(tabId);globalThis.TLCore.chatUrl(tab.url,{target:true});
   const b=await binding(api,tabId);if(!b||b.experimentId!==row.id||b.branch!==msg.branch)throw new Error('EXPERIMENT_BINDING_MISMATCH');
   await api.storage.session.set({[HANDOFF+tabId]:{text:row.frozen.text,experimentId:row.id,branch:msg.branch}});
   await sendReady(api,tabId);return{tabId};
  });
  if(type==='FF_CAPTURE')return serial(async()=>{
   const row=await DB.read(msg.experimentId),branch=row?.branches?.[msg.branch],attempt=branch?.attempts.at(-1);
   if(!attempt||attempt.status!=='pending'||!Number.isInteger(attempt.evidence?.tabId))throw new Error('NO_PENDING_BRANCH_TAB');
   const tab=await api.tabs.get(attempt.evidence.tabId),source=globalThis.TLCore.chatUrl(tab.url);
   const bind=await binding(api,tab.id);if(!bind||bind.experimentId!==row.id||bind.branch!==msg.branch)throw new Error('EXPERIMENT_BINDING_MISMATCH');
   const result=await ctx.startCapture({tabId:tab.id,scope:'all',live:false});
   await api.storage.session.set({['chatflow_exp_capture_'+result.captureId]:{...bind,captureId:result.captureId}});
   await advance(bind,{status:'pending',phase:'generating',operationId:bind.operationId+'_'+bind.branch+'_capture_start',
    updates:{conversationId:source.conversationId,sessionId:source.conversationId,sentAt:Date.now(),captureId:result.captureId},
    reason:'user manually requested capture after sending'});
   return{runId:result.captureId};
  });
  if(type==='FF_COMPARE')return serial(async()=>{
   const row=await DB.read(msg.experimentId);if(!row)throw new Error('EXPERIMENT_NOT_FOUND');
   await Core.verifyFrozen(row.frozen);if(row.decision?.mapping)return row.decision;
   if(!Core.eligibleForComparison(row))throw new Error('BOTH_BRANCHES_MUST_BE_DONE');
   const mapping=await Core.assignMapping(row,msg.operationId),saved=await DB.update(row.id,row.revision,r=>({...r,decision:mapping,revision:r.revision+1}));
   return saved.decision;
  });
  if(type==='FF_VERDICT')return serial(async()=>{
   if(!Number.isInteger(sender.tab?.id))throw new Error('EXPERIMENT_PAGE_TAB_REQUIRED');
   const cal=await api.storage.session.get('chatflow_exp_cal_'+sender.tab.id);
   if(!cal['chatflow_exp_cal_'+sender.tab.id]||Date.now()-cal['chatflow_exp_cal_'+sender.tab.id].passedAt>3600000)throw new Error('CALIBRATION_REQUIRED');
   const row=await DB.read(msg.experimentId);if(!row?.decision?.mapping)throw new Error('COMPARISON_MAPPING_REQUIRED');
   const verdict=Core.recordVerdict(row.decision,{preference:msg.preference,criteria:msg.criteria,confidence:msg.confidence,notes:msg.notes||''});
   const saved=await DB.update(row.id,row.revision,r=>({...r,decision:{...r.decision,verdict},revision:r.revision+1}));return saved.decision;
  });
  if(type==='FF_EXPORT'){const row=await DB.read(msg.experimentId);if(!row)throw new Error('EXPERIMENT_NOT_FOUND');await Core.verifyFrozen(row.frozen);return Core.exportSnapshot(row);}
  if(type==='FF_IMPORT')return serial(async()=>{
   const validated=await Core.validateImport(msg.snapshot);if(await DB.read(validated.id))throw new Error('EXPERIMENT_ID_COLLISION');
   const row={...validated,createOperationId:msg.snapshot.experiment.createOperationId||'import_'+id(),
    createdAt:Number.isSafeInteger(msg.snapshot.experiment.createdAt)?msg.snapshot.experiment.createdAt:Date.now()};
   await DB.createImported(row);return{id:row.id,revision:row.revision,branchCount:row.branchCount};
  });
  if(type==='FF_CALIBRATION'){
   const result=Core.judgeCalibration(msg.responses);
   if(result.pass&&Number.isInteger(sender.tab?.id))await api.storage.session.set({['chatflow_exp_cal_'+sender.tab.id]:{passedAt:Date.now()}});
   return result;
  }
  throw new Error('UNKNOWN_EXPERIMENT_MESSAGE');
 }
 async function onCaptureFinished(run,store,api){
  const key='chatflow_exp_capture_'+run.captureId,x=await api.storage.session.get(key),bind=x[key];if(!bind)return;
  const row=await DB.read(bind.experimentId),attempt=row?.branches?.[bind.branch]?.attempts.find(a=>a.id===bind.attemptId);
  if(!attempt||attempt.status!=='pending')return;
  const capture=await store.get('captures',run.captureId),snapshot=capture?.snapshot;
  if(!snapshot){await advance(bind,{status:'pending',phase:'capturing',operationId:bind.operationId+'_'+bind.branch+'_no_snapshot',reason:'capture completed without persisted snapshot'});return;}
  const users=snapshot.messages.filter(m=>m.role==='user'),assistants=snapshot.messages.filter(m=>m.role==='assistant'),last=assistants.at(-1);
  const reply=last?.text||'',classification=await Core.classify(row.frozen.text,users.at(-1)?.text,{trusted:true,complete:users.length>0});
  const signals=['final'];if(last?.finished===true)signals.push('generation');
  const captureComplete=snapshot.integrity?.state==='valid';
  const canComplete=captureComplete&&users.length===1&&reply.length>0&&last?.finished===true&&['exact','canonical_equivalent'].includes(classification.level);
  const updates={captureRunId:run.captureId,messageId:last?.id||null,inputLevel:classification.level,sessionId:snapshot.source.conversationId,
   conversationId:snapshot.source.conversationId,taskCount:users.length,reply,assistantBytes:new TextEncoder().encode(reply).length,
   captureComplete,persisted:true,endSignals:signals,capturedAt:Date.now()};
  if(canComplete){
   await advance(bind,{status:'done',phase:'capturing',operationId:bind.operationId+'_'+bind.branch+'_done',updates,reason:'complete snapshot; exact input; final assistant message finished'});
  }else{
   await advance(bind,{status:'pending',phase:'capturing',operationId:bind.operationId+'_'+bind.branch+'_capture_pending',updates,reason:'capture persisted but exact input or completion contract is not satisfied'});
  }
  await api.storage.session.remove(key);
 }
 async function onTabRemoved(tabId,api){
  const bind=await binding(api,tabId);if(!bind)return;
  const row=await DB.read(bind.experimentId),attempt=row?.branches?.[bind.branch]?.attempts.find(a=>a.id===bind.attemptId);
  if(attempt?.status==='pending')await advance(bind,{status:'unknown',phase:attempt.phase,operationId:bind.operationId+'_'+bind.branch+'_tab_closed',reason:'branch tab closed before confirmed completion; no replay'});
  await clearBinding(api,tabId);
 }
 globalThis.ChatFlowExperimentService=Object.freeze({handle,onTabUpdated,onCaptureFinished,onTabRemoved});
})();
