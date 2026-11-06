/* Bounded local diagnostics. Never record raw messages, URLs, stacks or tokens. MIT. */
(() => {
  'use strict';
  const key = 'chatflowDiagnosticCodes', limit = 50;
  const operations = new Set(['experiment-tab-update','experiment-tab-close','handoff-announce','capture-stop','sidepanel-setup','workspace-refresh','handoff-inject']);
  const types = new Set(['Error','TypeError','AbortError','QuotaExceededError','InvalidStateError']);
  const handoffCodes = new Set([
    'HANDOFF_NOT_CONFIRMED','TARGET_NAVIGATION_UNCONFIRMED','COMPOSER_NOT_READY',
    'COMPOSER_UNAVAILABLE_OR_AMBIGUOUS','NON_STANDARD_CHAT','EXISTING_CHAT_REJECTED',
    'USER_DRAFT_PRESENT','USER_FILES_PRESENT','USER_DRAFT_CHANGED','PREFILL_NOT_CONFIRMED',
    'COMPOSER_REPLACED','GENERAL_FILE_INPUT_UNAVAILABLE_OR_AMBIGUOUS','FILE_INPUT_IS_SINGLE_ONLY',
    'HANDOFF_FILE_SIZE_CHANGED','HANDOFF_FILE_TRUNCATED','HANDOFF_FILE_HASH_MISMATCH',
    'EMPTY_FILE_REJECTED','EXTENSION_UNAVAILABLE','HANDOFF_TARGET_MISMATCH',
    'HANDOFF_ATTEMPT_MISMATCH','HANDOFF_ALREADY_FINISHED','CANCELLED_OR_TIMEOUT'
  ]);
  let queue = Promise.resolve(), storageFailed = false;
  /** @param {string} operation Fixed allow-listed operation, never page content. */
  function record(operation, error) {
    if (!operations.has(operation)) return Promise.resolve(false);
    const entry = {operation, type: types.has(error?.name) ? error.name : 'Error', at: Date.now(),
      ...(operation === 'handoff-inject' ? {code: handoffCodes.has(error?.message) ? error.message : 'HANDOFF_NOT_CONFIRMED'} : {})};
    const task = queue.then(async () => {
      const store = globalThis.chrome?.storage?.local;
      if (!store) {storageFailed = true; return false;}
      const old = (await store.get(key))[key];
      const rows = Array.isArray(old) ? old.filter(valid).slice(-(limit-1)) : [];
      await store.set({[key]: [...rows, entry]});
      return true;
    });
    queue = task.catch(() => {storageFailed = true;});
    return task.catch(() => false);
  }
  function valid(row) {
    return row && operations.has(row.operation) && types.has(row.type) && Number.isFinite(row.at) && (row.code === undefined || (row.operation === 'handoff-inject' && handoffCodes.has(row.code)));
  }
  async function list() {
    await queue;
    const store = globalThis.chrome?.storage?.local;
    let rows = [];
    try { if(store) rows = (await store.get(key))[key]; else storageFailed = true; }
    catch { storageFailed = true; }
    return {rows: Array.isArray(rows) ? rows.filter(valid).slice(-limit).map(({operation,type,at,code})=>({operation,type,at,...(code?{code}:{})})) : [], storageFailed};
  }
  globalThis.TLDiagnostics = Object.freeze({record,list});
})();
