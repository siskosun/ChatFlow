import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const worker = readFileSync('src/tl-service.js', 'utf8');
const start = worker.indexOf('async function sendToSource(');
const end = worker.indexOf('\nasync function startCapture(', start);
assert.ok(start >= 0 && end > start, 'capture fallback function must remain inspectable');
const functionSource = worker.slice(start, end);

function fixture({ failFirst = true, scripts = manifest.content_scripts } = {}) {
  let sends = 0;
  const injections = [];
  const api = {
    runtime: { getManifest: () => ({ content_scripts: scripts }) },
    tabs: {
      sendMessage: async (tabId, message, options) => {
        sends += 1;
        assert.equal(tabId, 17);
        assert.equal(message.type, 'tl:capture');
        assert.equal(options.documentId, 'doc-locked');
        if (failFirst && sends === 1) throw Error('Receiving end does not exist');
        return { ok: true };
      },
    },
    scripting: {
      executeScript: async ({ target, files }) => {
        injections.push({
          tabId: target.tabId,
          documentIds: [...target.documentIds],
          files: [...files],
        });
      },
    },
  };
  const C = { check: (condition, code) => { if (!condition) throw Error(code); } };
  const sendToSource = new vm.Script(functionSource + '\nsendToSource', {
    filename: 'src/tl-service.js:sendToSource',
  }).runInNewContext({ api, C });
  return {
    run: () => sendToSource(17, { type: 'tl:capture' }, 'doc-locked'),
    injections,
    sends: () => sends,
  };
}

test('already-open ChatGPT tab uses the complete declared content-script graph', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { ok: true });
  assert.equal(f.sends(), 2);
  assert.equal(f.injections.length, 1);
  const expected = manifest.content_scripts.find(row => row.js.includes('src/tl-capture.js')).js;
  assert.deepEqual(f.injections[0], {
    tabId: 17, documentIds: ['doc-locked'], files: expected,
  });
  assert.ok(expected.includes('src/tl-page-scope.js'));
  assert.ok(expected.includes('src/tl-evidence.js'));
});

test('normal capture sends once without injecting extra scripts', async () => {
  const f = fixture({ failFirst: false });
  assert.deepEqual(await f.run(), { ok: true });
  assert.equal(f.sends(), 1);
  assert.equal(f.injections.length, 0);
});

test('missing manifest capture declaration fails closed instead of injecting a partial graph', async () => {
  const f = fixture({ scripts: [] });
  await assert.rejects(f.run(), /CAPTURE_SCRIPT_LIST_MISSING/);
  assert.equal(f.sends(), 1);
  assert.equal(f.injections.length, 0);
});
