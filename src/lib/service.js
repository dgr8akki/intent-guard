/**
 * What the service worker decides, behind a storage adapter so it runs in
 * tests: judging pages against the session, keeping the drift clock, and
 * answering the content script's questions.
 */

import { isExcluded } from './exclusions.js';
import { advance, disallow, expiryReason, isAllowed, nudgeAt, siteOf } from './guard.js';
import { JevError } from './jev.js';

/**
 * @typedef {object} Storage One key at a time over `chrome.storage.local`.
 * @property {(key: string) => Promise<any>} get
 * @property {(items: Record<string, any>) => Promise<void>} set
 * @property {(key: string) => Promise<void>} remove
 */

/** Shown for a failure that is not the provider's; the real cause goes to the console. */
export const GENERIC_ERROR = "Couldn't check this page. It'll try again on your next page.";

/**
 * @param {object} deps
 * @param {Storage} deps.storage
 * @param {ReturnType<import('./guard.js').createJudge>} deps.judge
 * @param {() => number} [deps.now]
 * @param {(...args: unknown[]) => void} [deps.log] Where failures are reported; the console in the worker.
 * @param {(text: string) => void} [deps.badge] Sets the toolbar badge: '!' while checks fail, '' otherwise.
 * @param {() => Promise<void>} [deps.inject] Puts the content script into tabs that are already open.
 */
export function createService({
  storage,
  judge,
  now = Date.now,
  log = console.error,
  badge = () => {},
  inject = async () => {},
}) {
  // Tabs report in parallel; serialize read-modify-write of the session.
  let lock = Promise.resolve();
  function locked(fn) {
    const run = lock.then(fn);
    lock = run.catch(() => {});
    return run;
  }

  const getSession = async () => (await storage.get('session')) ?? null;
  const setSession = (session) => storage.set({ session });

  // Whether a failure is on record. Unknown until the first judgement after a worker start.
  let failing = null;

  /** A failed check must be visible: popup line, toolbar badge and the worker console. */
  async function recordFailure(error) {
    const known = error instanceof JevError;
    log('Intent Guard: check failed', error);
    await storage.set({
      lastError: { message: known ? error.message : GENERIC_ERROR, status: known ? error.status : null, at: now() },
    });
    badge('!');
    failing = true;
  }

  async function clearFailure() {
    if (failing === null) failing = Boolean(await storage.get('lastError'));
    if (!failing) return;
    await storage.remove('lastError');
    badge('');
    failing = false;
  }

  async function verdictFor(session, page) {
    if (isAllowed(session, page.url)) return 'on';
    // An excluded page sends its origin and nothing else. It is neither on nor off task, and Jev never sees it.
    if (!page.title && !page.text) return 'unclear';
    // A host the model already put on task this session stays on task: fewer requests, less text sent.
    if ((session.onHosts ?? []).includes(new URL(page.url).hostname)) return 'on';
    let verdict;
    try {
      ({ verdict } = await judge.judge(session.intent, page));
    } catch (error) {
      await recordFailure(error);
      throw error;
    }
    await clearFailure();
    return verdict;
  }

  /** Starts a session, then reaches the tabs that were open before it. Injection failing must not stop the session. */
  async function start({ session }) {
    await storage.set({ session });
    await inject().catch((error) => log('Intent Guard: could not reach open tabs', error));
    return {};
  }

  /** Ends the session and anything shown about it. */
  async function end() {
    await storage.remove('session');
    await storage.remove('lastError');
    badge('');
    failing = false;
    return {};
  }

  /** Ends a session that has run out, returning whether it did. */
  async function sweep() {
    const session = await getSession();
    if (!expiryReason(session, now())) return { ended: false };
    await end();
    return { ended: true };
  }

  async function check({ page }) {
    const session = await getSession();
    if (!session) return { active: false };
    if ((await sweep()).ended) return { active: false }; // stale sessions end quietly rather than judge on
    const verdict = await verdictFor(session, page);
    return locked(async () => {
      const current = await getSession();
      if (current?.startedAt !== session.startedAt) return { active: false }; // ended or restarted meanwhile
      const allowed = isAllowed(current, page.url);
      const next = { ...advance(current, verdict, page.url, now(), { judged: !allowed }), lastCheckAt: now() };
      const hostname = new URL(page.url).hostname;
      if (verdict === 'on' && page.title && !allowed && !(next.onHosts ?? []).includes(hostname)) {
        next.onHosts = [...(next.onHosts ?? []), hostname];
      }
      await setSession(next);
      return {
        active: true,
        verdict,
        intent: next.intent,
        nudgeAt: nudgeAt(next),
        backUrl: next.lastOnTaskUrl,
        // Lets the page tell one off-task stretch from the next, so it nudges once per stretch.
        offSince: next.offSince,
        driftMinutes: next.driftMinutes,
      };
    });
  }

  const update = (change) =>
    locked(async () => {
      const session = await getSession();
      if (session) await setSession({ ...session, ...change(session) });
      return {};
    });

  const handlers = {
    check,
    allow: ({ url }) =>
      update((s) => ({ allowHosts: [...s.allowHosts, siteOf(new URL(url).hostname)], offSince: null })),
    snooze: () => update(() => ({ snoozeUntil: now() + 5 * 60_000 })),
    disallow: ({ host }) => update((s) => disallow(s, host)),
    continue: () => update(() => ({ confirmedAt: now(), lastCheckAt: now() })),
    sweep,
    excluded: async ({ host }) => ({ excluded: isExcluded(host, (await storage.get('excludedHosts')) ?? []) }),
    // A page asks this before reading anything of itself, so nothing is built without a session.
    'session?': async () => ({ active: Boolean(await getSession()) }),
    start,
    end,
  };

  return {
    /** Browser start: a session left over from before is only kept if it would still be live. */
    async startup() {
      await sweep();
    },

    /**
     * Answers one runtime message, or returns null for a type it does not know.
     * Failures become `{ error }` replies with a message safe to show.
     *
     * @param {any} message
     * @returns {Promise<object> | null}
     */
    handle(message) {
      const handler = handlers[message?.type];
      if (!handler) return null;
      return handler(message).catch((error) => ({
        error: error instanceof JevError ? error.message : GENERIC_ERROR,
      }));
    },
  };
}
