import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const limit = 24 * 1024 ** 2;
const source = { origin: 'https://chatgpt.com', conversationId: 'snapshot-boundary-synthetic' };
const size = snapshot => new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;

function makeSnapshot(kind) {
  const skeleton = { source, body: '' };
  const fixedBytes = size(skeleton);
  const available = limit - fixedBytes;
  if (kind === 'exact') return { source, body: 'x'.repeat(available) };
  if (kind === 'over') return { source, body: 'x'.repeat(available + 1) };
  if (kind === 'utf8-over') {
    // This still has fewer than 24 MiB JavaScript code units.
    return { source, body: '中'.repeat(Math.floor(available / 3) + 1) };
  }
  throw Error('UNKNOWN_FIXTURE');
}

function workerHarness() {
  const worker = read('src/tl-service.js');
  const start = worker.indexOf('async function handleRunMessage(msg,run){');
  const end = worker.indexOf('\napi.runtime.onMessage.addListener(', start);
  assert.ok(start !== -1 && end !== -1, 'test must call actual worker handler');
  const writes = [];
  const storage = {
    async snapshot(captureId, snapshot) { writes.push({ captureId, snapshot }); },
    async get() { return { id: 'capture-synthetic' }; },
    async set() {},
    async assets() { return []; }
  };
  const context = vm.createContext({
    TextEncoder, S: storage, C: {
      check(valid, code) { if (!valid) throw Error(code); }
    }
  });
  vm.runInContext(worker.slice(start, end) +
    '\nglobalThis.acceptSnapshot = snapshot => handleRunMessage({type:"tl:snapshot",snapshot},' +
    '{captureId:"capture-synthetic",source:globalThis.source,live:false});', context);
  context.source = source;
  return { accept: snapshot => context.acceptSnapshot(snapshot), writes };
}

function contentHarness(snapshot) {
  const script = read('src/tl-capture.js');
  assert.match(script, /\}\)\(\);\s*$/);
  const program = script.replace(/\}\)\(\);\s*$/,
    'globalThis.testCapture={cycle, activate(run){active=run;}};\n})();');
  const events = [];
  const model = {
    source, messages: [], active: [], assets: [], nodes: {},
    integrity: { state: 'valid', issues: [] }
  };
  const core = {
    TRANSFER_CHUNK_BYTES: 262144,
    check(value, code) { if (!value) throw Error(code); },
    normalizeConversation() { return model; },
    persistedSnapshot() { return snapshot; },
    selectAssetKeys() { return []; },
    lastGeneratedScopeAmbiguous() { return false; }
  };
  const context = vm.createContext({
    TLCore: core,
    ChatFlowProviders: {
      identify() { return { identity: source }; },
      get() { return { readEndpoint: path => new URL('https://chatgpt.com' + path) }; }
    },
    chrome: { runtime: {
      id: 'test-extension',
      onMessage: { addListener() {} },
      async sendMessage(message) {
        events.push(message);
        return { ok: true, data: { savedKeys: [] } };
      }
    } },
    TextEncoder, TextDecoder, URL, Response, AbortController,
    location: { href: 'https://chatgpt.com/c/snapshot-boundary-synthetic' },
    document: { getElementById() { return null; } },
    async fetch(url) {
      const path = new URL(url).pathname;
      return path.endsWith('/api/auth/session')
        ? new Response(JSON.stringify({ accessToken: 'synthetic-token' }))
        : new Response('{}');
    },
    setTimeout, clearTimeout, setInterval, clearInterval
  });
  vm.runInContext(program, context, { filename: 'tl-capture.js' });
  const run = { nonce: 'synthetic-nonce-abcdefghijklmnop', source, scope: 'all',
    busy: false, stopped: false, dirty: true, live: false };
  context.testCapture.activate(run);
  return { run: () => context.testCapture.cycle(run), events };
}

test('worker permits a complete exact 24 MiB snapshot and refuses the next byte without writing', async () => {
  const h = workerHarness();
  const exact = makeSnapshot('exact');
  const over = makeSnapshot('over');
  assert.equal(size(exact), limit);
  assert.equal(size(over), limit + 1);
  await h.accept(exact);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].snapshot, exact);
  await assert.rejects(h.accept(over), /SNAPSHOT_MESSAGE_SIZE_LIMIT/);
  assert.equal(h.writes.length, 1, 'oversize must never mutate storage');
});

test('worker rejects multibyte overrun even when JS character count is within the limit', async () => {
  const h = workerHarness(), snapshot = makeSnapshot('utf8-over');
  assert.ok(JSON.stringify(snapshot).length < limit);
  assert.ok(size(snapshot) > limit);
  await assert.rejects(h.accept(snapshot), /SNAPSHOT_MESSAGE_SIZE_LIMIT/);
  assert.equal(h.writes.length, 0);
});

test('content adapter sends exact 24 MiB intact, but never submits an over-limit snapshot', async () => {
  for (const kind of ['exact', 'over', 'utf8-over']) {
    const snapshot = makeSnapshot(kind), h = contentHarness(snapshot);
    await h.run();
    const accepted = h.events.filter(e => e.type === 'tl:snapshot');
    const complete = h.events.some(e => e.type === 'tl:finish');
    const failed = h.events.find(e => e.type === 'tl:captureFailed');
    if (kind === 'exact') {
      assert.equal(accepted.length, 1);
      assert.equal(accepted[0].snapshot, snapshot);
      assert.equal(complete, true);
      assert.equal(failed, undefined);
    } else {
      assert.equal(accepted.length, 0, kind + ': do not transmit partial or oversize snapshots');
      assert.equal(complete, false);
      assert.equal(failed?.code, 'SNAPSHOT_MESSAGE_SIZE_LIMIT');
    }
  }
});
