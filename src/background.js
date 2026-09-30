/**
 * Service worker: judges pages sent by the content script against the current
 * session's task and keeps the drift clock. The API key and session live in
 * extension storage, out of the page's reach. The decisions are in lib/service.js.
 */

import { createJevClient, sessionPauseStore } from './lib/jev.js';
import { createJudge } from './lib/guard.js';
import { createService } from './lib/service.js';

// Only on Chrome 140+; a throw here would stop onMessage registering.
chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });

// First install: open settings in a tab to connect a key, rather than leaving it to a 320px popup.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'install') return;
  chrome.runtime.openOptionsPage();
  injectIntoOpenTabs(); // otherwise tabs open before install never report and the first session seems to do nothing
});

const jev = createJevClient({
  getKey: async () => (await chrome.storage.local.get('apiKey')).apiKey ?? '',
  getProvider: async () => (await chrome.storage.local.get('provider')).provider,
  pauseStore: sessionPauseStore(chrome.storage.session), // a 429 backoff outlives a worker restart
});

/** chrome.storage.local one key at a time, which is all the service needs. */
const storage = {
  get: async (key) => (await chrome.storage.local.get(key))[key],
  set: (items) => chrome.storage.local.set(items),
  remove: (key) => chrome.storage.local.remove(key),
};
chrome.action.setBadgeBackgroundColor({ color: '#aa0b56' });
/** Verdicts survive the worker being stopped but not the browser closing; content scripts cannot read this area. */
const sessionStore = {
  get: async (key) => (await chrome.storage.session.get(key))[key],
  set: (items) => chrome.storage.session.set(items),
};
const service = createService({
  storage,
  judge: createJudge({ jev, store: sessionStore }),
  badge: (text) => chrome.action.setBadgeText({ text }),
  inject: injectIntoOpenTabs,
});

chrome.runtime.onStartup.addListener(() => service.startup());

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const result = service.handle(message);
  if (!result) return false;
  result.then(reply);
  return true; // reply asynchronously
});

// Push state to open pages instead of letting them poll: a session started or ended tells every tab
// whether to watch the page at all, and a change to the "never send" list makes each decide afresh.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // Every check writes the session (lastCheckAt), so only a change in whether one exists may be
  // broadcast; announcing every write made each tab re-check, which wrote again, without end.
  if (changes.session) {
    const was = Boolean(changes.session.oldValue);
    const is = Boolean(changes.session.newValue);
    if (was !== is) broadcast({ type: 'session', active: is });
  }
  if (changes.excludedHosts) broadcast({ type: 'recheck' });
});

const httpTabs = () => chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });

/** Sends to every tab, whatever its URL; tabs without the content script reject and are skipped. */
async function broadcast(message) {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, message)));
}

/**
 * Adds the content script to tabs that are already open. Chrome refuses some (its own pages, the
 * store, tabs it is still restoring); those rejections are expected and dropped. The script itself
 * is a no-op where it already runs.
 */
async function injectIntoOpenTabs() {
  const tabs = await httpTabs();
  await Promise.allSettled(
    tabs.map((tab) => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/content.js'] })),
  );
}
