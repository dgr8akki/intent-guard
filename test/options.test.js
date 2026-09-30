import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { fakeChrome, loadPage } from './page.js';
import { response } from './helpers.js';

const options = async (chrome) => {
  const page = await loadPage('../src/options/options.html', '../src/options/options.js', chrome);
  await import(`../src/options/key-field.js?load=${Date.now()}${Math.random()}`); // the page's second module
  return page;
};

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
    assert.match(page.document.getElementById('connected-status').textContent.trim(), /^Key works\./);
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
    assert.equal(
      page.document.getElementById('api-key').getAttribute('aria-invalid'),
      'false',
      'a garbled reply says nothing about the key',
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

describe('options: key field details', () => {
  it('says why nothing happened when the key is empty', async () => {
    const page = await options(fakeChrome());
    await connect(page, '   ');
    assert.match(page.document.getElementById('key-status').textContent, /Paste your API key first\./);
    assert.equal(page.document.getElementById('api-key').getAttribute('aria-invalid'), 'true');
    assert.equal(page.document.activeElement.id, 'api-key');
    page.restore();
  });

  it('shows and hides the key on request', async () => {
    const page = await options(fakeChrome());
    const { document } = page;
    const input = document.getElementById('api-key');
    const show = document.getElementById('show-key');
    assert.equal(input.type, 'password');
    assert.equal(show.getAttribute('aria-pressed'), 'false');
    show.click();
    assert.equal(input.type, 'text');
    assert.equal(show.getAttribute('aria-pressed'), 'true');
    assert.equal(show.textContent, 'Hide');
    show.click();
    assert.equal(input.type, 'password');
    assert.equal(show.textContent, 'Show');
    page.restore();
  });
});

describe('options: key flows', () => {
  it('locks the field while checking and hands it back afterwards', async () => {
    let release;
    globalThis.fetch = () =>
      new Promise((resolve) => (release = () => resolve(response(429, {}, { 'retry-after': '5' }))));
    const chrome = fakeChrome();
    const page = await options(chrome);
    const input = page.document.getElementById('api-key');
    input.value = 'vck_test';
    page.document.getElementById('key-form').dispatchEvent(new page.window.Event('submit', { cancelable: true }));
    await page.tick();
    assert.equal(input.readOnly, true, 'cannot change under the check');
    assert.equal(page.document.querySelector('#key-form button[type="submit"]').disabled, true);
    release();
    for (let i = 0; i < 5; i++) await page.tick();
    assert.equal(input.readOnly, false);
    assert.equal(chrome.data.get('apiKey'), 'vck_test');
    page.restore();
  });

  it('Remove forgets the key but keeps the chosen provider', async () => {
    const chrome = fakeChrome({ local: { apiKey: 'vck_saved', provider: 'typesafe' } });
    const page = await options(chrome);
    page.document.getElementById('remove').click();
    await page.tick();
    assert.equal(chrome.data.get('apiKey'), undefined);
    assert.equal(chrome.data.get('provider'), 'typesafe');
    assert.match(page.document.getElementById('key-status').textContent, /Key removed from this browser\./);
    assert.equal(page.document.getElementById('key-form').hidden, false);
    page.restore();
  });
});
