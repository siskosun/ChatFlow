import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness(files, messages, assets) {
  const scope = { root: { querySelectorAll: () => files }, status: 'confirmed', conversationId: 'source_alpha_1234' };
  const context = vm.createContext({
    TLCore: { check(ok, code) { if (!ok) throw Error(code); }, safeName: value => value, pointer: value => ({ path: value.slice(8) }) },
    ChatFlowProviders: {}, TLPageScope: { current: () => scope, contains: () => true },
    chrome: { runtime: { onMessage: { addListener() {} } } }
  });
  const source = fs.readFileSync(new URL('../src/tl-capture.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.reconcile = reconcileVisibleAttachments;\n})();'), context);
  const model = { source: { conversationId: scope.conversationId }, messages, assets, integrity: { state: 'valid', issues: [] } };
  context.reconcile(model);
  return model;
}
function file(messageId, fileId = null) {
  const owner = { getAttribute: key => key === 'data-message-id' ? messageId : key === 'data-message-author-role' ? 'user' : null,
    querySelector: () => null, closest: () => null };
  return { getAttribute: key => key === 'download' ? 'report.pdf' : key === 'data-file-id' ? fileId : null,
    closest: () => owner, textContent: 'report.pdf' };
}
const messages = [{ id: 'm1', nodeId: 'n1' }, { id: 'm2', nodeId: 'n2' }];
const asset = () => ({ key: 'a1', name: 'report.pdf', messageId: 'm1', nodeId: 'n1', ref: { fileId: 'file_known' } });
test('same-message same-name without a file reference is unresolved, not silently matched', () => {
  const result = harness([file('m1')], messages, [asset()]);
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[1].state, 'unavailable');
  assert.equal(result.integrity.state, 'partial');
});
test('an exact file reference within the correct message remains a successful positive control', () => {
  const result = harness([file('m1', 'file_known')], messages, [asset()]);
  assert.equal(result.assets.length, 1);
  assert.equal(result.integrity.state, 'valid');
});
test('the same file id on another message does not erase that message reference', () => {
  const result = harness([file('m2', 'file_known')], messages, [asset()]);
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[1].messageId, 'm2');
});
test('two distinct unnamed references do not collapse by filename or case', () => {
  const result = harness([file('m1'), file('m1')], messages, [asset()]);
  assert.equal(result.assets.length, 3);
  assert.equal(new Set(result.assets.map(item => item.key)).size, 3);
});
