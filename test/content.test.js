import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

const script = readFileSync(new URL('../src/content/content.js', import.meta.url), 'utf8');

/** Runs the real content script in a jsdom page; `reply` answers each runtime message. */
const PAGE =
  '<title>Cat Shorts</title><meta name="description" content="Funny cats"><main><h1>Cats</h1><p>So many cats.</p></main>';

async function load(reply, url = 'https://www.youtube.com/shorts/abc?feature=share#t=1', html = PAGE) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  // jsdom has no layout, so innerText is missing; textContent is close enough here.
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    get() {
      return this.textContent;
    },
  });
  const sent = [];
  const fonts = [];
  window.FontFace = class {
    constructor(family, source, descriptors) {
      Object.assign(this, { family, source, descriptors });
    }
  };
  Object.defineProperty(window.document, 'fonts', { value: { add: (face) => fonts.push(face) } });
  window.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://intent-guard/${path}`,
      sendMessage: async (message) => {
        sent.push(message);
        return reply(message);
      },
      onMessage: { addListener: () => {} },
    },
  };
  window.eval(script);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const nudge = () => window.document.querySelector('intent-guard-nudge')?.shadowRoot;
  const checks = () => sent.filter((m) => m.type === 'check');
  return { window, sent, checks, fonts, nudge, close: () => window.close() };
}

/** Messages are created in the jsdom realm; copy them before comparing structures. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Answers the exclusion question, then `check` like the given reply. */
const withExclusion = (excluded, reply) => (m) => (m.type === 'excluded' ? { excluded } : reply);

const drifted = {
  active: true,
  verdict: 'off',
  intent: 'Book flights',
  nudgeAt: 0,
  backUrl: 'https://flights.example/',
};

describe('content script', () => {
  it('sends origin, path, title and text only', async () => {
    const { checks, close } = await load(withExclusion(false, { active: false }));
    const { page } = checks()[0];
    assert.equal(page.url, 'https://www.youtube.com/shorts/abc');
    assert.equal(page.title, 'Cat Shorts');
    assert.match(page.text, /Cats Funny cats/);
    close();
  });

  it('nudges once drift time has passed, naming the task', async () => {
    const { nudge, close } = await load(() => drifted);
    assert.match(nudge().textContent, /“Book flights”/);
    assert.ok(nudge().querySelector('[data-act="back"]'));
    close();
  });

  it('registers the bundled font once, under its own family name', async () => {
    const { window, fonts, nudge, close } = await load(() => drifted);
    window.document.dispatchEvent(new window.Event('visibilitychange')); // shows the nudge again
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(nudge());
    assert.equal(fonts.length, 1);
    assert.equal(fonts[0].family, 'Intent Guard Serif');
    assert.equal(fonts[0].source, 'url("chrome-extension://intent-guard/fonts/source-serif-4.woff2")');
    close();
  });

  it('stays quiet on task, when inactive, or before drift time', async () => {
    for (const reply of [
      { active: true, verdict: 'on', nudgeAt: null },
      { active: false },
      { ...drifted, nudgeAt: Date.now() + 60_000 },
      { error: 'Jev is busy.' },
    ]) {
      const { nudge, close } = await load(() => reply);
      assert.equal(nudge(), undefined, JSON.stringify(reply));
      close();
    }
  });

  it('asks the service worker about the host once, then sends only the origin when it is excluded', async () => {
    const { sent, checks, close } = await load(
      withExclusion(true, { active: false }),
      'https://mail.google.com/mail/u/0/#inbox',
    );
    assert.deepEqual(plain(sent[0]), { type: 'excluded', host: 'mail.google.com' });
    assert.deepEqual(plain(checks()[0].page), { url: 'https://mail.google.com', title: '', text: '' });
    close();
  });

  it('sends only the origin from a page with a password field', async () => {
    const { sent, checks, close } = await load(
      withExclusion(false, { active: false }),
      'https://shop.example/account/login?next=/cart',
      `${PAGE}<form><input type="password" name="pw"></form>`,
    );
    assert.deepEqual(plain(checks()[0].page), { url: 'https://shop.example', title: '', text: '' });
    assert.ok(!sent.some((m) => m.type === 'excluded'), 'no need to ask when the page decides itself');
    close();
  });

  it('sends only the origin from a page marked noindex', async () => {
    const { checks, close } = await load(
      withExclusion(false, { active: false }),
      'https://docs.example/private/abc123',
      `${PAGE}<meta name="robots" content="noindex, nofollow">`,
    );
    assert.deepEqual(plain(checks()[0].page), { url: 'https://docs.example', title: '', text: '' });
    close();
  });

  it('treats an unanswered exclusion question as excluded', async () => {
    const { checks, close } = await load((m) => (m.type === 'excluded' ? {} : { active: false }));
    assert.equal(checks()[0].page.title, '');
    close();
  });

  it('is a no-op when injected a second time into the same page', async () => {
    const { window, checks, close } = await load(withExclusion(false, { active: false }));
    window.eval(script); // executeScript over open tabs can hit a page that already has it
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(checks().length, 1);
    assert.equal(window.__intentGuard, true);
    close();
  });

  it('hides "Back to task" when there is nowhere to go back to', async () => {
    const { nudge, close } = await load(() => ({ ...drifted, backUrl: null }));
    assert.equal(nudge().querySelector('[data-act="back"]'), null);
    close();
  });

  it('"It\'s part of it" allows the site and dismisses the nudge', async () => {
    const { window, sent, nudge, close } = await load((m) => (m.type === 'check' ? drifted : {}));
    nudge().querySelector('[data-act="allow"]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(sent.at(-1).type, 'allow');
    assert.equal(window.document.querySelector('intent-guard-nudge'), null);
    close();
  });
});
