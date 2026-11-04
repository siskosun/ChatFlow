import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = name => fs.readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');
function instrument(name, expression) {
  const source = read(name);
  assert.ok(source.trimEnd().endsWith('})();'));
  return source.replace(/\}\)\(\);\s*$/, expression + '\n})();');
}
function scopeHarness() {
  class Node {}
  class Element extends Node {
    constructor(attrs = {}, visible = true) { super(); this.attrs = attrs; this.visible = visible; this.isConnected = true; this.parentElement = null; this.children = []; }
    getClientRects() { return this.visible ? [{}] : []; }
    getAttribute(name) { return this.attrs[name] ?? null; }
    hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
    querySelectorAll() { return this.children.filter(el => el.hasAttribute('data-chatgpt-selection-conversation-id')); }
    closest() { return null; }
    contains(node) { return this === node || this.children.includes(node); }
  }
  const state = { roots: [] };
  const context = vm.createContext({ Node, Element,
    document: { querySelectorAll: () => state.roots }, location: { href: 'https://chatgpt.com/c/source-A' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    TLCore: { chatUrl: url => ({ conversationId: url.split('/c/')[1] }) }
  });
  vm.runInContext(read('tl-page-scope.js'), context);
  return { context, state, Element };
}
test('active DOM scope refuses stale or conflicting threads; visibility alone stays unverified', () => {
  const { context, state, Element } = scopeHarness();
  const root = id => { const el = new Element(); el.children = [new Element({ 'data-chatgpt-selection-conversation-id': id })]; return el; };
  const outgoing = root('source-B'); outgoing.visible = false;
  const active = root('source-A'); state.roots = [outgoing, active];
  assert.equal(context.TLPageScope.current().status, 'confirmed');
  assert.equal(context.TLPageScope.current().root, active);
  state.roots = [active, root('source-A')]; assert.equal(context.TLPageScope.current().status, 'ambiguous');
  state.roots = [new Element()]; assert.equal(context.TLPageScope.current().status, 'unverified');
  state.roots = [root('source-B')]; assert.equal(context.TLPageScope.current().status, 'ambiguous');
});
function injectionHarness() {
  const context = vm.createContext({
    chrome: { runtime: { id: 'test', onMessage: { addListener() {} } } },
    document: { readyState: 'loading', addEventListener() {} }, TLCore: { check(ok, code) { if (!ok) throw Error(code); } },
    ChatFlowProviders: {}, setTimeout, clearTimeout, URL, File: class {}, DataTransfer: class {}
  });
  vm.runInContext(instrument('tl-inject.js', 'globalThis.confirmed=uploadsConfirmed;'), context);
  return context.confirmed;
}
function chip(name, { state = 'ready', visible = true, attribute = 'data-filename' } = {}) {
  return { getClientRects: () => visible ? [{}] : [], offsetParent: null,
    getAttribute: key => key === attribute ? name : key === 'data-state' ? state : null,
    textContent: name, querySelector: () => null };
}
function composer(chips) {
  const area = { isConnected: true, querySelectorAll: () => chips };
  return { closest: () => area, parentElement: area };
}
test('upload confirmation cannot confuse a substring or a different composer with a target', () => {
  const confirmed = injectionHarness();
  assert.equal(confirmed(['report.pdf'], composer([chip('old-report.pdf')])), false);
  const contradictory = chip('report.pdf');
  contradictory.getAttribute = key => key === 'data-filename' ? 'old-report.pdf' : key === 'data-state' ? 'ready' : null;
  assert.equal(confirmed(['report.pdf'], composer([contradictory])), false);
  assert.equal(confirmed(['report.pdf'], composer([chip('report.pdf', { attribute: 'title' })])), true);
  assert.equal(confirmed(['report.pdf'], composer([chip('report...')])), false);
  assert.equal(confirmed(['report.pdf'], composer([chip('report.pdf')])), true);
  assert.equal(confirmed(['report.pdf', 'other.pdf'], composer([chip('report.pdf')])), false);
  assert.equal(confirmed(['report.pdf'], composer([chip('report.pdf'), chip('report.pdf')])), false);
  assert.equal(confirmed(['report.pdf'], composer([chip('report.pdf', { state: 'uploading' })])), false);
  assert.equal(confirmed(['report.pdf'], composer([])), false);
});
function captureHarness(fetcher, scope) {
  const identity = { origin: 'https://chatgpt.com', conversationId: 'source-A' };
  let parsed = 0;
  const context = vm.createContext({ URL, URLSearchParams, AbortController, Response, Blob, Uint8Array,
    TextEncoder, TextDecoder, ReadableStream, setTimeout, clearTimeout,
    JSON: { parse(text) { parsed += 1; return JSON.parse(text); } },
    document: {}, location: { href: identity.origin + '/c/source-A' }, fetch: fetcher,
    TLPageScope: scope || { current: () => ({ status: 'unavailable', root: null }), contains: () => false },
    TLCore: { check(ok, code) { if (!ok) throw Error(code); }, safeName: value => value },
    ChatFlowProviders: { identify: () => ({ identity }), get: () => ({ readEndpoint: path => new URL(path, identity.origin) }) },
    chrome: { runtime: { id: 'test', onMessage: { addListener() {} } } }
  });
  // Preserve stringify for metadata keys while counting parse invocations.
  context.JSON.stringify = JSON.stringify;
  vm.runInContext(instrument('tl-capture.js', 'globalThis.hooks={json,reconcileVisibleAttachments,setRun(run){active=run;}};'), context);
  const run = { source: { ...identity }, stopped: false }; context.hooks.setRun(run);
  return { hooks: context.hooks, run, context, identity, parses: () => parsed };
}
test('API JSON rejects declared and streamed oversized session bodies before parsing', async () => {
  for (const response of [new Response('{}', { headers: { 'content-length': '1048577' } }), new Response('x'.repeat(1024 ** 2 + 1))]) {
    const h = captureHarness(async () => response);
    await assert.rejects(h.hooks.json(h.run, '/api/auth/session'), /API_JSON_RESPONSE_TOO_LARGE/);
    assert.equal(h.parses(), 0, 'oversized content must not reach JSON.parse');
  }
  const valid = captureHarness(async () => new Response('{"accessToken":"synthetic"}'));
  assert.equal((await valid.hooks.json(valid.run, '/api/auth/session')).accessToken, 'synthetic');
  assert.equal(valid.parses(), 1);
});
test('API JSON enforces metadata limits and fatal UTF-8, and cancels before parsing on source change', async () => {
  const metadata = captureHarness(async () => new Response(' '.repeat(2 * 1024 ** 2 + 1)));
  await assert.rejects(metadata.hooks.json(metadata.run, '/backend-api/conversation/source-A/download_from_sandbox'), /API_JSON_RESPONSE_TOO_LARGE/);
  assert.equal(metadata.parses(), 0);
  const utf8 = captureHarness(async () => new Response(new Uint8Array([0xff, 0xfe])));
  await assert.rejects(utf8.hooks.json(utf8.run, '/api/auth/session'), /API_JSON_INVALID_UTF8/);
  assert.equal(utf8.parses(), 0);
  const changed = captureHarness(async () => { changed.identity.conversationId = 'source-B'; return new Response('{}'); });
  await assert.rejects(changed.hooks.json(changed.run, '/api/auth/session'), /SOURCE_CONVERSATION_CHANGED/);
  assert.equal(changed.parses(), 0);
});
test('DOM attachment reconciliation distinguishes same filenames on different messages', () => {
  const owner = { getAttribute: key => key === 'data-message-id' ? 'message-B' : key === 'data-message-author-role' ? 'user' : null,
    querySelector: () => null, closest: () => null };
  const file = { getAttribute: key => key === 'download' ? 'report.pdf' : null, textContent: 'report.pdf', closest: () => owner };
  const sc = { root: { querySelectorAll: () => [file] }, status: 'confirmed', conversationId: 'source-A' };
  const h = captureHarness(async () => new Response('{}'), { current: () => sc, contains: () => true });
  const model = { source: { conversationId: 'source-A' }, messages: [{ id: 'message-A', nodeId: 'node-A' }, { id: 'message-B', nodeId: 'node-B' }],
    assets: [{ name: 'report.pdf', messageId: 'message-A', nodeId: 'node-A', ref: { fileId: 'file-A' } }], integrity: { state: 'valid', issues: [] } };
  h.hooks.reconcileVisibleAttachments(model);
  assert.equal(model.assets.length, 2); assert.equal(model.assets[1].messageId, 'message-B');
  assert.equal(model.assets[1].state, 'unavailable'); assert.equal(model.integrity.issues[0].code, 'VISIBLE_ATTACHMENT_NOT_IN_API');
});
test('unverified DOM attachment scope leaves an issue but invents no file bytes', () => {
  const sc = { root: { querySelectorAll: () => [{}] }, status: 'unverified', conversationId: 'source-A' };
  const h = captureHarness(async () => new Response('{}'), { current: () => sc, contains: () => true });
  const model = { source: { conversationId: 'source-A' }, messages: [], assets: [], integrity: { state: 'valid', issues: [] } };
  h.hooks.reconcileVisibleAttachments(model);
  assert.equal(model.assets.length, 0); assert.equal(model.integrity.state, 'partial');
  assert.equal(model.integrity.issues[0].code, 'VISIBLE_ATTACHMENT_SCOPE_UNVERIFIED');
});
test('ambiguous current conversation records a skipped attachment audit without foreign-file attribution', () => {
  const h = captureHarness(async () => new Response('{}'), { current: () => ({ root: null, status: 'ambiguous' }), contains: () => false });
  const model = { source: { conversationId: 'source-A' }, messages: [], assets: [], integrity: { state: 'valid', issues: [] } };
  h.hooks.reconcileVisibleAttachments(model);
  assert.equal(model.assets.length, 0); assert.equal(model.integrity.state, 'partial');
  assert.equal(model.integrity.issues[0].code, 'VISIBLE_ATTACHMENT_SCOPE_UNAVAILABLE');
});
test('navigation never labels an unidentified DOM node as verified message identity', () => {
  const context = vm.createContext({
    TLCore: { chatUrl: url => ({ url }) }, CFToolkit: { getDomMessageIdCandidates: () => [] },
    TLPageScope: { current: () => ({ root: {}, status: 'unverified' }), contains: () => true },
    chrome: { runtime: { id: 'test', onMessage: { addListener() {} } } }, document: {}, location: { href: 'https://chatgpt.com/c/source-A' }, URL
  });
  vm.runInContext(instrument('tl-tools-page.js', 'globalThis.resolveTest=resolve;'), context);
  assert.equal(context.resolveTest({}, { domNode: { isConnected: true }, idKnown: false }, { root: {}, status: 'unverified' }).confidence, 'observed_dom_node');
});
test('navigation cancels on user wheel and restores temporary event listeners', async () => {
  const handlers = new Map();
  const window = { addEventListener: (key, value) => handlers.set(key, value), removeEventListener: (key, value) => { if (handlers.get(key) === value) handlers.delete(key); } };
  let writes = 0; const body = {};
  const box = { clientHeight: 500, scrollHeight: 2000, parentElement: body, scrollBy() { writes += 1; handlers.get('wheel')?.(); } };
  const element = { parentElement: box, isConnected: true, closest: () => null, getBoundingClientRect: () => ({ top: 20, height: 120 }) };
  const root = { querySelectorAll: () => [element] }, sc = { root, status: 'confirmed', conversationId: 'source-A' }, url = 'https://chatgpt.com/c/source-A';
  const context = vm.createContext({
    TLCore: { chatUrl: () => ({ url }), check(ok, code) { if (!ok) throw Error(code); } },
    CFToolkit: { getDomMessageIdCandidates: el => el === element ? ['other-message'] : [] },
    TLPageScope: { current: () => sc, contains: () => true }, chrome: { runtime: { id: 'test', onMessage: { addListener() {} } } },
    document: { body, scrollingElement: box }, location: { href: url }, getComputedStyle: () => ({ overflowY: 'auto' }),
    window, performance: { now: () => 1000 }, setTimeout: fn => fn(), URL
  });
  vm.runInContext(instrument('tl-tools-page.js', 'globalThis.navTest={jump,setLive(s){live=s;}};'), context);
  const target = { id: 'target-message' }, session = { url, closed: false, jump: 0, messages: [{ id: 'other-message' }, target], status: { textContent: '' } };
  context.navTest.setLive(session);
  assert.equal(await context.navTest.jump(session, target), false);
  assert.equal(writes, 1); assert.equal(handlers.size, 0);
});
