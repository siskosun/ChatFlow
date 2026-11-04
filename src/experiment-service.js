/* ChatFlow controlled parallel-session orchestration. No automatic Send or retry. */
(() => {
 'use strict';
 const Core=globalThis.ChatFlowExperimentCore,DB=globalThis.ChatFlowExperimentDB,P=globalThis.ChatFlowProviders;
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
 async function clearBinding(api,tabId){await api.storage.session.remove([BIND+tabId,HANDOFF+tabId]);}
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
 async function invalidateAttempt(api,bind,reason){
  if(!bind||bind.invalid)return;
  await saveBinding(api,bind.tabId,{...bind,invalid:true});
  await advance(bind,{status:'unknown',operationId:bind.operationId+'_'+bind.branch+'_identity_rejected',
   reason:'branch identity could not be verified ('+reason+'); no capture or automatic retry'});
 }
 async function onTabUpdated(api,tabId,change){
  // The first URL transition after the user gesture is the only conversation
  // this attempt may capture. Navigating without the gesture is terminal.
  if(change.url)await serial(async()=>{
   const b=await binding(api,tabId);
   if(!b?.prefillDocumentId||b.invalid)return;
   const row=await DB.read(b.experimentId),attempt=row?.branches?.[b.branch]?.attempts.find(a=>a.id===b.attemptId);
   if(!attempt||attempt.status!=='pending')return;
   let source=null;
   try{source=P.identify(change.url).identity;}catch{
    try{const target=P.identify(change.url,{target:true}).identity;
     if(!b.firstConversationId&&target.origin===b.prefillOrigin)return;
    }catch{}
    await invalidateAttempt(api,b,'NAVIGATED_OUTSIDE_BOUND_CONVERSATION');return;
   }
   if(source.origin!==b.prefillOrigin||(b.firstConversationId&&b.firstConversationId!==source.conversationId)){
    await invalidateAttempt(api,b,'CONVERSATION_CHANGED');return;
   }
   if(!b.firstConversationId){
    if(b.sendIntentDocumentId!==b.prefillDocumentId){
     await invalidateAttempt(api,b,'NO_VERIFIED_MANUAL_SEND_INTENT');return;
    }
    await saveBinding(api,tabId,{...b,firstConversationId:source.conversationId});
    await advance(b,{status:'pending',phase:attempt.phase,
     operationId:b.operationId+'_'+b.branch+'_first_conversation',
     updates:{firstConversationId:source.conversationId},reason:'first observed new-chat conversation URL bound to attempt'});
   }
  });
  if(change.status==='complete'){
   const x=await api.storage.session.get(HANDOFF+tabId);
   if(x[HANDOFF+tabId])await sendReady(api,tabId);
  }
 }
 async function claimHandoff(api,sender){
  return serial(async()=>{
   if(sender?.id!==api.runtime.id||!Number.isInteger(sender.tab?.id)||!sender.documentId)throw new Error('EXPERIMENT_SOURCE_DOCUMENT_REQUIRED');
   // Content scripts run on every ChatGPT page. Check for a tab-bound handoff
   // before applying the new-chat-only URL gate; ordinary conversation pages
   // with no pending experiment must be a silent no-op.
   const tabId=sender.tab.id,x=await api.storage.session.get(HANDOFF+tabId),h=x[HANDOFF+tabId];
   if(!h)return null;
   const tab=await api.tabs.get(tabId),target=P.identify(tab.url,{target:true}).identity;
   const senderTarget=P.identify(sender.url,{target:true}).identity;
   if(senderTarget.origin!==target.origin)throw new Error('EXPERIMENT_SOURCE_NAVIGATED');
   const bind=await binding(api,tabId);
   if(!bind||bind.invalid||bind.experimentId!==h.experimentId||bind.branch!==h.branch)throw new Error('EXPERIMENT_BINDING_MISMATCH');
   if(bind.claimDocumentId&&bind.claimDocumentId!==sender.documentId)throw new Error('EXPERIMENT_DOCUMENT_CHANGED');
   await saveBinding(api,tabId,{...bind,claimDocumentId:sender.documentId,claimOrigin:target.origin});
   await api.storage.session.remove(HANDOFF+tabId);
   return {...h,attemptId:bind.attemptId,operationId:bind.operationId};
  });
 }
 async function prefillAck(api,msg,sender){
  return serial(async()=>{
   if(sender?.id!==api.runtime.id||!Number.isInteger(sender.tab?.id)||!sender.documentId)throw new Error('EXPERIMENT_SOURCE_DOCUMENT_REQUIRED');
   const b=await binding(api,sender.tab.id);
   if(!b||b.invalid||b.experimentId!==msg.experimentId||b.branch!==msg.branch||b.attemptId!==msg.attemptId)throw new Error('EXPERIMENT_BINDING_MISMATCH');
   const tab=await api.tabs.get(sender.tab.id),target=P.identify(tab.url,{target:true}).identity;
   const senderTarget=P.identify(sender.url,{target:true}).identity;
   if(b.claimDocumentId!==sender.documentId||b.claimOrigin!==target.origin||senderTarget.origin!==target.origin){
    await invalidateAttempt(api,b,'PREFILL_DOCUMENT_CHANGED');throw new Error('EXPERIMENT_DOCUMENT_CHANGED');
   }
   if(b.prefillDocumentId&&b.prefillDocumentId!==sender.documentId){
    await invalidateAttempt(api,b,'PREFILL_REACK_DOCUMENT_CHANGED');throw new Error('EXPERIMENT_DOCUMENT_CHANGED');
   }
   const saved={...b,prefillDocumentId:sender.documentId,prefillOrigin:target.origin,prefillAt:Date.now()};
   await saveBinding(api,sender.tab.id,saved);
   return advance(saved,{status:'pending',phase:'awaiting_send',operationId:b.operationId+'_'+b.branch+'_prefill_ack',
    updates:{prefill:'exact_ack',inputLevel:'exact',tabId:sender.tab.id,prefillDocumentId:sender.documentId},
    reason:'composer prefill exact readback and document identity verified'});
  });
 }
 async function manualSendIntent(api,msg,sender){return serial(async()=>{
  if(sender?.id!==api.runtime.id||!Number.isInteger(sender.tab?.id)||!sender.documentId)throw Error('EXPERIMENT_SOURCE_DOCUMENT_REQUIRED');
  const b=await binding(api,sender.tab.id),row=b?await DB.read(b.experimentId):null;
  const attempt=row?.branches?.[b?.branch]?.attempts.find(a=>a.id===b?.attemptId);
  if(!b||b.invalid||!attempt||attempt.status!=='pending'||attempt.phase!=='awaiting_send'||
     b.experimentId!==msg.experimentId||b.branch!==msg.branch||b.attemptId!==msg.attemptId||
     b.prefillDocumentId!==sender.documentId)throw Error('EXPERIMENT_SEND_INTENT_UNBOUND');
  const tab=await api.tabs.get(sender.tab.id),target=P.identify(tab.url,{target:true}).identity;
  const page=P.identify(sender.url,{target:true}).identity;
  if(target.origin!==b.prefillOrigin||page.origin!==b.prefillOrigin){
   await invalidateAttempt(api,b,'SEND_INTENT_NAVIGATED');throw Error('EXPERIMENT_SEND_INTENT_NAVIGATED');
  }
  if(b.sendIntentDocumentId===sender.documentId)return{observed:true};
  await saveBinding(api,b.tabId,{...b,sendIntentDocumentId:sender.documentId,sendIntentAt:Date.now()});
  await advance(b,{status:'pending',phase:'awaiting_send',operationId:b.operationId+'_'+b.branch+'_send_intent',
   updates:{sendIntentObserved:true},reason:'trusted user click/Enter observed on exact prefilled composer; not proof of server send'});
  return{observed:true};
 });}
 async function handle(msg,sender,api,ctx){
  const type=msg?.type;
  if(type==='tl:claimExperimentHandoff')return claimHandoff(api,sender);
  if(type==='tl:experimentPrefillAck')return prefillAck(api,msg,sender);
  if(type==='tl:experimentSendIntent')return manualSendIntent(api,msg,sender);
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
   const branchLabels=Object.keys(row.branches);
   for(const branch of branchLabels){
    const current=row.branches[branch],last=current.attempts.at(-1);
    if(last?.status==='pending')throw new Error('BRANCH_STILL_PENDING:'+branch);
    if(current.status==='done')throw new Error('COMPLETED_BRANCH_IMMUTABLE:'+branch);
   }
   // Each experiment page is a real extension tab; never place branches in an
   // unrelated active window, and never create/open a hidden fallback session.
   const windowId=sender?.tab?.windowId;
   if(!Number.isInteger(windowId))throw new Error('WORKSPACE_WINDOW_REQUIRED');
   const created=[],tabIds={},attemptIds={};let committed=false;
   try{
    // Reserve and bind every target before opening any ChatGPT destination.
    for(const branch of branchLabels){
     const tab=await api.tabs.create({active:false,windowId});
     created.push(tab.id);
     const attemptId='att_'+id(),bind={experimentId:row.id,branch,attemptId,operationId:msg.operationId,tabId:tab.id,createdAt:Date.now()};
     await saveBinding(api,tab.id,bind);
     await api.storage.session.set({[HANDOFF+tab.id]:{text:row.frozen.text,experimentId:row.id,branch}});
     tabIds[branch]=tab.id;attemptIds[branch]=attemptId;
    }
    // One IndexedDB transaction commits all branches or none. Each branch
    // retains its own signed operation history and expected revision.
    row=await DB.update(row.id,row.revision,previous=>{
     let next=previous;
     for(const branch of branchLabels){
      next=Core.advance(next,{branch,expectedRevision:next.revision,
       operationId:msg.operationId+'_'+branch,attemptId:attemptIds[branch],
       status:'pending',phase:'created',
       manualNewAttempt:['failed','unknown'].includes(next.branches[branch].status),
       reason:'new inactive ChatGPT tab; manual send required',evidence:{tabId:tabIds[branch]}});
     }
     return next;
    },branchLabels.length);
    committed=true;
    for(const tabId of created)await api.tabs.update(tabId,{url:'https://chatgpt.com/'});
    for(const tabId of created)await sendReady(api,tabId);
    return{tabIds,attemptIds,revision:row.revision,branchCount:branchLabels.length};
   }catch(error){
    if(committed){
     // A browser operation is not an IndexedDB transaction. After a failed
     // navigation, mark every affected attempt unknown rather than leaving
     // a misleading partially pending run.
     try{
      const latest=await DB.read(row.id);
      await DB.update(latest.id,latest.revision,previous=>{
       let next=previous;
       for(const branch of branchLabels)next=Core.advance(next,{
        branch,expectedRevision:next.revision,
        operationId:'abort_'+id(),attemptId:attemptIds[branch],
        status:'unknown',phase:'created',
        reason:'launch navigation failed; no automatic retry',evidence:{tabId:tabIds[branch]}});
       return next;
      },branchLabels.length);
     }catch{/* Retain the original launch error; uncertain states require review. */}
    }
    for(const tabId of created){
     try{await clearBinding(api,tabId);}catch{/* a stale key does not authorize replay */}
     try{await api.tabs.remove(tabId);}catch{/* tab may have already closed */}
    }
    throw error;
   }
  });
  if(type==='FF_REPREFILL')return serial(async()=>{
   if(!validId(msg.operationId))throw new Error('EXPLICIT_REPREFILL_OPERATION_REQUIRED');
   const row=await DB.read(msg.experimentId),branch=row?.branches?.[msg.branch],attempt=branch?.attempts.at(-1);
   if(!attempt||attempt.status!=='pending'||!Number.isInteger(attempt.evidence?.tabId))throw new Error('NO_PENDING_BRANCH_TAB');
   const tabId=attempt.evidence.tabId,tab=await api.tabs.get(tabId);P.identify(tab.url,{target:true}).identity;
   const b=await binding(api,tabId);if(!b||b.experimentId!==row.id||b.branch!==msg.branch)throw new Error('EXPERIMENT_BINDING_MISMATCH');
   await api.storage.session.set({[HANDOFF+tabId]:{text:row.frozen.text,experimentId:row.id,branch:msg.branch}});
   await sendReady(api,tabId);return{tabId};
  });
  if(type==='FF_CAPTURE')return serial(async()=>{
   const row=await DB.read(msg.experimentId),branch=row?.branches?.[msg.branch],attempt=branch?.attempts.at(-1);
   if(!attempt||attempt.status!=='pending'||!Number.isInteger(attempt.evidence?.tabId))throw new Error('NO_PENDING_BRANCH_TAB');
   if(attempt.evidence.captureId)throw new Error('BRANCH_CAPTURE_ALREADY_STARTED');
   const tab=await api.tabs.get(attempt.evidence.tabId),bind=await binding(api,tab.id);
   if(!bind||bind.invalid||bind.experimentId!==row.id||bind.branch!==msg.branch||bind.attemptId!==attempt.id)throw new Error('EXPERIMENT_BINDING_MISMATCH');
   if(!bind.prefillDocumentId||!bind.firstConversationId||
      bind.sendIntentDocumentId!==bind.prefillDocumentId||attempt.evidence.sendIntentObserved!==true||
      attempt.evidence.prefillDocumentId!==bind.prefillDocumentId||
      attempt.evidence.firstConversationId!==bind.firstConversationId){
    await invalidateAttempt(api,bind,'FIRST_CONVERSATION_NOT_BOUND');throw new Error('EXPERIMENT_CONVERSATION_UNVERIFIED');
   }
   let source,probe;
   try{
    source=P.identify(tab.url).identity;
    if(source.origin!==bind.prefillOrigin||source.conversationId!==bind.firstConversationId)throw Error('CONVERSATION_CHANGED');
    const frames=await api.scripting.executeScript({target:{tabId:tab.id,allFrames:false},func:()=>location.href});
    if(!Array.isArray(frames)||frames.length!==1||frames[0].frameId!==0||
       !frames[0].documentId||frames[0].documentId!==bind.prefillDocumentId||frames[0].result!==tab.url)
     throw Error('DOCUMENT_CHANGED');
    probe=frames[0];
    const again=await api.tabs.get(tab.id);
    if(again.url!==tab.url)throw Error('CONVERSATION_CHANGED');
   }catch{
    await invalidateAttempt(api,bind,'CAPTURE_TAB_OR_DOCUMENT_MISMATCH');throw Error('EXPERIMENT_CAPTURE_IDENTITY_MISMATCH');
   }
   const result=await ctx.startCapture({tabId:tab.id,scope:'all',live:false,
    expectedDocumentId:probe.documentId,expectedConversationId:source.conversationId});
   const captureBind={...bind,captureDocumentId:probe.documentId,captureId:result.captureId};
   await saveBinding(api,tab.id,captureBind);
   await api.storage.session.set({['chatflow_exp_capture_'+result.captureId]:captureBind});
   await advance(captureBind,{status:'pending',phase:'capturing',operationId:bind.operationId+'_'+bind.branch+'_capture_start',
    updates:{conversationId:source.conversationId,sessionId:source.conversationId,
     captureDocumentId:probe.documentId,sentAt:Date.now(),captureId:result.captureId},
    reason:'user-requested capture; bound original prefill document and first conversation'});
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
 async function onCaptureFinished(run,store,api){return serial(async()=>{
  const key='chatflow_exp_capture_'+run.captureId,x=await api.storage.session.get(key),bind=x[key];if(!bind)return;
  const row=await DB.read(bind.experimentId),attempt=row?.branches?.[bind.branch]?.attempts.find(a=>a.id===bind.attemptId);
  if(!attempt||attempt.status!=='pending')return;
  const current=await binding(api,bind.tabId),capture=await store.get('captures',run.captureId),snapshot=capture?.snapshot;
  let tab;
  try{tab=await api.tabs.get(bind.tabId);}catch{}
  let identity;
  try{if(tab)identity=P.identify(tab.url).identity;}catch{}
  if(!current||current.invalid||current.attemptId!==bind.attemptId||
     current.firstConversationId!==bind.firstConversationId||
     current.prefillDocumentId!==bind.prefillDocumentId||
     current.captureDocumentId!==bind.captureDocumentId||
     bind.captureDocumentId!==attempt.evidence.captureDocumentId||
     (run.documentId&&run.documentId!==bind.captureDocumentId)||
     (run.tabId!=null&&run.tabId!==bind.tabId)||
     identity?.conversationId!==bind.firstConversationId||
     identity?.origin!==bind.prefillOrigin||
     snapshot?.source?.conversationId!==bind.firstConversationId||
     snapshot?.source?.origin!==bind.prefillOrigin){
   await invalidateAttempt(api,bind,'CAPTURE_FINISHED_ON_DIFFERENT_DOCUMENT');
   await api.storage.session.remove(key);return;
  }
  if(!snapshot){await advance(bind,{status:'pending',phase:'capturing',operationId:bind.operationId+'_'+bind.branch+'_no_snapshot',reason:'capture completed without persisted snapshot'});return;}
  const users=snapshot.messages.filter(m=>m.role==='user'),assistants=snapshot.messages.filter(m=>m.role==='assistant'),last=assistants.at(-1);
  const reply=last?.text||'',classification=await Core.classify(row.frozen.text,users.at(-1)?.text,{trusted:true,complete:users.length>0});
  const signals=['final'];if(last?.finished===true)signals.push('generation');
  const captureComplete=capture?.state==='ready'&&snapshot.integrity?.state==='valid';
  // First-route observation alone cannot distinguish a newly created conversation
  // from an old one the user visited just after clicking Send. Require the
  // server-issued message timestamp to agree with the observed send intent.
  // Unknown/missing timestamps fail closed; allow two minutes of clock skew.
  const sendTime=users[0]?.timestamp*1000;
  const timelyInput=users.length===1&&Number.isFinite(sendTime)&&sendTime>0&&
   Number.isFinite(bind.sendIntentAt)&&sendTime>=bind.sendIntentAt-120000&&sendTime<=Date.now()+120000;
  const canComplete=captureComplete&&timelyInput&&reply.length>0&&last?.finished===true&&['exact','canonical_equivalent'].includes(classification.level);
  const updates={sendTimestampVerified:timelyInput,captureRunId:run.captureId,messageId:last?.id||null,inputLevel:classification.level,sessionId:snapshot.source.conversationId,
   conversationId:snapshot.source.conversationId,taskCount:users.length,reply,assistantBytes:new TextEncoder().encode(reply).length,
   captureComplete,persisted:true,endSignals:signals,capturedAt:Date.now()};
  if(canComplete){
   await advance(bind,{status:'done',phase:'capturing',operationId:bind.operationId+'_'+bind.branch+'_done',updates,reason:'complete snapshot; exact input; final assistant message finished'});
  }else if(captureComplete&&!timelyInput){
   await advance(bind,{status:'unknown',phase:'capturing',operationId:bind.operationId+'_'+bind.branch+'_input_timestamp_unverified',updates,
    reason:'captured conversation was not proven newly sent after the frozen prefill; cannot attribute to this attempt'});
  }else{
   await advance(bind,{status:'pending',phase:'capturing',operationId:bind.operationId+'_'+bind.branch+'_capture_pending',updates,reason:'capture persisted but exact input or completion contract is not satisfied'});
  }
  await api.storage.session.remove(key);
 });}
 async function recover(api,store){
  for(const row of await DB.list()){
   for(const [branch,state] of Object.entries(row.branches||{})){
    const attempt=state.attempts.at(-1);if(!attempt||attempt.status!=='pending')continue;
    const tabId=attempt.evidence?.tabId,bind=Number.isInteger(tabId)?await binding(api,tabId):null;
    if(!bind||bind.experimentId!==row.id||bind.branch!==branch||bind.attemptId!==attempt.id){
     await advance({experimentId:row.id,branch,attemptId:attempt.id,operationId:attempt.operationId,tabId},
      {status:'unknown',phase:attempt.phase,operationId:attempt.operationId+'_'+branch+'_binding_lost',reason:'experiment tab binding unavailable after browser restart; no replay'});
     continue;
    }
    try{await api.tabs.get(tabId);}catch{
     await advance(bind,{status:'unknown',phase:attempt.phase,operationId:bind.operationId+'_'+branch+'_tab_missing',reason:'experiment branch tab no longer exists; no replay'});continue;
    }
    const captureId=attempt.evidence?.captureId;
    if(captureId){
     const capture=await store.get('captures',captureId);
     if(capture&&['ready','partial'].includes(capture.state)){
      await onCaptureFinished({captureId,tabId},store,api);
     }else if(!capture||['interrupted','error','cancelled'].includes(capture.state)){
      await advance(bind,{status:'unknown',phase:attempt.phase,operationId:bind.operationId+'_'+branch+'_capture_interrupted',reason:'branch capture did not finish before worker/browser restart; no replay'});
     }
    }
   }
  }
 }
 async function onTabRemoved(tabId,api){
  const bind=await binding(api,tabId);if(!bind)return;
  const row=await DB.read(bind.experimentId),attempt=row?.branches?.[bind.branch]?.attempts.find(a=>a.id===bind.attemptId);
  if(attempt?.status==='pending')await advance(bind,{status:'unknown',phase:attempt.phase,operationId:bind.operationId+'_'+bind.branch+'_tab_closed',reason:'branch tab closed before confirmed completion; no replay'});
  await clearBinding(api,tabId);
 }
 globalThis.ChatFlowExperimentService=Object.freeze({handle,onTabUpdated,onCaptureFinished,onTabRemoved,recover});
})();
