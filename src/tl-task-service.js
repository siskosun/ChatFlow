/* Narrow user-triggered page access; no full capture is required. MIT. */
(() => {
  'use strict';
  const C = globalThis.TLCore, T = globalThis.TLTasks;
  async function handle(msg, sender, api) {
    if (!['tl:taskSource','tl:taskReturn','tl:openTools'].includes(msg.type)) return undefined;
    C.check(sender?.id === api.runtime.id && String(sender.url || '').startsWith(api.runtime.getURL('workspace/')), 'WORKSPACE_ONLY');
    if (msg.type === 'tl:taskReturn') {
      const raw = await TLTaskStore.get(msg.taskId); C.check(raw, 'TASK_NOT_FOUND');
      const task = T.validateTask(raw); let windowId = sender.tab?.windowId;
      if (!Number.isInteger(windowId)) {
        C.check(Number.isInteger(msg.windowId) && Number.isInteger(msg.activeTabId), 'WORKSPACE_WINDOW_REQUIRED');
        const active = await api.tabs.get(msg.activeTabId);
        C.check(active?.windowId === msg.windowId && active.active === true, 'WORKSPACE_WINDOW_REQUIRED'); windowId = msg.windowId;
      }
      const tabs = await api.tabs.query({ windowId });
      const existing = tabs.find(tab => { try { return C.chatUrl(tab.url).url === task.source.url; } catch { return false; } });
      if (existing) {
        const now = await api.tabs.get(existing.id); C.check(C.chatUrl(now.url).url === task.source.url, 'TASK_SOURCE_CHANGED');
        await api.tabs.update(existing.id, { active: true }); await api.windows.update(windowId, { focused: true });
        return { tabId: existing.id, state: 'source_opened_not_sent' };
      }
      const tab = await api.tabs.create({ windowId, url: task.source.url, active: true });
      return { tabId: tab.id, state: 'source_opened_not_sent' };
    }
    C.check(Number.isInteger(msg.tabId), 'INVALID_TAB_ID');
    const before = await api.tabs.get(msg.tabId), identity = C.chatUrl(before.url);
    C.check(typeof msg.expectedUrl === 'string' && identity.url === msg.expectedUrl, 'TASK_SOURCE_CHANGED');
    if (msg.type === 'tl:openTools') {
      const injected = await api.scripting.executeScript({ target: { tabId: msg.tabId },
        files: ['src/tl-core.js','src/tl-provider.js','src/tl-page-scope.js','src/toolkit-port.js','src/tl-navigation.js','src/tl-tools-page.js'] });
      const documentId = injected.find(row => row.frameId === 0)?.documentId;
      C.check(documentId, 'SOURCE_DOCUMENT_CHANGED');
      C.check(C.chatUrl((await api.tabs.get(msg.tabId)).url).url === identity.url, 'TASK_SOURCE_CHANGED');
      const response = await api.tabs.sendMessage(msg.tabId, { type: 'tl:showTools', url: identity.url }, { documentId });
      C.check(response?.ok, 'TOOLS_PAGE_CHANGED'); await api.tabs.update(msg.tabId, { active: true }); return { opened: true };
    }
    await api.scripting.executeScript({ target: { tabId: msg.tabId }, files: ['src/tl-page-scope.js'] });
    const read = await api.scripting.executeScript({ target: { tabId: msg.tabId }, func: () => {
      const S = globalThis.TLPageScope, lease = S?.freeze();
      const selection = window.getSelection(), anchor = selection?.anchorNode?.parentElement, focus = selection?.focusNode;
      const message = anchor?.closest('[data-message-id],[data-turn-key],[data-message-author-role]');
      const safe = lease?.status === 'confirmed' && S.contains(lease, anchor) && S.contains(lease, focus) &&
        message && message.contains(focus) && S.contains(lease, message);
      const text = safe ? String(selection).slice(0, 20001) : '';
      return { url: location.origin + location.pathname, title: document.title, text,
        messageId: safe ? message.getAttribute('data-message-id') || null : null,
        nodeId: safe ? message.getAttribute('data-node-id') || null : null,
        generation: lease?.generation ?? null, selectionEvidence: safe ? 'confirmed' : 'unavailable' };
    }});
    const row = read.find(item => item.frameId === 0), data = row?.result;
    C.check(data && data.url === identity.url && row.documentId, 'TASK_SOURCE_CHANGED');
    C.check(C.chatUrl((await api.tabs.get(msg.tabId)).url).url === identity.url, 'TASK_SOURCE_CHANGED');
    const validated = await api.scripting.executeScript({ target: { tabId: msg.tabId, documentIds: [row.documentId] },
      args: [data.url, data.generation], func: (url, generation) => {
        const scope = globalThis.TLPageScope?.current();
        return { valid: location.origin + location.pathname === url && scope?.generation === generation };
      }});
    C.check(validated.find(item => item.frameId === 0)?.result?.valid === true, 'TASK_SOURCE_CHANGED');
    const selectionTooLong = typeof data.text === 'string' && data.text.length > T.LIMITS.task;
    return { source: T.source({ ...identity, title: data.title, messageId: data.messageId, nodeId: data.nodeId }),
      selection: selectionTooLong ? '' : data.text, selectionTooLong, selectionEvidence: data.selectionEvidence,
      documentId: row.documentId };
  }
  globalThis.TLTaskService = Object.freeze({ handle });
})();
