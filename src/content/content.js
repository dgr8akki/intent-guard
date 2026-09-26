/**
 * Content script (classic, content scripts can't be modules). Reports the page
 * to the service worker whenever it's shown or its URL changes, and shows a
 * nudge once the service worker says the user has drifted long enough.
 */
(() => {
  const TEXT_LIMIT = 800;
  const URL_POLL_MS = 1000;
  const SETTLE_MS = 1500; // single-page apps update the title after the URL

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

  function show({ intent, backUrl }) {
    hide();
    host = document.createElement('intent-guard-nudge');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; position: fixed; z-index: 2147483647; right: 16px; bottom: 16px; }
        .card { max-width: 340px; padding: 14px 16px; border-radius: 12px; background: #1d2530; color: #f1f3f4;
          font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 6px 24px rgb(0 0 0 / 0.3); }
        p { margin: 0 0 10px; }
        .task { font-weight: 600; }
        .actions { display: flex; flex-wrap: wrap; gap: 8px; }
        button { font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 6px; cursor: pointer;
          border: 1px solid #5f6b7a; background: transparent; color: inherit; }
        button.primary { background: #8ab4f8; border-color: #8ab4f8; color: #10141a; font-weight: 600; }
        button:focus-visible { outline: 2px solid #8ab4f8; outline-offset: 2px; }
      </style>
      <div class="card" role="status" aria-live="polite">
        <p>This doesn't look like part of <span class="task"></span>.</p>
        <div class="actions">
          <button class="primary" data-act="back">Back to task</button>
          <button data-act="allow">It's part of it</button>
          <button data-act="snooze">5 more minutes</button>
        </div>
      </div>`;
    shadow.querySelector('.task').textContent = `“${intent}”`;
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
