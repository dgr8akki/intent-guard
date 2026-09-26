/**
 * Judges whether a page serves the user's stated task, and tracks how long
 * they have been off it. One Jev call per page, cached for the session.
 *
 * @module lib/guard
 */

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

/** Characters of visible page text sent with the title. */
export const TEXT_LIMIT = 800;

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
 * @property {number} snoozeUntil No nudges before this time.
 * @property {number | null} offSince When the current off-task stretch began.
 * @property {string | null} lastOnTaskUrl Where "Back to task" goes.
 */

/** @param {string} intent @param {number} [driftMinutes] @param {number} [now] @returns {Session} */
export function newSession(intent, driftMinutes = 2, now = Date.now()) {
  return { intent, startedAt: now, driftMinutes, allowHosts: [], snoozeUntil: 0, offSince: null, lastOnTaskUrl: null };
}

/** The `state` Jev sees: the task, then the page. */
export function describePage(intent, { url, title, text = '' }) {
  return `User's task: ${intent}\n\nPage title: ${title}\nURL: ${url}\nPage text: ${text.slice(0, TEXT_LIMIT)}`;
}

/**
 * Sums each side of the scale, as in Slop Radar: a page split between
 * "useful" and "exactly the task" is clearly on task even though neither level
 * alone is confident.
 *
 * @returns {{ verdict: 'on' | 'off' | 'unclear', on: number }}
 */
export function toVerdict(answers) {
  const p = (level) => answers.relevance.probabilities[level] ?? 0;
  const on = p(2) + p(3);
  const off = p(0) + p(1);
  return { verdict: on >= VERDICT_THRESHOLD ? 'on' : off >= VERDICT_THRESHOLD ? 'off' : 'unclear', on };
}

/**
 * Advances the drift clock. Unclear pages neither start nor stop it, so one
 * ambiguous page can't reset a stretch of scrolling.
 *
 * @param {Session} session @param {'on' | 'off' | 'unclear'} verdict @param {string} url @param {number} now
 * @returns {Session}
 */
export function advance(session, verdict, url, now) {
  if (verdict === 'on') return { ...session, offSince: null, lastOnTaskUrl: url };
  if (verdict === 'off') return { ...session, offSince: session.offSince ?? now };
  return session;
}

/** When to nudge, or null when on task. @param {Session} session */
export function nudgeAt(session) {
  if (session.offSince === null) return null;
  return Math.max(session.offSince + session.driftMinutes * 60_000, session.snoozeUntil);
}

/** @param {Session} session @param {string} url */
export function isAllowed(session, url) {
  return session.allowHosts.includes(new URL(url).hostname);
}

/**
 * Judges pages one at a time (TypeSafe rate-limits bursts), caching by task
 * and page. The cache lives in memory; a service-worker restart only costs a
 * re-judge.
 *
 * @param {{ jev: import('./jev.js').JevClient, max?: number }} deps
 */
export function createJudge({ jev, max = 500 }) {
  const cache = new Map();
  let chain = Promise.resolve();

  async function judgeNow(intent, page) {
    const key = `${intent}\n${page.url}\n${page.title}`;
    if (cache.has(key)) return cache.get(key);
    const result = toVerdict(await jev.evaluate({ state: describePage(intent, page), questions: QUESTIONS }));
    cache.set(key, result);
    // ponytail: drop-oldest cap, Map keeps insertion order
    if (cache.size > max) cache.delete(cache.keys().next().value);
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
