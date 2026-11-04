async () => {
  const C=TLCore,S=TLStore,A=TLArchive,E=TLEvidence,P=TLPassages,checks=[];
  const check=(ok,code)=>{if(!ok)throw Error(code);};
  async function rejects(fn,pattern){let error;try{await fn();}catch(e){error=e;}check(error&&pattern.test(error.message),'EXPECTED_FAILURE_'+pattern);}
  async function seed(label,{missing=false}={}){
    const cid='conversation_evidence_'+label,id=C.id(),bytes=new TextEncoder().encode('SYNTHETIC_'+label);
    const snapshot=C.normalizeConversation({conversation_id:cid,title:'Synthetic evidence',current_node:'n',mapping:{
      n:{parent:null,children:[],message:{id:'m',author:{role:'user'},content:{parts:['Evidence source passage']},metadata:{attachments:[{id:'file_'+label,name:label+'.txt',size:bytes.length}]}}}
    }},'https://chatgpt.com/c/'+cid);
    await S.snapshot(id,snapshot);const key=snapshot.assets[0].key;
    if(missing)await S.failAsset(id,key,'DOWNLOAD_UNAVAILABLE');
    else{await S.beginAsset(id,key);await S.chunk(id,key,0,bytes);await S.finishAsset(id,key,'text/plain');}
    await S.finishCapture(id);
    const passage=P.create({captureId:id,snapshot,message:snapshot.messages[0],text:'Evidence',startOffset:0,endOffset:8});
    await S.putPassage(passage);
    return{id,key,bytes,snapshot,passage};
  }
  const original=await seed('complete'),before=await S.readArchive(original.id),initial=E.summary(before);
  check(initial.local==='ready'&&initial.backup.state==='not_executed'&&initial.restore.state==='not_executed','LOCAL_SAVE_OVERCLAIM');
  const count=(await S.all('captures')).length;
  const core=await A.exportCapture(original.id);
  check(JSON.stringify(await S.readArchive(original.id))===JSON.stringify(before),'CORE_EXPORT_MUTATED_SOURCE');
  const exported=await E.exportCapture(original.id),after=await S.readArchive(original.id),report=E.summary(after);
  check(exported.evidence.persisted&&report.backup.state==='validated','BACKUP_EVIDENCE_MISSING');
  check(report.restore.state==='not_executed'&&(await S.all('captures')).length===count,'BACKUP_PRETENDED_IMPORT');
  check(report.backup.record.zipSha256===await C.hashBlob(exported.blob),'BACKUP_WRONG_FILE');
  check(report.backup.record.sourceKey===E.versionOf(before),'BACKUP_WRONG_VERSION');
  checks.push('local_save_zip_validation_and_actual_restore_are_separate');
  const restored=await E.restore(exported.blob);
  check(restored.verified&&restored.evidence.persisted,'READBACK_FAILED_'+restored.code);
  const imported=await S.readArchive(restored.captureId),restoredReport=E.summary(imported);
  check(restoredReport.restore.state==='validated'&&restoredReport.backup.state==='not_executed','RESTORE_EVIDENCE_INCORRECT');
  check(imported.passages.length===1&&imported.passages[0].originPassageId===original.passage.passageId,'PASSAGE_READBACK');
  check(imported.assets[0].sha256===after.assets[0].sha256,'FILE_READBACK');
  checks.push('actual_idb_commit_and_source_file_passage_readback');
  const changed=await S.get('captures',original.id);changed.snapshot.title='Changed snapshot';await S.set('captures',changed);
  check(E.summary(await S.readArchive(original.id)).backup.state==='stale','STALE_PROOF_REUSED');
  await S.set('captures',after.capture);
  await S.updatePassageColor(original.passage.passageId,'green');
  check(E.summary(await S.readArchive(original.id)).backup.state==='stale','PASSAGE_CHANGE_NOT_INVALIDATED');
  checks.push('snapshot_and_passage_changes_invalidate_version_bound_proof');
  const missing=await seed('missing',{missing:true}),partial=await E.exportCapture(missing.id),partialRestore=await E.restore(partial.blob);
  check(partial.manifest.state==='partial'&&partialRestore.verified,'PARTIAL_ARCHIVE_CANNOT_RESTORE');
  const partialView=await S.readArchive(partialRestore.captureId),partialReport=E.summary(partialView);
  check(partialReport.local==='partial'&&partialReport.restore.state==='validated'&&partialView.assets[0].state==='unavailable','PARTIAL_RESTORE_OVERCLAIM');
  checks.push('partial_content_can_have_valid_backup_and_verified_restore');
  // A successful check is historical evidence, not a promise of future integrity.
  const row=imported.assets[0],payload=await S.get('files',row.sha256);
  await S.set('files',{...payload,blob:new Blob(['tampered']),size:8});
  await rejects(()=>E.verifyRestored(restored.captureId,exported.blob),/LOCAL_FILE_HASH_MISMATCH/);
  await S.set('files',payload);
  checks.push('post_import_corruption_is_detected_on_recheck');
  const entries=await A.readZip(core.blob);
  for(const schema of ['chatflow.archive/1','threadline.archive/1']){
    const manifest=structuredClone(core.manifest);manifest.schema=schema;manifest.formatVersion=1;
    const packed=[];for(const entry of entries.values())packed.push({name:entry.name,blob:entry.name==='manifest.json'?new Blob([JSON.stringify(manifest)]):await entry.blob()});
    const legacy=await E.restore(await A.buildZip(packed));check(legacy.verified,'LEGACY_READBACK_'+legacy.code);
  }
  checks.push('legacy_archive_formats_keep_actual_restore_verification');
  const panel=TLEvidenceUI.panel(partialView);document.body.append(panel);
  check(panel.querySelector('[data-evidence="backup"]').dataset.state==='not_executed','UI_BACKUP_OVERCLAIM');
  check(panel.querySelector('[data-evidence="restore"]').dataset.state==='validated','UI_RESTORE_NOT_SHOWN');
  panel.remove();checks.push('plain_state_panel_preserves_partial_and_actual_proofs');
  return checks.map(name=>({name,result:'pass'}));
}
