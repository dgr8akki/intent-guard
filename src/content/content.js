/**
 * Content script (classic, content scripts can't be modules). Reports the page
 * to the service worker whenever it's shown or its URL changes, and shows a
 * nudge once the service worker says the user has drifted long enough. With no
 * session running it does nothing after the first reply until the worker says
 * one started, so idle tabs neither poll nor wake the worker.
 */
(() => {
  // The worker injects this into tabs that were open before install or session start; a page may already have it.
  if (window.__intentGuard) return;
  window.__intentGuard = true;

  const TEXT_LIMIT = 300;
  const URL_POLL_MS = 5000; // pushState fires no event; popstate covers back/forward, this catches the rest
  const SETTLE_MS = 1500; // single-page apps update the title after the URL

  let timer = 0;
  let poll = 0;
  let active = null; // unknown until the worker's first reply
  const pathOf = () => location.origin + location.pathname; // query and hash never change what is sent
  let lastPath = pathOf();
  let host = null;
  let shown = null; // { offSince, at }: which off-task stretch the card was last shown for, and when

  const send = (message) => chrome.runtime.sendMessage(message).catch(() => ({}));

  /**
   * Pages that are never described to Jev: anything with a password field, anything marked
   * noindex, and hosts on the built-in or user list (only the service worker can read that list,
   * and it can change while the page is open, so ask every time; it is one local message).
   * An unanswered question counts as excluded; better a missed check than a mail subject sent.
   */
  async function isExcluded() {
    if (document.querySelector('input[type="password"]')) return true;
    if (/\bnoindex\b/i.test(document.querySelector('meta[name="robots"]')?.content ?? '')) return true;
    const reply = await send({ type: 'excluded', host: location.hostname });
    return typeof reply?.excluded === 'boolean' ? reply.excluded : true;
  }

  const SKIP = 'script, style, noscript, nav, footer, header, aside, [aria-hidden="true"]';

  /**
   * The first `limit` characters of readable text under `root`. innerText would force layout and
   * serialise the whole subtree (megabytes on a mail client) to keep a few hundred characters;
   * walking text nodes and stopping early costs nothing on any page.
   */
  function pageText(root, limit) {
    if (!root) return '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let text = '';
    for (let node = walker.nextNode(); node && text.length < limit; node = walker.nextNode()) {
      const piece = node.nodeValue.replace(/\s+/g, ' ');
      if (piece.trim()) text += (text && !text.endsWith(' ') && !piece.startsWith(' ') ? ' ' : '') + piece;
    }
    return text.replace(/\s+/g, ' ').trim().slice(0, limit);
  }

  /** Origin and path only: query strings and fragments can carry tokens. Excluded pages send the origin alone. */
  function snapshot(excluded) {
    if (excluded) return { url: location.origin, title: '', text: '' };
    // The heading and description say what a page is about; the opening text is only read when a page has neither.
    const heading = pageText(document.querySelector('h1'), TEXT_LIMIT);
    const description = document.querySelector('meta[name="description"]')?.content ?? '';
    let text = `${heading} ${description}`.replace(/\s+/g, ' ').trim();
    if (!text) text = pageText(document.querySelector('main, [role="main"], article') ?? document.body, TEXT_LIMIT);
    return { url: location.origin + location.pathname, title: document.title, text: text.slice(0, TEXT_LIMIT) };
  }

  async function check() {
    clearTimeout(timer);
    // Hidden tabs never report, on task or off, so a page the user left open but never returns to cannot
    // become "Back to task"; lastOnTaskUrl can therefore lag behind. Acceptable: only shown pages are judged.
    if (document.visibilityState !== 'visible') return;
    if (active === false) return; // no session: nothing is read or sent until the worker says one started
    const result = await send({ type: 'check', page: snapshot(await isExcluded()) });
    // Only a real answer says whether a session runs; a failed check ({ error }) keeps the page watching.
    if (typeof result?.active === 'boolean') setActive(result.active);
    if (!result?.active || result.nudgeAt === null || result.nudgeAt === undefined) return hide();
    const now = Date.now();
    let wait = result.nudgeAt - now;
    // Once nudged for this stretch, stay quiet until another drift period has passed; on a single-page app
    // every click is a navigation and the card would otherwise pop back on each one.
    if (wait <= 0 && shown && shown.offSince === result.offSince) {
      wait = shown.at + result.driftMinutes * 60_000 - now;
    }
    // Re-check when the timer fires rather than trusting it: the user may have got back on task in another tab.
    if (wait > 0) timer = setTimeout(check, wait);
    else show(result);
  }

  function hide() {
    host?.remove();
    host = null;
    document.removeEventListener('keydown', onEscape, true);
  }

  /** Escape snoozes: the card takes no focus, so a key the page might not use is the keyboard path to it. */
  function onEscape(event) {
    if (event.key !== 'Escape' || !host) return;
    event.preventDefault();
    snooze();
  }

  async function snooze() {
    hide();
    await send({ type: 'snooze' });
    check();
  }

  function show({ intent, backUrl, offSince }) {
    hide();
    shown = { offSince, at: Date.now() };
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
          max-height: calc(100vh - 32px); overflow: auto; /* at 400% zoom the viewport is 320x256; scroll rather than clip */
          border: 1px solid var(--line); border-radius: 4px; background: var(--bg); color: var(--ink);
          box-shadow: 0 12px 32px rgb(0 0 0 / 0.28); color-scheme: light dark;
          font: 15px/1.5 Georgia, serif;
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
          background: transparent; color: var(--ink); font: 600 14px/1.2 Georgia, serif; cursor: pointer;
          transition: background-color 150ms ease;
        }
        button:hover { background: color-mix(in srgb, var(--ink) 7%, transparent); }
        button:active { background: color-mix(in srgb, var(--ink) 14%, transparent); }
        button.primary { border-color: transparent; background: var(--accent); color: var(--on-accent); font-size: 15px; }
        button.primary:hover { background: var(--accent-hover); }
        button.primary:active { background: var(--accent-press); }
        button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .kbd {
          margin-left: 6px; padding: 0 5px; border: 1px solid var(--line); border-radius: 3px;
          font: 600 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; opacity: 0.85;
        }
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
            <button data-act="snooze">5 more minutes<kbd class="kbd" aria-hidden="true">Esc</kbd></button>
          </div>
        </div>
      </div>`;
    shadow.querySelector('.task').textContent = intent;
    const back = shadow.querySelector('[data-act="back"]');
    if (!backUrl) back.remove();
    // Only ever an origin + path this script reported, but a scheme check costs nothing if that ever changes.
    back.addEventListener('click', () => /^https?:/.test(backUrl) && location.assign(backUrl));
    shadow.querySelector('[data-act="allow"]').addEventListener('click', async () => {
      hide();
      await send({ type: 'allow', url: location.href });
    });
    shadow.querySelector('[data-act="snooze"]').addEventListener('click', snooze);
    document.addEventListener('keydown', onEscape, true); // capture: the page's own handlers must not eat it
    document.documentElement.append(host);
  }

  /** A navigation within the document: judge the new page once its title has settled. */
  function urlChanged() {
    if (pathOf() === lastPath) return;
    lastPath = pathOf();
    hide();
    clearTimeout(timer);
    timer = setTimeout(check, SETTLE_MS);
  }

  /** Watches the page only while a session runs; otherwise every listener and timer is off. */
  function setActive(next) {
    if (next === active) return;
    active = next;
    if (next) {
      document.addEventListener('visibilitychange', check);
      window.addEventListener('popstate', urlChanged);
      poll = setInterval(urlChanged, URL_POLL_MS);
    } else {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('popstate', urlChanged);
      clearInterval(poll);
      clearTimeout(timer);
      hide();
    }
  }

  /** First contact: ask whether a session runs before reading anything of the page. */
  async function start() {
    if (document.visibilityState !== 'visible') return;
    const reply = await send({ type: 'session?' });
    setActive(Boolean(reply?.active));
    if (active) check();
  }

  // A tab that loads hidden asks once it is shown; while active, setActive() owns this event.
  document.addEventListener('visibilitychange', () => {
    if (active === null) start();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'session') {
      setActive(message.active);
      if (message.active) check();
    } else if (message?.type === 'recheck') {
      active = null; // whatever changed, ask again
      start();
    }
  });

  start();
})();
