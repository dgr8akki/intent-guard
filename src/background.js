/**
 * Service worker: judges pages sent by the content script against the current
 * session's task and keeps the drift clock. The API key and session live in
 * extension storage, out of the page's reach.
 */

import { JevError, createJevClient } from './lib/jev.js';
import { advance, createJudge, disallow, isAllowed, nudgeAt } from './lib/guard.js';

// Only on Chrome 140+; a throw here would stop onMessage registering.
chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });

// First install: open settings in a tab to connect a key, rather than leaving it to a 320px popup.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

const jev = createJevClient({
  getKey: async () => (await chrome.storage.local.get('apiKey')).apiKey ?? '',
  getProvider: async () => (await chrome.storage.local.get('provider')).provider,
});
const judge = createJudge({ jev });

// Tabs report in parallel; serialize read-modify-write of the session.
let lock = Promise.resolve();
function locked(fn) {
  const run = lock.then(fn);
  lock = run.catch(() => {});
  return run;
}

const getSession = async () => (await chrome.storage.local.get('session')).session ?? null;
const setSession = (session) => chrome.storage.local.set({ session });

async function check(page) {
  const session = await getSession();
  if (!session) return { active: false };
  const { verdict } = isAllowed(session, page.url) ? { verdict: 'on' } : await judge.judge(session.intent, page);
  return locked(async () => {
    const current = await getSession();
    if (current?.startedAt !== session.startedAt) return { active: false }; // ended or restarted meanwhile
    const next = advance(current, verdict, page.url, Date.now());
    await setSession(next);
    return { active: true, verdict, intent: next.intent, nudgeAt: nudgeAt(next), backUrl: next.lastOnTaskUrl };
  });
}

const update = (change) =>
  locked(async () => {
    const session = await getSession();
    if (session) await setSession({ ...session, ...change(session) });
    return {};
  });

const handlers = {
  check: (message) => check(message.page),
  allow: (message) => update((s) => ({ allowHosts: [...s.allowHosts, new URL(message.url).hostname], offSince: null })),
  snooze: () => update(() => ({ snoozeUntil: Date.now() + 5 * 60_000 })),
  disallow: (message) => update((s) => disallow(s, message.host)),
};

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const handler = handlers[message?.type];
  if (!handler) return false;
  handler(message).then(reply, (error) =>
    reply({ error: error instanceof JevError ? error.message : 'Check failed.' }),
  );
  return true; // reply asynchronously
});
