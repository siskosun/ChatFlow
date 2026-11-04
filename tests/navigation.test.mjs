import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const N = require('../src/tl-navigation.js');

function model({ count = 1000, reverse = false, absent = false, unstable = false, evidence = 'verified_message_id' } = {}) {
  let time = 0, top = reverse ? -100 : Math.min((count - 1) * 100, 95000), writes = 0, valid = true;
  const max = (count - 1) * 100, handlers = new Map(), styles = new Map([['overflow-anchor', 'auto']]);
  const events = { addEventListener: (key, value) => handlers.set(key, value), removeEventListener: key => handlers.delete(key) };
  const box = { clientHeight: 500, scrollHeight: max + 500,
    get scrollTop() { return top; },
    style: { getPropertyValue: key => styles.get(key) || '', getPropertyPriority: () => '', setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
    getBoundingClientRect: () => ({ top: 0, bottom: 500 }),
    scrollBy({ top: delta }) { writes += 1; top = Math.max(reverse ? -max : 0, Math.min(reverse ? 0 : max, top + delta)); }
  };
  const logical = () => reverse ? top + max : top;
  const elements = new Map();
  function el(index) {
    if (!elements.has(index)) elements.set(index, { getBoundingClientRect() { const y = index * 100 - logical() + (unstable ? time % 97 : 0); return { top: y, bottom: y + 95 }; } });
    return elements.get(index);
  }
  function mounted() {
    const start = Math.max(0, Math.floor(logical() / 100) - 2);
    return Array.from({ length: Math.min(10, count - start) }, (_, i) => start + i);
  }
  return { box, handlers, styles, el,
    writes: () => writes, invalidate: () => { valid = false; },
    options(target) { return { targetIndex: target, events,
      now: () => time, pause: async ms => { time += ms; },
      assertCurrent() { if (!valid) throw Error('PAGE_SCOPE_CHANGED'); },
      scroller: () => box,
      resolve: () => !absent && mounted().includes(target) ? { el: el(target), confidence: evidence } : null,
      sample: () => ({ rows: mounted().map(index => ({ index, el: el(index) })) })
    }; }
  };
}

test('264 and 1000 message positive controls, both scroll directions, exact success after stable layout', async () => {
  for (const count of [264, 1000]) for (const reverse of [false, true]) for (const target of [0, 19, Math.floor(count / 2), count - 1]) {
    const h = model({ count, reverse }), result = await N.run(h.options(target));
    assert.equal(result.status, 'located', JSON.stringify({ count, reverse, target, result }));
    assert.ok(result.elapsedMs <= N.LIMITS.deadlineMs);
    assert.ok(result.steps <= N.LIMITS.steps);
    assert.equal(h.handlers.size, 0);
    assert.equal(h.styles.get('overflow-anchor'), 'auto');
    assert.equal(h.styles.has('scroll-behavior'), false);
  }
});
test('unknown IDs stay observed and missing IDs never return located', async () => {
  const weak = model({ evidence: 'observed_dom_node' });
  assert.equal((await N.run(weak.options(950))).status, 'observed');
  const missing = model({ absent: true });
  const r = await N.run(missing.options(500));
  assert.ok(['unavailable', 'step_limit', 'timeout'].includes(r.status));
});
test('manual cancellation prevents all subsequent scroll writes and cleans listeners', async () => {
  const h = model(), options = h.options(0), original = options.pause;
  options.pause = async ms => { await original(ms); h.handlers.get('wheel')(); };
  const r = await N.run(options), writes = h.writes();
  assert.equal(r.status, 'cancelled');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(h.writes(), writes); assert.equal(h.handlers.size, 0);
});
test('source invalidation during awaited DOM progress cannot write again', async () => {
  const h = model(), options = h.options(0), original = options.pause;
  options.pause = async ms => { await original(ms); h.invalidate(); };
  assert.equal((await N.run(options)).status, 'source_changed');
  assert.equal(h.writes(), 1); assert.equal(h.handlers.size, 0);
});
test('oversized and cumulative DOM scans fail closed', async () => {
  const h = model({ absent: true }), options = h.options(500);
  options.sample = () => ({ rows: [], scanned: 4097 });
  assert.equal((await N.run(options)).status, 'scan_limit'); assert.equal(h.writes(), 0);
});
test('hung source and oscillating layout do not manufacture success', async () => {
  const h = model({ unstable: true });
  const r = await N.run(h.options(950));
  assert.notEqual(r.status, 'located'); assert.ok(r.elapsedMs <= N.LIMITS.deadlineMs + 80);
});
