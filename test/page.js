/**
 * Runs an extension page (popup or settings) inside jsdom with a fake `chrome`,
 * so the real module wires itself to the real markup.
 */

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

/**
 * A `chrome` double: storage.local in a Map that fires onChanged like the real one,
 * plus recorders for messages, tabs and opened pages.
 */
export function fakeChrome({ local = {}, tabs = [], reply = async () => ({}) } = {}) {
  const data = new Map(Object.entries(local));
  const listeners = [];
  const sent = [];
  const tabMessages = [];
  const opened = [];
  const badges = [];
  const fire = (changes) => listeners.forEach((fn) => fn(changes, 'local'));
  const keysOf = (keys) => (typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys ?? {}));
  return {
    data,
    sent,
    tabMessages,
    opened,
    badges,
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(
            keysOf(keys)
              .filter((k) => data.has(k))
              .map((k) => [k, data.get(k)]),
          );
        },
        async set(items) {
          const changes = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: data.get(key), newValue: value };
            data.set(key, value);
          }
          fire(changes);
        },
        async remove(keys) {
          const changes = {};
          for (const key of keysOf(keys)) {
            changes[key] = { oldValue: data.get(key) };
            data.delete(key);
          }
          fire(changes);
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    runtime: {
      async sendMessage(message) {
        sent.push(message);
        return reply(message);
      },
      openOptionsPage: async () => opened.push('options'),
      getURL: (path) => `chrome-extension://intent-guard/${path}`,
      onMessage: { addListener() {} },
    },
    tabs: {
      async query() {
        return tabs;
      },
      async sendMessage(id, message) {
        tabMessages.push({ id, message });
      },
      async create({ url }) {
        opened.push(url);
      },
    },
    action: { setBadgeText: async ({ text }) => badges.push(text) },
  };
}

let loads = 0;

/**
 * @param {string} html Path of the page, relative to test/.
 * @param {string} script Path of its module, relative to test/.
 * @param {ReturnType<typeof fakeChrome>} chrome
 * @returns {Promise<{ window: Window, document: Document, tick: () => Promise<void>, restore: () => void }>}
 */
export async function loadPage(html, script, chrome) {
  const markup = readFileSync(new URL(html, import.meta.url), 'utf8')
    .replace(/<script[^>]*><\/script>/g, '')
    .replace(/<link[^>]*>/g, '');
  const { window } = new JSDOM(markup, { url: 'chrome-extension://intent-guard/page.html', pretendToBeVisual: true });

  // The module reads these as globals. Intervals must not hold the test process open.
  const names = ['window', 'document', 'chrome', 'HTMLElement', 'Event', 'KeyboardEvent', 'setInterval'];
  const previous = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  Object.assign(globalThis, {
    window,
    document: window.document,
    chrome,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    setInterval: (fn, ms) => previous.setInterval(fn, ms).unref(),
  });
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  try {
    await import(`${new URL(script, import.meta.url).href}?load=${++loads}`);
    await tick();
  } catch (error) {
    Object.assign(globalThis, previous);
    throw error;
  }
  return {
    window,
    document: window.document,
    tick,
    restore: () => {
      Object.assign(globalThis, previous);
      window.close();
    },
  };
}
