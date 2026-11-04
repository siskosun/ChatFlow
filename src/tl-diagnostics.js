/* Bounded local diagnostics. Never record raw messages, URLs, stacks or tokens. MIT. */
(() => {
  'use strict';
  const key = 'chatflowDiagnosticCodes', limit = 50;
  const operations = new Set(['experiment-tab-update','experiment-tab-close','handoff-announce','capture-stop','sidepanel-setup','workspace-refresh']);
  const types = new Set(['Error','TypeError','AbortError','QuotaExceededError','InvalidStateError']);
  let queue = Promise.resolve(), storageFailed = false;
  /** @param {string} operation Fixed allow-listed operation, never page content. */
  function record(operation, error) {
    if (!operations.has(operation)) return Promise.resolve(false);
    const entry = {operation, type: types.has(error?.name) ? error.name : 'Error', at: Date.now()};
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
    return row && operations.has(row.operation) && types.has(row.type) && Number.isFinite(row.at);
  }
  async function list() {
    await queue;
    const store = globalThis.chrome?.storage?.local;
    const rows = store ? (await store.get(key))[key] : [];
    return {rows: Array.isArray(rows) ? rows.filter(valid).slice(-limit).map(({operation,type,at})=>({operation,type,at})) : [], storageFailed};
  }
  globalThis.TLDiagnostics = Object.freeze({record,list});
})();
