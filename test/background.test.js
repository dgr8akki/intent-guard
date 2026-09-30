import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * The worker's wiring, under a chrome double. The module registers its listeners at import,
 * so it is imported once and the double keeps every listener and every message it sent.
 */
const listeners = { onChanged: [], onMessage: [], onInstalled: [], onStartup: [] };
const sent = [];
const executed = [];
const tabs = [
  { id: 1, url: 'https://work.example/notes' },
  { id: 2, url: 'https://fun.example/' },
];
globalThis.chrome = {
  storage: {
    local: {
      setAccessLevel: async () => {},
      get: async () => ({}),
      set: async () => {},
      remove: async () => {},
    },
    session: { get: async () => ({}), set: async () => {} },
    onChanged: { addListener: (fn) => listeners.onChanged.push(fn) },
  },
  runtime: {
    onInstalled: { addListener: (fn) => listeners.onInstalled.push(fn) },
    onStartup: { addListener: (fn) => listeners.onStartup.push(fn) },
    onMessage: { addListener: (fn) => listeners.onMessage.push(fn) },
    openOptionsPage: () => {},
  },
  action: { setBadgeBackgroundColor: () => {}, setBadgeText: async () => {} },
  tabs: {
    query: async () => tabs,
    sendMessage: async (id, message) => {
      sent.push({ id, message });
    },
  },
  scripting: {
    executeScript: async (options) => {
      executed.push(options);
    },
  },
};
await import('../src/background.js');
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const fire = async (changes, area = 'local') => {
  listeners.onChanged.forEach((fn) => fn(changes, area));
  await tick();
};
const session = (extra) => ({ intent: 'Book flights', startedAt: 1, driftMinutes: 2, allowHosts: [], ...extra });

describe('background: pushing session state to tabs', () => {
  it('stays silent when a check merely stamps the session', async () => {
    await fire({ session: { oldValue: session({ lastCheckAt: 1000 }), newValue: session({ lastCheckAt: 2000 }) } });
    await fire({ session: { oldValue: session({ offSince: null }), newValue: session({ offSince: 5 }) } });
    assert.deepEqual(sent, [], 'a broadcast here would make every tab re-check and write again, forever');
  });

  it('tells every tab once when a session starts, and once when it ends', async () => {
    await fire({ session: { oldValue: undefined, newValue: session() } });
    assert.deepEqual(
      sent.map((m) => [m.id, m.message]),
      [
        [1, { type: 'session', active: true }],
        [2, { type: 'session', active: true }],
      ],
    );
    sent.length = 0;
    await fire({ session: { oldValue: session(), newValue: undefined } });
    assert.deepEqual(
      sent.map((m) => m.message),
      [
        { type: 'session', active: false },
        { type: 'session', active: false },
      ],
    );
  });

  it('asks tabs to re-check when the never-send list changes, and ignores other areas', async () => {
    sent.length = 0;
    await fire({ excludedHosts: { newValue: ['a.example'] } });
    assert.deepEqual(
      sent.map((m) => m.message),
      [{ type: 'recheck' }, { type: 'recheck' }],
    );
    sent.length = 0;
    await fire({ session: { oldValue: undefined, newValue: session() } }, 'sync');
    assert.deepEqual(sent, []);
  });

  it('answers runtime messages through the service and rejects unknown ones', async () => {
    const [onMessage] = listeners.onMessage;
    assert.equal(
      onMessage({ type: 'dance' }, {}, () => {}),
      false,
    );
    const reply = await new Promise((resolve) =>
      assert.equal(onMessage({ type: 'excluded', host: 'mail.google.com' }, {}, resolve), true),
    );
    assert.deepEqual(reply, { excluded: true });
  });

  it('on install, opens settings and injects the content script into open tabs', async () => {
    listeners.onInstalled.forEach((fn) => fn({ reason: 'install' }));
    await tick();
    assert.deepEqual(
      executed.map((o) => o.target.tabId),
      [1, 2],
    );
    assert.deepEqual(executed[0].files, ['content/content.js']);
  });
});
