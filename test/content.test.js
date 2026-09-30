import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const script = readFileSync(new URL('../src/content/content.js', import.meta.url), 'utf8');

/** Runs the real content script in a jsdom page; `reply` answers each runtime message. */
const PAGE =
  '<title>Cat Shorts</title><meta name="description" content="Funny cats"><main><h1>Cats</h1><p>So many cats.</p></main>';

async function load(reply, url = 'https://www.youtube.com/shorts/abc?feature=share#t=1', html = PAGE) {
  // jsdom cannot navigate; it reports an attempt as a "not implemented" error, which is how tests see location.assign.
  const navigations = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (/navigation/i.test(error.message)) navigations.push(error.message);
    else console.error(error);
  });
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  const sent = [];
  const listeners = [];
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
      onMessage: { addListener: (fn) => listeners.push(fn) },
    },
  };
  window.eval(script);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const nudge = () => window.document.querySelector('intent-guard-nudge')?.shadowRoot;
  const checks = () => sent.filter((m) => m.type === 'check');
  const deliver = (message) => listeners.forEach((fn) => fn(message));
  const settle = (ms = 1700) => new Promise((resolve) => setTimeout(resolve, ms)); // past SETTLE_MS
  return { window, sent, checks, deliver, settle, fonts, nudge, navigations, close: () => window.close() };
}

/** Messages are created in the jsdom realm; copy them before comparing structures. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Answers the exclusion question, then `check` like the given reply. */
const withExclusion = (excluded, reply) => (m) =>
  m.type === 'excluded' ? { excluded } : typeof reply === 'function' ? reply(m) : reply;

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

  it('sends only the heading and description when a page has them', async () => {
    const { checks, close } = await load(withExclusion(false, { active: false }));
    assert.equal(checks()[0].page.text, 'Cats Funny cats', 'body text stays on the page');
    close();
  });

  it('falls back to visible body text, skipping chrome and scripts, and stops at the limit', async () => {
    const filler = 'lorem ipsum '.repeat(200); // 2400 characters, far past the cap
    const html = `<title>Long</title><main><nav>Menu Home About</nav><header>Masthead</header>
      <script>var secret = 1;</script><style>.x{}</style><noscript>Enable JS</noscript>
      <aside>Sidebar promo</aside><p aria-hidden="true">decorative</p><p>Story ${filler}</p><footer>Copyright</footer></main>`;
    const { checks, close } = await load(withExclusion(false, { active: false }), 'https://news.example/story', html);
    const { text } = checks()[0].page;
    assert.ok(text.length <= 300, `${text.length} chars`);
    assert.ok(text.length >= 250, 'reads into the body');
    assert.match(text, /^Story lorem ipsum/);
    for (const junk of ['Menu', 'Masthead', 'secret', '.x{}', 'Enable JS', 'Sidebar', 'decorative', 'Copyright']) {
      assert.ok(!text.includes(junk), `leaked ${junk}`);
    }
    close();
  });

  it('nudges once drift time has passed, naming the task', async () => {
    const { nudge, close } = await load(() => drifted);
    assert.match(nudge().textContent, /“Book flights”/);
    assert.ok(nudge().querySelector('[data-act="back"]'));
    close();
  });

  it('adds nothing to the page: no fonts, no stylesheets, only the shadow host', async () => {
    const { window, fonts, nudge, close } = await load(() => drifted);
    assert.ok(nudge());
    assert.equal(fonts.length, 0, 'no FontFace registered on the page');
    assert.equal(window.document.querySelectorAll('style, link[rel="stylesheet"]').length, 0);
    assert.match(nudge().querySelector('style').textContent, /Georgia, serif/);
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

  it('asks the service worker about the host before each check, and sends only the origin when it is excluded', async () => {
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

  it('follows an http(s) "Back to task" URL and ignores any other scheme', async () => {
    const ok = await load(() => drifted);
    ok.nudge().querySelector('[data-act="back"]').click();
    assert.equal(ok.navigations.length, 1, 'jsdom saw a navigation attempt');
    ok.close();

    const bad = await load(() => ({ ...drifted, backUrl: 'javascript:alert(1)' }));
    bad.nudge().querySelector('[data-act="back"]').click();
    assert.equal(bad.navigations.length, 0);
    bad.close();
  });

  it('Escape snoozes and dismisses the nudge, and the snooze button says so', async () => {
    let snoozed = false;
    const { window, sent, nudge, close } = await load((m) => {
      if (m.type === 'snooze') snoozed = true;
      return m.type === 'check' ? { ...drifted, nudgeAt: snoozed ? Date.now() + 5 * 60_000 : 0 } : {};
    });
    assert.match(nudge().querySelector('[data-act="snooze"]').textContent, /Esc/);
    assert.equal(nudge().querySelector('.card').getAttribute('role'), 'status', 'no dialog, no focus move');
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(window.document.querySelector('intent-guard-nudge'), null);
    assert.ok(sent.some((m) => m.type === 'snooze'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Once the card is gone, Escape belongs to the page again.
    const before = sent.length;
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(sent.length, before);
    close();
  });

  it('caps the card height to the viewport so every button stays reachable at high zoom', async () => {
    const { nudge, close } = await load(() => drifted);
    const css = nudge().querySelector('style').textContent;
    assert.match(css, /\.card\s*\{[^}]*max-height:\s*calc\(100vh - 32px\)/);
    assert.match(css, /\.card\s*\{[^}]*overflow:\s*auto/);
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

describe('content script: only works while a session runs', () => {
  const onTask = { active: true, verdict: 'on', nudgeAt: null };

  it('checks once on load and then stays quiet without a session', async () => {
    const { window, checks, settle, close } = await load(withExclusion(false, { active: false }));
    assert.equal(checks().length, 1);
    window.document.dispatchEvent(new window.Event('visibilitychange'));
    window.history.pushState({}, '', '/watch');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle();
    assert.equal(checks().length, 1, 'no visibility or URL re-check while inactive');
    close();
  });

  it('wakes up when the worker says a session started, and stops when it ends', async () => {
    const { window, checks, deliver, settle, nudge, close } = await load(withExclusion(false, onTask));
    // Pretend the first reply had been inactive: the worker then pushes the change.
    deliver({ type: 'session', active: true });
    await settle(50);
    assert.equal(checks().length, 2);
    window.document.dispatchEvent(new window.Event('visibilitychange'));
    await settle(50);
    assert.equal(checks().length, 3, 'visibility re-checks while active');
    deliver({ type: 'session', active: false });
    window.document.dispatchEvent(new window.Event('visibilitychange'));
    await settle(50);
    assert.equal(checks().length, 3, 'nothing after the session ended');
    assert.equal(nudge(), undefined);
    close();
  });

  it('re-checks on a path change but not on a query or hash change', async () => {
    const { window, checks, settle, close } = await load(withExclusion(false, onTask));
    window.history.pushState({}, '', '/shorts/abc?feature=other#t=9');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle();
    assert.equal(checks().length, 1, 'same origin and path: nothing to re-judge');
    window.history.pushState({}, '', '/watch?v=1');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle();
    assert.equal(checks().length, 2);
    assert.equal(checks()[1].page.url, 'https://www.youtube.com/watch');
    close();
  });
});

describe('content script: one nudge per off-task stretch', () => {
  it('does not re-show the card on every navigation within the same stretch', async () => {
    const offSince = Date.now() - 3 * 60_000;
    const due = { ...drifted, offSince, driftMinutes: 2, nudgeAt: offSince + 2 * 60_000 };
    const { window, checks, nudge, settle, close } = await load(withExclusion(false, due));
    assert.ok(nudge(), 'first nudge shows');
    window.history.pushState({}, '', '/shorts/def');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle();
    assert.equal(checks().length, 2, 'the new page is still judged');
    assert.equal(nudge(), undefined, 'but the card does not come back');
    window.history.pushState({}, '', '/shorts/ghi');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle();
    assert.equal(nudge(), undefined);
    close();
  });

  it('shows again once a new off-task stretch begins', async () => {
    const offSince = Date.now() - 3 * 60_000;
    let reply = { ...drifted, offSince, driftMinutes: 2, nudgeAt: offSince + 2 * 60_000 };
    const { window, nudge, settle, close } = await load(withExclusion(false, () => reply));
    assert.ok(nudge());
    reply = { ...reply, offSince: offSince + 60_000, nudgeAt: offSince + 3 * 60_000 }; // clock reset and ran out again
    window.history.pushState({}, '', '/shorts/def');
    window.dispatchEvent(new window.PopStateEvent('popstate'));
    await settle();
    assert.ok(nudge(), 'a different stretch gets its own nudge');
    close();
  });
});

describe('content script: timers, hidden tabs and recheck', () => {
  it('after snooze, a future nudge time sets a timer and shows nothing', async () => {
    let snoozed = false;
    const { window, sent, nudge, close } = await load((m) => {
      if (m.type === 'snooze') snoozed = true;
      return m.type === 'check' ? { ...drifted, nudgeAt: snoozed ? Date.now() + 5 * 60_000 : 0 } : {};
    });
    nudge().querySelector('[data-act="snooze"]').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(sent.some((m) => m.type === 'snooze'));
    assert.equal(sent.filter((m) => m.type === 'check').length, 2, 're-checked right after snoozing');
    assert.equal(window.document.querySelector('intent-guard-nudge'), null, 'nothing shown until the timer fires');
    close();
  });

  it('sends nothing from a hidden tab', async () => {
    const dom = new JSDOM(PAGE, { url: 'https://www.youtube.com/', runScripts: 'outside-only' });
    const { window } = dom;
    Object.defineProperty(window.document, 'visibilityState', { value: 'hidden' });
    const sent = [];
    window.chrome = {
      runtime: {
        getURL: (p) => p,
        sendMessage: async (m) => (sent.push(m), { active: true }),
        onMessage: { addListener() {} },
      },
    };
    window.eval(script);
    await new Promise((resolve) => setTimeout(resolve, 10));
    window.document.dispatchEvent(new window.Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(sent, []);
    window.close();
  });

  it('a recheck message triggers a fresh check even after an inactive reply', async () => {
    const { checks, deliver, settle, close } = await load(withExclusion(false, { active: false }));
    assert.equal(checks().length, 1);
    deliver({ type: 'recheck' });
    await settle(20);
    assert.equal(checks().length, 2);
    close();
  });
});
