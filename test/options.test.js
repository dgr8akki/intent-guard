import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { fakeChrome, loadPage } from './page.js';
import { response } from './helpers.js';

const options = (chrome) => loadPage('../src/options/options.html', '../src/options/options.js', chrome);

const working = response(200, { answers: { ok: { type: 'choice', choice: 'yes', probabilities: { yes: 1 } } } });

let restoreGlobals;
let errors;
beforeEach(() => {
  const { fetch, console: previousConsole } = globalThis;
  errors = [];
  globalThis.console = { ...previousConsole, error: (...args) => errors.push(args) };
  restoreGlobals = () => Object.assign(globalThis, { fetch, console: previousConsole });
});
afterEach(() => restoreGlobals());

/** Types a key and submits the form; resolves once the status has settled. */
async function connect(page, key = 'vck_test') {
  const { document, tick } = page;
  document.getElementById('api-key').value = key;
  document.getElementById('key-form').dispatchEvent(new page.window.Event('submit', { cancelable: true }));
  for (let i = 0; i < 5; i++) await tick();
}

describe('options: connecting a key', () => {
  it('saves a key the provider answers for', async () => {
    globalThis.fetch = async () => working;
    const chrome = fakeChrome();
    const page = await options(chrome);
    await connect(page);
    assert.equal(chrome.data.get('apiKey'), 'vck_test');
    assert.equal(page.document.getElementById('connected').hidden, false);
    assert.match(page.document.getElementById('connected-status').textContent, /^Key works\./);
    page.restore();
  });

  it('saves the key on a 429 but says the provider is busy rather than "Key works"', async () => {
    globalThis.fetch = async () => response(429, {}, { 'retry-after': '5' });
    const chrome = fakeChrome();
    const page = await options(chrome);
    await connect(page);
    assert.equal(chrome.data.get('apiKey'), 'vck_test');
    const status = page.document.getElementById('connected-status').textContent;
    assert.match(status, /Key accepted; the provider is busy right now\./);
    assert.doesNotMatch(status, /Key works/);
    page.restore();
  });

  it('does not blame the key when the provider cannot be reached', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const chrome = fakeChrome();
    const page = await options(chrome);
    await connect(page);
    assert.equal(chrome.data.get('apiKey'), undefined);
    const input = page.document.getElementById('api-key');
    assert.equal(input.getAttribute('aria-invalid'), 'false');
    assert.match(page.document.getElementById('key-status').textContent, /Can't reach ai-gateway\.vercel\.sh/);
    page.restore();
  });

  it('marks a rejected key invalid and keeps it out of storage', async () => {
    globalThis.fetch = async () => response(401, {});
    const chrome = fakeChrome();
    const page = await options(chrome);
    await connect(page);
    assert.equal(chrome.data.get('apiKey'), undefined);
    assert.equal(page.document.getElementById('api-key').getAttribute('aria-invalid'), 'true');
    page.restore();
  });

  it('refuses a 200 that does not actually answer the question', async () => {
    globalThis.fetch = async () => response(200, { answers: { ok: {} } });
    const chrome = fakeChrome();
    const page = await options(chrome);
    await connect(page);
    assert.equal(chrome.data.get('apiKey'), undefined);
    assert.match(
      page.document.getElementById('key-status').textContent,
      /Unexpected reply from ai-gateway\.vercel\.sh\./,
    );
    page.restore();
  });

  it("logs a failure that is not the provider's and does not save", async () => {
    globalThis.fetch = async () => undefined; // something the client never expects
    const chrome = fakeChrome();
    const page = await options(chrome);
    await connect(page);
    assert.equal(chrome.data.get('apiKey'), undefined);
    assert.equal(errors.length, 1);
    assert.match(page.document.getElementById('key-status').textContent, /Something went wrong/);
    assert.equal(page.document.getElementById('api-key').getAttribute('aria-invalid'), 'false');
    page.restore();
  });
});

describe('options: focus after Connect and Cancel', () => {
  it('moves focus to Test after a successful Connect instead of dropping it on body', async () => {
    globalThis.fetch = async () => working;
    const page = await options(fakeChrome());
    page.document.getElementById('key-form').querySelector('button[type="submit"]').focus();
    await connect(page);
    assert.equal(page.document.activeElement.id, 'test');
    page.restore();
  });

  it('returns focus to Replace after Cancel', async () => {
    const page = await options(fakeChrome({ local: { apiKey: 'vck_saved', provider: 'vercel' } }));
    const { document, tick } = page;
    document.getElementById('replace').click();
    await tick();
    assert.equal(document.activeElement.id, 'api-key', 'Replace shows the form with the field focused');
    document.getElementById('cancel').focus();
    document.getElementById('cancel').click();
    await tick();
    assert.equal(document.activeElement.id, 'replace');
    assert.notEqual(document.activeElement, document.body);
    page.restore();
  });

  it('puts focus in the key field after Remove', async () => {
    const page = await options(fakeChrome({ local: { apiKey: 'vck_saved', provider: 'vercel' } }));
    const { document, tick } = page;
    document.getElementById('remove').click();
    await tick();
    assert.equal(document.activeElement.id, 'api-key');
    page.restore();
  });
});
