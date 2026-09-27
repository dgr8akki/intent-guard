/**
 * Content script (classic, content scripts can't be modules). Reports the page
 * to the service worker whenever it's shown or its URL changes, and shows a
 * nudge once the service worker says the user has drifted long enough.
 */
(() => {
  const TEXT_LIMIT = 800;
  const URL_POLL_MS = 1000;
  const SETTLE_MS = 1500; // single-page apps update the title after the URL
  const FONT = 'Intent Guard Serif'; // unique, so the page's own fonts are never touched

  let timer = 0;
  let lastUrl = location.href;
  let host = null;

  /** Origin and path only: query strings and fragments can carry tokens. */
  function snapshot() {
    const root = document.querySelector('main, [role="main"], article') ?? document.body;
    const heading = document.querySelector('h1')?.innerText ?? '';
    const description = document.querySelector('meta[name="description"]')?.content ?? '';
    const text = [heading, description, root?.innerText ?? ''].join('\n').replace(/\s+/g, ' ').trim();
    return { url: location.origin + location.pathname, title: document.title, text: text.slice(0, TEXT_LIMIT) };
  }

  const send = (message) => chrome.runtime.sendMessage(message).catch(() => ({}));

  async function check() {
    clearTimeout(timer);
    if (document.visibilityState !== 'visible') return;
    const result = await send({ type: 'check', page: snapshot() });
    if (!result?.active || result.nudgeAt === null || result.nudgeAt === undefined) return hide();
    const wait = result.nudgeAt - Date.now();
    // Re-check when the timer fires rather than trusting it: the user may have got back on task in another tab.
    if (wait > 0) timer = setTimeout(check, wait);
    else show(result);
  }

  function hide() {
    host?.remove();
    host = null;
  }

  /**
   * Registers the bundled serif with the page under a name no site uses. Fonts
   * declared inside a shadow root don't load in Chrome, so the face goes on the
   * document's font set (no <style> is added to the page). Georgia covers the gap.
   */
  let fontAdded = false;
  function addFont() {
    if (fontAdded || typeof FontFace !== 'function') return;
    fontAdded = true;
    const url = chrome.runtime.getURL('fonts/source-serif-4.woff2');
    document.fonts.add(new FontFace(FONT, `url("${url}")`, { weight: '200 900', display: 'swap' }));
  }

  function show({ intent, backUrl }) {
    hide();
    addFont();
    host = document.createElement('intent-guard-nudge');
    const shadow = host.attachShadow({ mode: 'open' });
    // Follows the system theme like the popup; a hairline and deep shadow keep it legible on any page.
    shadow.innerHTML = `
      <style>
        :host {
          all: initial; position: fixed; z-index: 2147483647; right: 16px; bottom: 16px;
          --bg: #f3f2f2; --ink: #201e1d; --line: #8a8686; --rule: #201e1d;
          --accent: #00739a; --accent-hover: #006786; --accent-press: #004961; --on-accent: #f3f2f2;
        }
        @media (prefers-color-scheme: dark) {
          :host {
            --bg: #1b1a19; --ink: #ece8e7; --line: #7a7675; --rule: #ece8e7;
            --accent: #62c5ee; --accent-hover: #99e0ff; --accent-press: #cbeeff; --on-accent: #1b1a19;
          }
        }
        .card {
          box-sizing: border-box; width: 340px; max-width: calc(100vw - 32px); padding: 12px 16px 16px;
          border: 1px solid var(--line); border-radius: 4px; background: var(--bg); color: var(--ink);
          box-shadow: 0 12px 32px rgb(0 0 0 / 0.28); color-scheme: light dark;
          font: 15px/1.5 '${FONT}', Georgia, serif;
        }
        .masthead { border-top: 2px solid var(--rule); padding-top: 2px; }
        .masthead div { display: flex; align-items: center; gap: 7px; padding-top: 8px; border-top: 1px solid var(--rule); }
        .masthead span { font-size: 13px; font-weight: 600; }
        p { margin: 10px 0 14px; font-size: 17px; line-height: 1.35; text-wrap: pretty; }
        .task { font-weight: 600; }
        .actions { display: grid; gap: 8px; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        button {
          min-height: 40px; padding: 0 8px; border: 1px solid var(--line); border-radius: 2px;
          background: transparent; color: var(--ink); font: 600 14px/1.2 '${FONT}', Georgia, serif; cursor: pointer;
          transition: background-color 150ms ease;
        }
        button:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
        button:active { background: color-mix(in srgb, var(--ink) 14%, transparent); }
        button.primary { border-color: transparent; background: var(--accent); color: var(--on-accent); font-size: 15px; }
        button.primary:hover { background: var(--accent-hover); }
        button.primary:active { background: var(--accent-press); }
        button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { button { transition: none; } }
      </style>
      <div class="card" role="status" aria-live="polite">
        <div class="masthead"><div>
          <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#2b3440" />
            <circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="1.6" />
            <circle cx="16" cy="16" r="6" fill="none" stroke="#fff" stroke-width="2.2" />
            <circle cx="16" cy="16" r="2.2" fill="#8ab4f8" />
          </svg>
          <span>Intent Guard</span>
        </div></div>
        <p>This doesn’t look like part of “<span class="task"></span>”.</p>
        <div class="actions">
          <button class="primary" data-act="back">Back to task</button>
          <div class="row">
            <button data-act="allow">It’s part of it</button>
            <button data-act="snooze">5 more minutes</button>
          </div>
        </div>
      </div>`;
    shadow.querySelector('.task').textContent = intent;
    const back = shadow.querySelector('[data-act="back"]');
    if (!backUrl) back.remove();
    back.addEventListener('click', () => location.assign(backUrl));
    shadow.querySelector('[data-act="allow"]').addEventListener('click', async () => {
      hide();
      await send({ type: 'allow', url: location.href });
    });
    shadow.querySelector('[data-act="snooze"]').addEventListener('click', async () => {
      hide();
      await send({ type: 'snooze' });
      check();
    });
    document.documentElement.append(host);
  }

  document.addEventListener('visibilitychange', check);
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    hide();
    clearTimeout(timer);
    timer = setTimeout(check, SETTLE_MS);
  }, URL_POLL_MS);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'recheck') check();
  });

  check();
})();
