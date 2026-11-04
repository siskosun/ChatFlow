/* Read-only ChatGPT page scope. DOM identity is not server authenticity. MIT. */
(() => {
  'use strict';
  if (globalThis.TLPageScope) return;
  const C = globalThis.TLCore;
  const ID_ATTR = 'data-chatgpt-selection-conversation-id';
  const MAX_CANDIDATES = 32;
  const MAX_IDENTITIES = 4096;
  let generation = 0;
  let lastUrl = location.href;
  let lastRoot = null;
  let observer = null;

  function invalidate() { generation += 1; }

  function consume(records) {
    for (const record of records) {
      if (record.type === 'attributes' && record.attributeName === ID_ATTR &&
          record.oldValue !== null && record.oldValue !== record.target.getAttribute(ID_ATTR)) {
        invalidate();
      }
      if (record.type === 'childList' && lastRoot) {
        for (const node of record.removedNodes) {
          if (node === lastRoot || node.contains?.(lastRoot)) invalidate();
        }
      }
    }
  }

  // Start only when a user-triggered operation first asks for page scope.
  function observe() {
    if (observer || typeof MutationObserver !== 'function' || !document.documentElement) return;
    observer = new MutationObserver(consume);
    observer.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: [ID_ATTR], attributeOldValue: true
    });
    globalThis.navigation?.addEventListener('currententrychange', invalidate);
    globalThis.addEventListener?.('popstate', invalidate);
    globalThis.addEventListener?.('pagehide', invalidate);
  }

  function flush() {
    observe();
    if (observer) consume(observer.takeRecords());
    if (lastUrl !== location.href) { lastUrl = location.href; invalidate(); }
  }

  function isVisible(el) {
    if (!(el instanceof Element) || !el.isConnected ||
        el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    if (!el.getClientRects().length) return false;
    for (let node = el; node instanceof Element; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse') return false;
    }
    return true;
  }

  function conversation() {
    try { return C.chatUrl(location.href).conversationId; } catch { return null; }
  }

  function identities(root) {
    const values = new Set();
    if (root.hasAttribute(ID_ATTR)) values.add(root.getAttribute(ID_ATTR));
    const nodes = root.querySelectorAll('[' + ID_ATTR + ']');
    if (nodes.length > MAX_IDENTITIES) throw new Error('PAGE_SCOPE_SCAN_LIMIT');
    for (const node of nodes) {
      const id = node.getAttribute(ID_ATTR);
      if (id) values.add(id);
    }
    return values;
  }

  function result(status, root, conversationId) {
    if (lastRoot && lastRoot !== root) invalidate();
    lastRoot = root;
    return { status, root, conversationId, generation, url: location.href };
  }

  function current() {
    flush();
    const id = conversation();
    if (!id) return result('unavailable', null, null);
    const threads = [...document.querySelectorAll('.thread-scroll-container')];
    const candidates = threads.length ? threads : [...document.querySelectorAll('main')];
    if (candidates.length > MAX_CANDIDATES) return result('ambiguous', null, id);
    const visible = candidates.filter(isVisible);
    if (visible.length !== 1) return result(visible.length ? 'ambiguous' : 'unavailable', null, id);
    const root = visible[0];
    let ids;
    try { ids = identities(root); } catch { return result('ambiguous', null, id); }
    if (ids.size === 1 && ids.has(id)) return result('confirmed', root, id);
    if (!ids.size) return result('unverified', root, id);
    return result('ambiguous', null, id);
  }

  function within(scope, node) {
    if (!scope?.root || !(node instanceof Node) || !scope.root.isConnected ||
        !scope.root.contains(node)) return false;
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) return false;
    const owner = el.closest('[' + ID_ATTR + ']');
    return !owner || (!scope.root.contains(owner) && owner !== scope.root) ||
      owner.getAttribute(ID_ATTR) === scope.conversationId;
  }

  function contains(scope, node) {
    if (!within(scope, node)) return false;
    const el = node instanceof Element ? node : node.parentElement;
    // MathML annotation is intentionally non-rendered metadata. Its visible
    // formula wrapper, not the annotation's own rectangle, supplies visibility.
    // A hidden/outgoing formula wrapper still fails this check.
    if (el.matches?.('annotation[encoding="application/x-tex"],annotation[encoding="application/x-latex"]')) {
      const formula = el.closest('.katex,math');
      return !!formula && within(scope, formula) && isVisible(formula);
    }
    return isVisible(el);
  }

  /** Capture a lease before awaits; a return to the same URL does not revive it. */
  function freeze() {
    const scope = current();
    return Object.freeze({ ...scope });
  }

  function unchanged(lease, requireRoot = true) {
    const scope = current();
    return !!lease && lease.generation === scope.generation && lease.url === scope.url &&
      lease.conversationId === scope.conversationId &&
      (!requireRoot || (lease.root === scope.root && scope.root?.isConnected));
  }

  function assert(lease, requireRoot = true) {
    if (!unchanged(lease, requireRoot)) throw new Error('PAGE_SCOPE_CHANGED');
  }

  globalThis.TLPageScope = Object.freeze({
    current, contains, within, isVisible, identities, freeze, unchanged, assert
  });
})();
