/**
 * Judges whether a page serves the user's stated task, and tracks how long
 * they have been off it. One Jev call per page, cached for the session.
 *
 * @module lib/guard
 */

import { JevError } from './jev.js';

/** The one question asked about every page. */
export const QUESTIONS = {
  relevance: {
    type: 'score',
    instructions: "How much does this web page help with the user's current task?",
    criteria: [
      'Distraction: nothing to do with the task (feeds, entertainment, unrelated news or shopping)',
      'Loosely related but not needed for the task right now',
      'Useful for the task: research, reference, tools or communication it needs',
      'Exactly the task',
    ],
  },
};

/** A side of the scale needs this much probability to decide the verdict. */
export const VERDICT_THRESHOLD = 0.6;

/** Characters of page text sent with the title: the heading and description, or the opening text when there are none. */
export const TEXT_LIMIT = 300;

/**
 * @typedef {object} Page
 * @property {string} url Origin and path only; the content script drops query and hash.
 * @property {string} title
 * @property {string} [text] Headline and opening text of the page.
 */

/**
 * @typedef {object} Session
 * @property {string} intent What the user said they are doing.
 * @property {number} startedAt
 * @property {number} driftMinutes Minutes off task before a nudge.
 * @property {string[]} allowHosts Hosts the user marked as part of the task.
 * @property {string[]} [onHosts] Hosts the model has already put on task this session; later pages there are not sent.
 * @property {number} snoozeUntil No nudges before this time.
 * @property {number | null} offSince When the current off-task stretch began.
 * @property {string | null} lastOnTaskUrl Where "Back to task" goes.
 * @property {number} [lastCheckAt] When a page last reported in; a session nobody uses ends on its own.
 * @property {number} [confirmedAt] When the user last said they were still on it.
 */

/** @param {string} intent @param {number} [driftMinutes] @param {number} [now] @returns {Session} */
export function newSession(intent, driftMinutes = 2, now = Date.now()) {
  return {
    intent,
    startedAt: now,
    driftMinutes,
    allowHosts: [],
    onHosts: [],
    snoozeUntil: 0,
    offSince: null,
    lastOnTaskUrl: null,
    lastCheckAt: now,
  };
}

/** A session with no page checked for this long was abandoned, not paused. */
export const IDLE_LIMIT_MS = 90 * 60_000;
/** No session outlives a working day; yesterday's task must not judge today's pages. */
export const SESSION_LIMIT_MS = 8 * 3_600_000;
/** From here the popup asks whether the task is still the task. */
export const STALE_AFTER_MS = 4 * 3_600_000;

/**
 * Why a session should end on its own, or null while it is still live.
 *
 * @param {Session | null | undefined} session @param {number} now
 * @returns {'idle' | 'old' | null}
 */
export function expiryReason(session, now) {
  if (!session) return null;
  if (now - session.startedAt > SESSION_LIMIT_MS) return 'old';
  if (now - (session.lastCheckAt ?? session.startedAt) > IDLE_LIMIT_MS) return 'idle';
  return null;
}

/** Whether the popup should lead with "Still working on this?". @param {Session} session @param {number} now */
export function isStale(session, now) {
  return now - (session.confirmedAt ?? session.startedAt) > STALE_AFTER_MS;
}

/** The `state` Jev sees: the task, then the page. */
export function describePage(intent, { url, title, text = '' }) {
  return `User's task: ${intent}\n\nPage title: ${title}\nURL: ${url}\nPage text: ${text.slice(0, TEXT_LIMIT)}`;
}

/**
 * Sums each side of the scale: a page split between
 * "useful" and "exactly the task" is clearly on task even though neither level
 * alone is confident.
 *
 * @returns {{ verdict: 'on' | 'off' | 'unclear', on: number }}
 */
export function toVerdict(answers) {
  const probabilities = answers?.relevance?.probabilities;
  if (typeof probabilities !== 'object' || probabilities === null) {
    // A proxy or API change can answer with the right shape for the client and still no score.
    throw new JevError('Jev answered without a relevance score for this page.', { status: 200 });
  }
  const p = (level) => probabilities[level] ?? 0;
  const on = p(2) + p(3);
  const off = p(0) + p(1);
  return { verdict: on >= VERDICT_THRESHOLD ? 'on' : off >= VERDICT_THRESHOLD ? 'off' : 'unclear', on };
}

/**
 * Advances the drift clock. Unclear pages neither start nor stop it, so one
 * ambiguous page can't reset a stretch of scrolling. An allow-listed page
 * stops the clock but is not where "Back to task" should go: the user said it
 * was part of the task, not that it was the task.
 *
 * @param {Session} session @param {'on' | 'off' | 'unclear'} verdict @param {string} url @param {number} now
 * @param {{ judged?: boolean }} [options] `judged: false` for allow-listed pages.
 * @returns {Session}
 */
export function advance(session, verdict, url, now, { judged = true } = {}) {
  if (verdict === 'on') return { ...session, offSince: null, lastOnTaskUrl: judged ? url : session.lastOnTaskUrl };
  if (verdict === 'off') return { ...session, offSince: session.offSince ?? now };
  return session;
}

/** When to nudge, or null when on task. @param {Session} session */
export function nudgeAt(session) {
  if (session.offSince === null) return null;
  return Math.max(session.offSince + session.driftMinutes * 60_000, session.snoozeUntil);
}

/**
 * Public suffixes with two labels that people meet daily. A full list would need a
 * bundled database; for "allow this site" a close answer beats a huge one.
 */
const TWO_LABEL_SUFFIXES = new Set(
  'co.uk org.uk ac.uk gov.uk me.uk net.uk com.au net.au org.au edu.au gov.au co.nz org.nz net.nz co.jp ne.jp or.jp ac.jp co.in net.in org.in ac.in gov.in com.br com.mx com.ar com.tr com.sg com.hk com.tw co.za co.kr com.cn net.cn org.cn com.my co.il com.pl com.ua com.ru'.split(
    ' ',
  ),
);

/**
 * The site a hostname belongs to: `www.youtube.com` and `m.youtube.com` are both `youtube.com`,
 * `www.bbc.co.uk` is `bbc.co.uk`. IP addresses and single labels are returned as they are.
 *
 * @param {string} hostname
 */
export function siteOf(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || /^[\d.]+$/.test(host)) return host;
  const labels = host.split('.');
  const suffix = TWO_LABEL_SUFFIXES.has(labels.slice(-2).join('.')) ? 2 : 1;
  return labels.slice(-(suffix + 1)).join('.');
}

/** Allowing a site covers all its subdomains, so "It's part of it" on www. also covers m. @param {Session} session @param {string} url */
export function isAllowed(session, url) {
  const site = siteOf(new URL(url).hostname);
  return session.allowHosts.some((host) => siteOf(host) === site);
}

/** Time in session for the popup: `{ value: '42', unit: 'min' }`, or `'1:05'` hr past an hour. */
export function formatElapsed(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return { value: '<1', unit: 'min' };
  if (minutes < 60) return { value: String(minutes), unit: 'min' };
  return { value: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`, unit: 'hr' };
}

/**
 * The popup's drift line, or null while on task:
 * "Off task for 1 min · nudge in 1 min", "… · nudge due", or the snooze when one is running.
 *
 * @param {Session} session @param {number} now
 */
export function driftLine(session, now) {
  if (session.offSince === null) return null;
  const off = Math.floor((now - session.offSince) / 60_000);
  const text = `Off task for ${off < 1 ? 'under a minute' : `${off} min`}`;
  const snoozed = Math.ceil((session.snoozeUntil - now) / 60_000);
  const left = Math.ceil((session.offSince + session.driftMinutes * 60_000 - now) / 60_000);
  const detail = snoozed > 0 ? `snoozed for ${snoozed} more min` : left > 0 ? `nudge in ${left} min` : 'nudge due';
  return { text, detail };
}

/**
 * The popup's line about the last failed check, or null when checks succeed.
 * Key problems get a plain sentence and a way to settings; a busy provider is
 * played down because the next page retries anyway.
 *
 * @param {{ message: string, status: number | null, at: number } | null | undefined} lastError
 * @returns {{ text: string, action: string, tone: 'auth' | 'busy' | 'other' } | null}
 */
export function errorLine(lastError) {
  if (!lastError) return null;
  const { status, message } = lastError;
  if (status === 401 || status === 403)
    return { text: 'Your Jev key stopped working.', action: 'Fix in settings', tone: 'auth' };
  if (status === 402) return { text: message, action: 'Fix in settings', tone: 'auth' };
  if (status === 429) return { text: 'Jev is busy; pages are re-checked as you go.', action: 'Settings', tone: 'busy' };
  return { text: message, action: 'Settings', tone: 'other' };
}

/** Stops allowing a site the user allowed from the nudge. @param {Session} session @param {string} host */
export function disallow(session, host) {
  return { ...session, allowHosts: session.allowHosts.filter((h) => h !== host) };
}

/** Where verdicts are kept between worker restarts: `chrome.storage.session` in the extension. */
export const CACHE_KEY = 'judgeCache';

/**
 * Judges pages one at a time (TypeSafe rate-limits bursts), caching by task
 * and page. MV3 stops an idle worker after about 30 s, so a memory-only cache
 * would make every tab switch a fresh paid request; with a `store` the cache
 * is kept until the browser closes. Without one it lives in memory.
 *
 * @param {object} deps
 * @param {import('./jev.js').JevClient} deps.jev
 * @param {number} [deps.max]
 * @param {{ get: (key: string) => Promise<any>, set: (items: Record<string, any>) => Promise<void> }} [deps.store]
 */
export function createJudge({ jev, max = 500, store }) {
  let cache = store ? null : new Map();
  let chain = Promise.resolve();

  /** The stored copy, once; a store that fails just means starting empty. */
  async function loaded() {
    if (!cache) cache = new Map(Object.entries((await store.get(CACHE_KEY).catch(() => null)) ?? {}));
    return cache;
  }

  async function judgeNow(intent, page) {
    const key = `${intent}\n${page.url}\n${page.title}`;
    const known = await loaded();
    if (known.has(key)) return known.get(key);
    const result = toVerdict(await jev.evaluate({ state: describePage(intent, page), questions: QUESTIONS }));
    known.set(key, result);
    // drop-oldest cap; Map keeps insertion order
    if (known.size > max) known.delete(known.keys().next().value);
    if (store) await store.set({ [CACHE_KEY]: Object.fromEntries(known) }).catch(() => {});
    return result;
  }

  return {
    /** @param {string} intent @param {Page} page */
    judge(intent, page) {
      const result = chain.then(() => judgeNow(intent, page));
      chain = result.catch(() => {}); // one failure must not stall the queue
      return result;
    },
  };
}
