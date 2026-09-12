// Background script:
//  - keeps the toolbar icon badge in sync with the per-tab count
//  - owns the all-time tally so writes from many tabs don't race
'use strict';

const api = globalThis.browser ?? globalThis.chrome;

let tallyQueue = Promise.resolve();
function addToLifetime(delta) {
  const run = tallyQueue.then(async () => {
    const { lifetime = 0 } = await api.storage.local.get({ lifetime: 0 });
    const next = Math.max(0, (Number(lifetime) || 0) + delta);
    await api.storage.local.set({ lifetime: next });
    return next;
  });
  tallyQueue = run.catch(() => {});
  return run;
}

function setBadge(tabId, count) {
  const text = count > 0 ? String(count) : '';
  try {
    api.action.setBadgeText({ tabId, text });
    if (count > 0) {
      api.action.setBadgeBackgroundColor({ tabId, color: '#ff4500' });
      if (api.action.setBadgeTextColor) api.action.setBadgeTextColor({ tabId, color: '#ffffff' });
    }
  } catch {
    /* tab may have gone away */
  }
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'rgc:count') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId != null) setBadge(tabId, Number(msg.count) || 0);
    return;
  }

  if (msg.type === 'rgc:tally') {
    addToLifetime(Number(msg.delta) || 0).then(
      (total) => sendResponse({ total }),
      () => sendResponse({ error: true }),
    );
    return true; // async response
  }

  if (msg.type === 'rgc:reset-lifetime') {
    tallyQueue = tallyQueue.then(() => api.storage.local.set({ lifetime: 0 })).catch(() => {});
    tallyQueue.then(() => sendResponse({ total: 0 }));
    return true;
  }
});
