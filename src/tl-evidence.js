/* Explicit evidence contracts. Hash consistency never proves provider completeness. MIT. */
(() => {
  'use strict';
  const C=globalThis.TLCore;
  const digest=value=>new C.SHA256().update(JSON.stringify(value)).hex();
  const ordered=rows=>rows.slice().sort((a,b)=>{const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;});
  function assetProjection(rows) {
    return ordered(rows.map(a=>({key:a.key,messageId:a.messageId,nodeId:a.nodeId,name:a.name,mime:a.mime,
      state:a.state,sha256:a.state==='saved'?a.sha256:null,size:a.state==='saved'?a.size:0,
      reason:a.reason||null,origin:a.origin||null,kind:a.kind||null,ref:a.ref||null,inLatestSnapshot:a.inLatestSnapshot!==false})));
  }
  function passageProjection(rows) {
    return ordered(rows.map(p=>{const x={...p};delete x.captureId;delete x.passageId;delete x.originPassageId;return x;}));
  }
  /** Subject covers snapshot, file references and saved passages, not verification receipts. */
  function subject(view) {
    C.check(view?.capture?.snapshot,'CAPTURE_NOT_READY');
    return digest({snapshot:C.persistedSnapshot(view.capture.snapshot),assets:assetProjection(view.assets||[]),
      passages:passageProjection(view.passages||[]),saveScope:view.capture.saveScope||'all'});
  }
  function validateReceipt(receipt) {
    C.check(receipt?.schema==='chatflow.verification/1'&&['backup','restore'].includes(receipt.kind)&&
      ['passed','failed'].includes(receipt.status),'INVALID_VERIFICATION_RECEIPT');
    C.check(/^[a-f0-9]{64}$/.test(receipt.subject||'')&&
      (receipt.archiveSha256===null||/^[a-f0-9]{64}$/.test(receipt.archiveSha256||'')), 'INVALID_VERIFICATION_HASH');
    C.check(Number.isSafeInteger(receipt.archiveBytes)&&receipt.archiveBytes>=0&&
      Number.isFinite(receipt.checkedAt)&&typeof receipt.version==='string'&&receipt.version.length<=40,'INVALID_VERIFICATION_METADATA');
    C.check(receipt.kind!=='restore'||receipt.imported===true,'RESTORE_IMPORT_NOT_EXECUTED');
    C.check(receipt.status!=='passed'||(/^[a-f0-9]{64}$/.test(receipt.archiveSha256||'')&&receipt.archiveBytes>0),'VERIFICATION_BYTES_REQUIRED');
    return {schema:receipt.schema,kind:receipt.kind,status:receipt.status,subject:receipt.subject,
      archiveSha256:receipt.archiveSha256,archiveBytes:receipt.archiveBytes,version:receipt.version,
      checkedAt:receipt.checkedAt,imported:receipt.imported===true,
      code:['BACKUP_VALIDATION_FAILED','RESTORE_READBACK_FAILED'].includes(receipt.code)?receipt.code:null};
  }
  function report(view) {
    const key=subject(view),receipts=(view.capture.verifications||[]).filter(r=>{
      try {validateReceipt(r);return true;} catch{return false;}
    });
    const latest=kind=>receipts.filter(r=>r.kind===kind).at(-1)||null;
    const describe=kind=>{const r=latest(kind);return {state:!r?'not_checked':r.subject!==key?'stale':r.status,receipt:r};};
    return {subject:key,local:view.capture.state,backup:describe('backup'),restore:describe('restore'),
      imported:!!view.capture.imported,files:{references:view.assets.length,saved:view.assets.filter(a=>a.state==='saved').length,
        excluded:view.assets.filter(a=>a.state==='excluded').length,
        unresolved:view.assets.filter(a=>!['saved','excluded'].includes(a.state)).length}};
  }
  const fileStates=new Set(['prepared','offered','page_ready','unknown','user_checked']);
  /** Page reports contain only batch indexes and observations; identity comes from frozen handoff files. */
  function validateFileEvidence(handoff,rows) {
    C.check(Array.isArray(rows)&&rows.length===handoff.batches[0].length,'INVALID_FILE_EVIDENCE');
    const seen=new Set();
    return rows.map(row=>{
      C.check(Number.isInteger(row.index)&&handoff.batches[0].includes(row.index)&&!seen.has(row.index),'INVALID_FILE_EVIDENCE_INDEX');
      seen.add(row.index);
      C.check(fileStates.has(row.state)&&row.state!=='user_checked','INVALID_FILE_EVIDENCE_STATE');
      C.check(row.state!=='page_ready'||row.basis==='exact_filename_ready','INVALID_FILE_EVIDENCE_BASIS');
      const file=handoff.files[row.index];
      return {index:row.index,state:row.state,basis:row.state==='page_ready'?'exact_filename_ready':null,
        sha256:file.sha256,size:file.size,uploadName:file.uploadName||file.name,
        attemptId:handoff.attemptId,documentId:handoff.targetDocumentId,observedAt:Date.now()};
    });
  }
  function fileReport(handoff,index) {
    const file=handoff.files[index],row=handoff.fileEvidence?.find(r=>r.index===index);
    const valid=row&&row.sha256===file.sha256&&row.uploadName===(file.uploadName||file.name)&&row.size===file.size&&row.attemptId===handoff.attemptId&&row.documentId===handoff.targetDocumentId;
    const checked=handoff.userFileChecks?.includes(index)===true;
    if(checked)return {state:'user_checked',pageState:valid?row.state:'unknown',observedAt:row?.observedAt||null};
    if(valid)return {state:row.state,observedAt:row.observedAt};
    if(row)return {state:'unknown',basis:'stale_evidence',observedAt:row.observedAt||null};
    return {state:handoff.evidenceVersion===1?'prepared':'legacy_unverified',observedAt:null};
  }
  globalThis.TLEvidence=Object.freeze({subject,assetProjection,passageProjection,validateReceipt,report,validateFileEvidence,fileReport});
})();
