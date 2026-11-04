/* Version-bound backup and actual-restore evidence. Core archive I/O stays unchanged. MIT. */
(() => {
  'use strict';
  const C = globalThis.TLCore, S = globalThis.TLStore, A = globalThis.TLArchive;
  const LIMITS = Object.freeze({ history: 12, metadataBytes: 32 * 1024 ** 2 });
  const fail = error => /^[A-Z0-9_]{2,100}$/.test(error?.message || '') ? error.message : 'EVIDENCE_CHECK_FAILED';
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const out = Object.create(null);
      for (const key of Object.keys(value).sort()) if (value[key] !== undefined) out[key] = canonical(value[key]);
      return out;
    }
    return value;
  }
  const digest = value => new C.SHA256().update(JSON.stringify(canonical(value))).hex();
  const sorted = rows => rows.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  function files(rows) {
    return sorted(rows.map(row => ({ key: row.key, messageId: row.messageId, nodeId: row.nodeId,
      name: row.name, state: row.state === 'saved' ? 'saved' : row.state === 'excluded' ? 'excluded' : 'unavailable',
      size: row.state === 'saved' ? row.size : 0, sha256: row.state === 'saved' ? row.sha256 : null,
      inLatestSnapshot: row.inLatestSnapshot !== false,
      reason: row.state === 'saved' ? null : row.state === 'excluded' ? 'OUT_OF_SAVE_SCOPE' : row.reason || 'IMPORTED_FILE_UNAVAILABLE' })));
  }
  function passages(rows) {
    const keys = ['conversationId','messageId','nodeId','role','text','prefix','suffix','startOffset','endOffset',
      'occurrence','snapshotHash','messageHash','color','createdAt','updatedAt','reanchoredAt','previousMessageHash'];
    return sorted(rows.map(row => {
      const out = { key: row.originPassageId || row.passageId };
      for (const key of keys) out[key] = row[key] ?? null;
      return out;
    }));
  }
  function versionOf(view) {
    C.check(view?.capture?.snapshot, 'CAPTURE_NOT_READY');
    return digest({ snapshotSha256: new C.SHA256().update(JSON.stringify(C.persistedSnapshot(view.capture.snapshot), null, 2)).hex(),
      saveScope: view.capture.saveScope || 'all', files: files(view.assets), passages: passages(view.passages || []) });
  }
  const manifestVersion = manifest => digest({ snapshotSha256: manifest.snapshotSha256,
    saveScope: manifest.saveScope || 'all', files: files(manifest.files), passages: passages(manifest.passages || []) });
  function semanticSnapshot(snapshot) {
    const value = C.persistedSnapshot(snapshot);
    delete value.capturedAt;
    return digest(value);
  }
  let buildInfo;
  async function buildIdentity() {
    if (!buildInfo) buildInfo = (async () => {
      const version = chrome.runtime.getManifest().version;
      try {
        const response = await fetch(chrome.runtime.getURL('BUILD_INFO.json'));
        if (!response.ok) throw Error('BUILD_ID_UNAVAILABLE');
        const value = await response.json();
        return { version, sourceCommit: /^[a-f0-9]{40}$/.test(value.source_commit || '') ? value.source_commit : null };
      } catch { return { version, sourceCommit: null }; }
    })();
    return buildInfo;
  }
  /** Only audit metadata changes. A concurrent capture update is never overwritten. */
  async function append(captureId, record) {
    C.check(['backup','restore'].includes(record.kind) && ['validated','failed'].includes(record.status), 'INVALID_EVIDENCE');
    C.check(/^[a-f0-9]{64}$/.test(record.sourceKey || ''), 'INVALID_EVIDENCE_SOURCE');
    const db = await S.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('captures', 'readwrite'), store = tx.objectStore('captures'), request = store.get(captureId);
      let error;
      request.onsuccess = () => {
        try {
          const capture = request.result; C.check(capture, 'CAPTURE_NOT_FOUND');
          const audit = [...(Array.isArray(capture.evidenceHistory) ? capture.evidenceHistory : []), record].slice(-LIMITS.history);
          store.put({ ...capture, evidenceHistory: audit });
        } catch (failure) { error = failure; tx.abort(); }
      };
      tx.oncomplete = () => resolve(record);
      tx.onabort = tx.onerror = () => reject(error || tx.error || Error('EVIDENCE_WRITE_FAILED'));
    });
  }
  async function record(captureId, value) {
    const entry = { schema: 'chatflow.evidence/1', id: C.id(), at: new Date().toISOString(),
      build: await buildIdentity(), ...value };
    try { await append(captureId, entry); return { entry, persisted: true }; }
    catch (error) { return { entry, persisted: false, warning: fail(error) }; }
  }
  /** ZIP parse validation is deliberately not a database restore. */
  async function exportCapture(captureId) {
    const before = await S.readArchive(captureId), sourceKey = versionOf(before);
    let output;
    try { output = await A.exportCapture(captureId); }
    catch (error) {
      await record(captureId, { kind: 'backup', status: 'failed', sourceKey, code: fail(error) });
      throw error;
    }
    const evidence = await record(captureId, { kind: 'backup', status: 'validated',
      sourceKey: manifestVersion(output.manifest), snapshotSha256: output.manifest.snapshotSha256,
      zipSha256: await C.hashBlob(output.blob), zipBytes: output.blob.size,
      archiveState: output.manifest.state, code: 'ZIP_RESTORE_PARSE_PASSED_NOT_IMPORTED' });
    return { ...output, evidence };
  }
  async function metadata(blob) {
    const entries = await A.readZip(blob);
    async function json(name) {
      const entry = entries.get(name); C.check(entry && entry.size <= LIMITS.metadataBytes, 'ARCHIVE_METADATA_TOO_LARGE');
      return JSON.parse(await (await entry.blob()).text());
    }
    return { manifest: A.validateManifest(await json('manifest.json')), raw: await json('conversation.json') };
  }
  async function verifyRestored(captureId, blob) {
    const { manifest, raw } = await metadata(blob), expected = A.validatedSnapshot(raw), view = await S.readArchive(captureId);
    C.check(semanticSnapshot(view.capture.snapshot) === semanticSnapshot(expected), 'RESTORE_READBACK_SNAPSHOT_MISMATCH');
    C.check((view.capture.saveScope || 'all') === (manifest.saveScope || 'all'), 'RESTORE_READBACK_SCOPE_MISMATCH');
    const byKey = new Map(expected.assets.map(row => [row.key, row]));
    const expectedFiles = manifest.files.map(row => ({ ...byKey.get(row.key), ...row,
      name: C.safeName(row.name || byKey.get(row.key)?.name),
      reason: row.state === 'saved' ? null : row.state === 'excluded' ? 'OUT_OF_SAVE_SCOPE' :
        typeof row.reason === 'string' && /^[A-Z0-9_]+$/.test(row.reason) ? row.reason : 'IMPORTED_FILE_UNAVAILABLE' }));
    C.check(digest(files(view.assets)) === digest(files(expectedFiles)), 'RESTORE_READBACK_ASSET_MISMATCH');
    C.check(digest(passages(view.passages || [])) === digest(passages(manifest.passages || [])), 'RESTORE_READBACK_PASSAGE_MISMATCH');
    const verified = new Set();
    for (const row of view.assets) if (row.state === 'saved' && !verified.has(row.sha256)) {
      const stored = await S.verifiedBlob(row.sha256);
      C.check(stored.size === row.size, 'RESTORE_READBACK_BYTES_MISMATCH'); verified.add(row.sha256);
    }
    return { sourceKey: versionOf(view), zipSha256: await C.hashBlob(blob), zipBytes: blob.size,
      snapshotSha256: manifest.snapshotSha256, archiveState: view.capture.state,
      verifiedFiles: verified.size, verifiedReferences: view.assets.filter(row => row.state === 'saved').length };
  }
  /** A failed read-back after import returns the capture ID; it never pretends no import happened. */
  async function restore(blob) {
    const captureId = await A.restore(blob);
    let result;
    try { result = await verifyRestored(captureId, blob); }
    catch (error) {
      let evidence;
      try { evidence = await record(captureId, { kind: 'restore', status: 'failed',
        sourceKey: versionOf(await S.readArchive(captureId)), zipSha256: await C.hashBlob(blob), zipBytes: blob.size, code: fail(error) }); }
      catch { evidence = { persisted: false, warning: 'RESTORE_EVIDENCE_UNAVAILABLE' }; }
      return { captureId, verified: false, code: fail(error), evidence };
    }
    const evidence = await record(captureId, { kind: 'restore', status: 'validated', ...result, code: 'DATABASE_READBACK_PASSED' });
    return { captureId, verified: true, evidence };
  }
  function summary(view) {
    const sourceKey = versionOf(view), history = view.capture.evidenceHistory || [];
    const latest = kind => {
      const entries = history.filter(entry => entry.schema === 'chatflow.evidence/1' && entry.kind === kind);
      const current = entries.filter(entry => entry.sourceKey === sourceKey).at(-1);
      return current ? { state: current.status, record: current, current: true } :
        entries.length ? { state: 'stale', record: entries.at(-1), current: false } : { state: 'not_executed', record: null, current: false };
    };
    return { local: view.capture.state, live: !!view.capture.live, sourceKey,
      backup: latest('backup'), restore: latest('restore'),
      coverage: view.capture.snapshot.integrity.state,
      saved: view.assets.filter(row => row.state === 'saved').length,
      missing: view.assets.filter(row => row.state !== 'saved' && row.state !== 'excluded').length,
      excluded: view.assets.filter(row => row.state === 'excluded').length };
  }
  globalThis.TLEvidence = Object.freeze({ LIMITS, versionOf, manifestVersion, summary, exportCapture, restore, verifyRestored });
})();
