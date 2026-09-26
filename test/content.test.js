import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

const script = readFileSync(new URL('../src/content/content.js', import.meta.url), 'utf8');

/** Runs the real content script in a jsdom page; `reply` answers each runtime message. */
async function load(reply, url = 'https://www.youtube.com/shorts/abc?feature=share#t=1') {
  const dom = new JSDOM(
    '<title>Cat Shorts</title><meta name="description" content="Funny cats"><main><h1>Cats</h1><p>So many cats.</p></main>',
    { url, runScripts: 'outside-only', pretendToBeVisual: true },
  );
  const { window } = dom;
  // jsdom has no layout, so innerText is missing; textContent is close enough here.
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    get() {
      return this.textContent;
    },
  });
  const sent = [];
  window.chrome = {
    runtime: {
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
  return { window, sent, nudge, close: () => window.close() };
}

const drifted = {
  active: true,
  verdict: 'off',
  intent: 'Book flights',
  nudgeAt: 0,
  backUrl: 'https://flights.example/',
};

describe('content script', () => {
  it('sends origin, path, title and text only', async () => {
    const { sent, close } = await load(() => ({ active: false }));
    const { page } = sent[0];
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
