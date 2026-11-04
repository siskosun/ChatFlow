/* Bounded navigation. Identity is supplied by the source-scoped controller.
 * Stable-frame calculation adapted from ChatTrail (MIT), Copyright 2025 Reborn14.
 * Upstream f894aa82440281dc2f99e2427dd5f67d6a0c6efc. See THIRD_PARTY_NOTICES.md.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TLNavigation = api;
})(globalThis, function () {
  'use strict';
  const LIMITS = Object.freeze({ deadlineMs: 12000, mountedMs: 2000, steps: 60, nodes: 4096, scanned: 60000, stableFrames: 4 });

  function stableFrame(previous, current, count = 0) {
    const keys = ['top', 'scrollTop', 'scrollHeight'];
    if (!previous || keys.some(key => !Number.isFinite(previous[key]) || !Number.isFinite(current[key]))) return 0;
    const stable = keys.every(key => Math.abs(current[key] - previous[key]) <= 2);
    return stable ? count + 1 : 0;
  }

  function estimateDelta(rows, target, height) {
    const valid = rows.filter(row => Number.isInteger(row.index) && Number.isFinite(row.top));
    if (!valid.length) return null;
    const nearest = valid.reduce((a, b) => Math.abs(a.index - target) <= Math.abs(b.index - target) ? a : b);
    const slopes = [];
    for (let i = 1; i < valid.length; i += 1) {
      const a = valid[i - 1], b = valid[i];
      if (a.index !== b.index && Math.abs(a.top - b.top) > 2) slopes.push((b.top - a.top) / (b.index - a.index));
    }
    slopes.sort((a, b) => a - b);
    const slope = slopes.length ? slopes[Math.floor(slopes.length / 2)] : null;
    const direction = Math.sign(target - nearest.index) || 1;
    const viewport = Math.max(120, height * 0.85);
    return slope ? (target - nearest.index) * slope + nearest.top : direction * viewport;
  }

  /** The only success evidence is a fresh exact resolve after layout settles. */
  async function run(options) {
    const now = options.now || (() => performance.now());
    const pause = options.pause || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const events = options.events || globalThis.window;
    const started = now();
    let cancelled = !!options.signal?.aborted, steps = 0, scanned = 0, box = null;
    let stable = 0, previous = null, lastSample = '', repeated = 0, centerBlocked = false;
    const cancel = () => { cancelled = true; };
    const eventNames = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    for (const name of eventNames) events?.addEventListener(name, cancel, { capture: true, passive: true });
    options.signal?.addEventListener('abort', cancel, { once: true });
    const savedStyles = [];
    const result = (status, extra = {}) => ({ status, steps, scanned, elapsedMs: Math.max(0, now() - started), ...extra });
    function guard() {
      if (cancelled) throw new Error('NAV_CANCELLED');
      if (now() - started >= LIMITS.deadlineMs) throw new Error('NAV_TIMEOUT');
      options.assertCurrent();
    }
    function useScroller(element) {
      const candidate = options.scroller(element);
      if (!candidate || candidate.clientHeight < 1) throw new Error('NAV_SCROLLER_UNAVAILABLE');
      if (box && candidate !== box) throw new Error('PAGE_SCOPE_CHANGED');
      if (!box) {
        box = candidate;
        if (box.style?.getPropertyValue) {
          for (const [key, value] of [['overflow-anchor', 'none'], ['scroll-behavior', 'auto']]) {
            savedStyles.push({ key, value, before: box.style.getPropertyValue(key), priority: box.style.getPropertyPriority(key) });
            box.style.setProperty(key, value);
          }
        }
      }
      return box;
    }
    function move(delta) {
      guard();
      if (!Number.isFinite(delta)) throw new Error('NAV_INVALID_GEOMETRY');
      if (steps >= LIMITS.steps) throw new Error('NAV_STEP_LIMIT');
      steps += 1;
      box.scrollBy({ top: delta, behavior: 'instant' });
    }
    try {
      guard();
      const initiallyMounted = !!options.resolve();
      const stableDeadline = initiallyMounted ? started + LIMITS.mountedMs : started + LIMITS.deadlineMs;
      while (steps < LIMITS.steps) {
        guard();
        const found = options.resolve();
        if (found) {
          useScroller(found.el);
          const rect = found.el.getBoundingClientRect();
          const viewport = box.getBoundingClientRect?.() || { top: 0, bottom: box.clientHeight };
          const delta = (rect.top + rect.bottom) / 2 - (viewport.top + viewport.bottom) / 2;
          if (previous === null || (!centerBlocked && Math.abs(delta) > 2)) {
            const before = box.scrollTop;
            move(delta);
            centerBlocked = Math.abs(delta) > 2 && Math.abs(box.scrollTop - before) < 0.5;
          }
          await pause(32); guard();
          const next = options.resolve();
          if (!next || next.confidence !== found.confidence) { previous = null; stable = 0; continue; }
          const after = next.el.getBoundingClientRect();
          const sample = { top: after.top, scrollTop: box.scrollTop, scrollHeight: box.scrollHeight };
          stable = stableFrame(previous, sample, stable); previous = sample;
          const visible = after.bottom > viewport.top && after.top < viewport.bottom;
          if (stable >= LIMITS.stableFrames && visible) {
            guard();
            const final = options.resolve();
            if (!final || final.el !== next.el || final.confidence !== next.confidence) { stable = 0; continue; }
            return result(final.confidence === 'verified_message_id' ? 'located' : 'observed', { element: final.el, evidence: final.confidence });
          }
          if (now() >= stableDeadline) return result('layout_unstable');
          continue;
        }
        previous = null; stable = 0; centerBlocked = false;
        const sample = options.sample();
        const rows = sample.rows || [];
        const count = sample.scanned ?? rows.length;
        if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.nodes) return result('scan_limit');
        scanned += count;
        if (scanned > LIMITS.scanned) return result('scan_limit');
        if (!rows.length) return result('unavailable');
        useScroller(rows[0].el);
        const bounds = box.getBoundingClientRect?.() || { top: 0, bottom: box.clientHeight };
        const center = (bounds.top + bounds.bottom) / 2;
        const geometry = rows.map(row => {
          const rect = row.el.getBoundingClientRect();
          return { index: row.index, top: rect.top + (rect.height ?? (rect.bottom - rect.top)) / 2 - center };
        });
        const signature = rows.map(row => row.index).join(',') + ':' + box.scrollTop;
        repeated = signature === lastSample ? repeated + 1 : 0; lastSample = signature;
        if (repeated >= 4) return result('unavailable');
        let delta = estimateDelta(geometry, options.targetIndex, box.clientHeight);
        if (delta === null) return result('unavailable');
        const max = Math.max(box.clientHeight, box.scrollHeight - box.clientHeight);
        delta = Math.max(-max, Math.min(max, delta));
        if (repeated || Math.abs(delta) < 2) delta = Math.sign(delta || 1) * Math.max(120, box.clientHeight * 0.85);
        move(delta); await pause(80);
      }
      return result('step_limit');
    } catch (error) {
      if (cancelled || error?.message === 'NAV_CANCELLED') return result('cancelled');
      if (error?.message === 'NAV_TIMEOUT') return result('timeout');
      if (/SOURCE|SCOPE/.test(error?.message || '')) return result('source_changed');
      return result('failed', { code: /^[A-Z0-9_]{2,100}$/.test(error?.message || '') ? error.message : 'NAVIGATION_FAILED' });
    } finally {
      for (const name of eventNames) events?.removeEventListener(name, cancel, true);
      options.signal?.removeEventListener('abort', cancel);
      for (const item of savedStyles) {
        if (box.style.getPropertyValue(item.key) !== item.value) continue;
        if (item.before) box.style.setProperty(item.key, item.before, item.priority);
        else box.style.removeProperty(item.key);
      }
    }
  }
  return Object.freeze({ LIMITS, stableFrame, estimateDelta, run });
});
