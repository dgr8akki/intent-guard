import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createJudge, newSession } from '../src/lib/guard.js';
import { JevError } from '../src/lib/jev.js';
import { GENERIC_ERROR, createService } from '../src/lib/service.js';
import { fakeJev, relevance } from './helpers.js';

/** chrome.storage.local, one key at a time, in memory. */
export function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: async (key) => data.get(key),
    set: async (items) => {
      for (const [key, value] of Object.entries(items)) data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

const page = { url: 'https://www.youtube.com/shorts', title: 'Shorts', text: 'cats' };

function setup({
  session = newSession('Book flights', 2, 1000),
  answer = () => relevance(0, 0, 0, 1),
  data = {},
} = {}) {
  const jev = fakeJev(answer);
  const storage = fakeStorage({ ...(session ? { session } : {}), ...data });
  const logged = [];
  const badges = [];
  let injected = 0;
  const service = createService({
    storage,
    judge: createJudge({ jev }),
    now: () => 5000,
    log: (...args) => logged.push(args),
    badge: (text) => badges.push(text),
    inject: async () => {
      injected += 1;
    },
  });
  return { jev, storage, service, logged, badges, injections: () => injected };
}

describe('service: check', () => {
  it('judges the page and moves the session on', async () => {
    const { jev, storage, service } = setup({ answer: () => relevance(0.9, 0.1, 0, 0) });
    const reply = await service.handle({ type: 'check', page });
    assert.equal(jev.calls.length, 1);
    assert.equal(reply.verdict, 'off');
    assert.equal(reply.active, true);
    assert.equal(reply.nudgeAt, 5000 + 2 * 60_000);
    assert.equal(reply.offSince, 5000);
    assert.equal(reply.driftMinutes, 2);
    assert.equal(storage.data.get('session').offSince, 5000);
  });

  it('sends nothing and replies inactive when no session is running', async () => {
    const { jev, service } = setup({ session: null });
    assert.deepEqual(await service.handle({ type: 'check', page }), { active: false });
    assert.equal(jev.calls.length, 0);
  });

  it('does not ask the provider about a page that sent no title or text, and leaves the clock alone', async () => {
    const session = { ...newSession('Book flights', 2, 1000), offSince: 2000 };
    const { jev, storage, service } = setup({ session });
    const reply = await service.handle({
      type: 'check',
      page: { url: 'https://mail.google.com', title: '', text: '' },
    });
    assert.equal(jev.calls.length, 0);
    assert.equal(reply.verdict, 'unclear');
    assert.equal(reply.active, true);
    assert.equal(storage.data.get('session').offSince, 2000);
  });

  it('counts an allowed host as on task without asking', async () => {
    const { jev, service } = setup({
      session: { ...newSession('Book flights', 2, 1000), allowHosts: ['www.youtube.com'] },
    });
    assert.equal((await service.handle({ type: 'check', page })).verdict, 'on');
    assert.equal(jev.calls.length, 0);
  });

  it('drops the result when the session ended or restarted while judging', async () => {
    const { storage, service } = setup({
      answer: () => {
        storage.data.delete('session');
        return relevance(0.9, 0.1, 0, 0);
      },
    });
    assert.deepEqual(await service.handle({ type: 'check', page }), { active: false });
  });

  it('replies with the provider message on a Jev failure and a generic one otherwise', async () => {
    const jevDown = setup({
      answer: () => {
        throw new JevError('Jev is busy.', { status: 429 });
      },
    });
    assert.deepEqual(await jevDown.service.handle({ type: 'check', page }), { error: 'Jev is busy.' });
    const broken = setup({
      answer: () => {
        throw new TypeError('boom');
      },
    });
    const reply = await broken.service.handle({ type: 'check', page });
    assert.equal(reply.error, GENERIC_ERROR);
    assert.equal(GENERIC_ERROR, "Couldn't check this page. It'll try again on your next page.");
  });

  it('ignores messages it does not know', () => {
    const { service } = setup();
    assert.equal(service.handle({ type: 'dance' }), null);
    assert.equal(service.handle(undefined), null);
  });
});

describe('service: where "Back to task" goes', () => {
  it('points at the last page the model put on task, never an allow-listed one', async () => {
    const answers = { 'https://flights.example/search': relevance(0, 0, 0.2, 0.8) };
    const { storage, service } = setup({
      session: { ...newSession('Book flights', 2, 1000), allowHosts: [] },
      answer: (body) => answers[/URL: (\S+)/.exec(body.state)[1]] ?? relevance(0.9, 0.1, 0, 0),
    });
    await service.handle({
      type: 'check',
      page: { url: 'https://flights.example/search', title: 'Flights', text: 'x' },
    });
    await service.handle({ type: 'check', page }); // youtube: off
    await service.handle({ type: 'allow', url: 'https://www.youtube.com/watch?v=1' });
    await service.handle({ type: 'check', page }); // allowed now
    assert.equal(storage.data.get('session').lastOnTaskUrl, 'https://flights.example/search');
    await service.handle({ type: 'disallow', host: 'youtube.com' });
    const reply = await service.handle({ type: 'check', page });
    assert.equal(reply.verdict, 'off');
    assert.equal(reply.backUrl, 'https://flights.example/search', 'not the page being nudged about');
  });
});

describe('service: hosts already judged on task', () => {
  it('does not ask again about a host the model already put on task this session', async () => {
    const { jev, storage, service } = setup({ answer: () => relevance(0, 0, 0.3, 0.7) });
    await service.handle({ type: 'check', page: { url: 'https://docs.example/a', title: 'A', text: 'a' } });
    assert.deepEqual(storage.data.get('session').onHosts, ['docs.example']);
    const reply = await service.handle({
      type: 'check',
      page: { url: 'https://docs.example/b', title: 'B', text: 'b' },
    });
    assert.equal(reply.verdict, 'on');
    assert.equal(jev.calls.length, 1);
    assert.equal(storage.data.get('session').lastOnTaskUrl, 'https://docs.example/b');
  });

  it('keeps asking about hosts that were off task or unclear', async () => {
    const { jev, storage, service } = setup({ answer: () => relevance(0.8, 0.1, 0.1, 0) });
    await service.handle({ type: 'check', page });
    await service.handle({ type: 'check', page: { ...page, url: 'https://www.youtube.com/watch' } });
    assert.equal(jev.calls.length, 2);
    assert.deepEqual(storage.data.get('session').onHosts, []);
  });
});

describe('service: session edits', () => {
  it('allows a site, snoozes and stops allowing', async () => {
    const { storage, service } = setup({ session: { ...newSession('Book flights', 2, 1000), offSince: 2000 } });
    await service.handle({ type: 'allow', url: 'https://www.youtube.com/watch?v=1&t=2' });
    assert.deepEqual(
      storage.data.get('session').allowHosts,
      ['youtube.com'],
      'the whole site, from a URL with a query',
    );
    assert.equal(storage.data.get('session').offSince, null);
    await service.handle({ type: 'snooze' });
    assert.equal(storage.data.get('session').snoozeUntil, 5000 + 5 * 60_000);
    await service.handle({ type: 'disallow', host: 'youtube.com' });
    assert.deepEqual(storage.data.get('session').allowHosts, []);
  });
});

describe('service: start', () => {
  it('stores the session, then puts the content script into tabs that are already open', async () => {
    const { storage, service, injections } = setup({ session: null });
    const session = newSession('Write report', 5, 5000);
    assert.deepEqual(await service.handle({ type: 'start', session }), {});
    assert.deepEqual(storage.data.get('session'), session);
    assert.equal(injections(), 1);
  });

  it('still starts when injection fails', async () => {
    const storage = fakeStorage();
    const service = createService({
      storage,
      judge: createJudge({ jev: fakeJev(() => relevance(0, 0, 0, 1)) }),
      inject: async () => {
        throw new Error('no tabs');
      },
      log: () => {},
    });
    assert.deepEqual(await service.handle({ type: 'start', session: newSession('x', 2, 1) }), {});
    assert.ok(storage.data.get('session'));
  });
});

describe('service: session?', () => {
  it('says whether a session runs so a page can decide before reading itself', async () => {
    assert.deepEqual(await setup().service.handle({ type: 'session?' }), { active: true });
    assert.deepEqual(await setup({ session: null }).service.handle({ type: 'session?' }), { active: false });
  });
});

describe('service: excluded', () => {
  it('excludes the built-in list', async () => {
    const { service } = setup();
    assert.deepEqual(await service.handle({ type: 'excluded', host: 'mail.google.com' }), { excluded: true });
    assert.deepEqual(await service.handle({ type: 'excluded', host: 'www.youtube.com' }), { excluded: false });
  });

  it('excludes hosts the user listed', async () => {
    const { service } = setup({ data: { excludedHosts: ['example.com'] } });
    assert.deepEqual(await service.handle({ type: 'excluded', host: 'app.example.com' }), { excluded: true });
    assert.deepEqual(await service.handle({ type: 'excluded', host: 'github.com' }), { excluded: false });
  });

  it('answers with no session running too, so a page can decide before it sends anything', async () => {
    const { service } = setup({ session: null });
    assert.deepEqual(await service.handle({ type: 'excluded', host: 'www.paypal.com' }), { excluded: true });
  });
});

describe('service: provider failures are visible', () => {
  const failing = (status) => () => {
    throw new JevError(status === 429 ? 'Jev is busy.' : 'Your API key was rejected. Check it in settings.', {
      status,
    });
  };

  it('records the failure, marks the badge and logs it', async () => {
    const { storage, service, logged, badges } = setup({ answer: failing(401) });
    await service.handle({ type: 'check', page });
    assert.deepEqual(storage.data.get('lastError'), {
      message: 'Your API key was rejected. Check it in settings.',
      status: 401,
      at: 5000,
    });
    assert.deepEqual(badges, ['!']);
    assert.equal(logged.length, 1);
    assert.match(String(logged[0][0]), /check failed/i);
  });

  it('stores a safe message and no status for a failure that is not a JevError', async () => {
    const { storage, service, logged } = setup({
      answer: () => {
        throw new TypeError('boom');
      },
    });
    await service.handle({ type: 'check', page });
    assert.deepEqual(storage.data.get('lastError'), { message: GENERIC_ERROR, status: null, at: 5000 });
    assert.equal(logged.length, 1);
  });

  it('clears the failure on the next successful judgement', async () => {
    let fail = true;
    const { storage, service, badges } = setup({
      answer: () => {
        if (fail) throw new JevError('Jev is busy.', { status: 429 });
        return relevance(0, 0, 0, 1);
      },
    });
    await service.handle({ type: 'check', page });
    assert.ok(storage.data.get('lastError'));
    fail = false;
    await service.handle({ type: 'check', page: { ...page, url: 'https://docs.example/a' } });
    assert.equal(storage.data.get('lastError'), undefined);
    assert.deepEqual(badges, ['!', '']);
  });

  it('does not clear a failure on a page that never reached the provider', async () => {
    const { storage, service } = setup({ answer: failing(429) });
    await service.handle({ type: 'check', page });
    await service.handle({ type: 'check', page: { url: 'https://mail.google.com', title: '', text: '' } });
    assert.ok(storage.data.get('lastError'), 'an excluded page says nothing about the provider');
  });

  it('clears a failure left over from before a restart', async () => {
    const { storage, service, badges } = setup({ data: { lastError: { message: 'old', status: 500, at: 1 } } });
    await service.handle({ type: 'check', page });
    assert.equal(storage.data.get('lastError'), undefined);
    assert.deepEqual(badges, ['']);
  });

  it('ends the session and clears the failure and badge on "end"', async () => {
    const { storage, service, badges } = setup({ data: { lastError: { message: 'x', status: 401, at: 1 } } });
    assert.deepEqual(await service.handle({ type: 'end' }), {});
    assert.equal(storage.data.get('session'), undefined);
    assert.equal(storage.data.get('lastError'), undefined);
    assert.deepEqual(badges, ['']);
  });
});

describe('service: stale sessions', () => {
  const HOUR = 3_600_000;

  it('stamps lastCheckAt on every check, including pages the provider never sees', async () => {
    const { storage, service } = setup();
    await service.handle({ type: 'check', page: { url: 'https://mail.google.com', title: '', text: '' } });
    assert.equal(storage.data.get('session').lastCheckAt, 5000);
  });

  it('ends a session idle for over 90 minutes instead of judging for it', async () => {
    const session = { ...newSession('Book flights', 2, 1000), lastCheckAt: 5000 - 91 * 60_000 };
    const { jev, storage, service } = setup({ session });
    assert.deepEqual(await service.handle({ type: 'check', page }), { active: false });
    assert.equal(jev.calls.length, 0);
    assert.equal(storage.data.get('session'), undefined);
  });

  it('ends a session older than 8 hours even when it was checked a moment ago', async () => {
    const session = { ...newSession('Book flights', 2, 5000 - 9 * HOUR), lastCheckAt: 4000 };
    const { jev, storage, service } = setup({ session });
    assert.deepEqual(await service.handle({ type: 'check', page }), { active: false });
    assert.equal(jev.calls.length, 0);
    assert.equal(storage.data.get('session'), undefined);
  });

  it('cleans up an expired session when the browser starts, and leaves a live one alone', async () => {
    const old = setup({ session: { ...newSession('Book flights', 2, 5000 - 9 * HOUR), lastCheckAt: 4999 } });
    await old.service.startup();
    assert.equal(old.storage.data.get('session'), undefined);

    const live = setup({ session: { ...newSession('Book flights', 2, 4000), lastCheckAt: 4500 } });
    await live.service.startup();
    assert.ok(live.storage.data.get('session'));

    const none = setup({ session: null });
    await none.service.startup(); // nothing to do, nothing thrown
  });

  it('lets the popup sweep an expired session away and reports whether it did', async () => {
    const stale = setup({ session: { ...newSession('Book flights', 2, 1000), lastCheckAt: 5000 - 2 * HOUR } });
    assert.deepEqual(await stale.service.handle({ type: 'sweep' }), { ended: true });
    assert.equal(stale.storage.data.get('session'), undefined);
    const fresh = setup();
    assert.deepEqual(await fresh.service.handle({ type: 'sweep' }), { ended: false });
  });

  it('records that the user is still on it', async () => {
    const { storage, service } = setup({ session: { ...newSession('Book flights', 2, 1000), lastCheckAt: 1000 } });
    await service.handle({ type: 'continue' });
    assert.equal(storage.data.get('session').confirmedAt, 5000);
    assert.equal(storage.data.get('session').lastCheckAt, 5000);
  });
});

describe('service: locking and routing', () => {
  it('serialises concurrent checks so no session write is lost', async () => {
    // The judge answers one page at a time, so hold the first request and let the other messages queue
    // on the session lock behind it; every write must survive once the gate opens.
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const jev = fakeJev(async (body) => {
      if (/URL: https:\/\/slow\.example/.test(body.state)) await gate;
      return /URL: https:\/\/slow\.example/.test(body.state) ? relevance(0.9, 0.1, 0, 0) : relevance(0, 0, 0, 1);
    });
    const storage = fakeStorage({ session: newSession('Book flights', 2, 1000) });
    const service = createService({ storage, judge: createJudge({ jev }), now: () => 5000, log: () => {} });
    const slow = service.handle({ type: 'check', page: { url: 'https://slow.example/a', title: 'Slow', text: 's' } });
    const fast = service.handle({ type: 'check', page: { url: 'https://fast.example/b', title: 'Fast', text: 'f' } });
    const allow = service.handle({ type: 'allow', url: 'https://www.youtube.com/watch?v=1' });
    await allow; // an edit does not wait for the judge
    assert.deepEqual(storage.data.get('session').allowHosts, ['youtube.com']);
    release();
    await Promise.all([slow, fast]);
    const session = storage.data.get('session');
    assert.deepEqual(session.allowHosts, ['youtube.com'], 'the allow survived both checks');
    assert.equal(session.lastOnTaskUrl, 'https://fast.example/b');
    assert.deepEqual(session.onHosts, ['fast.example']);
    assert.equal(session.offSince, null, 'fast (on) was written after slow (off), in queue order');
  });

  it('applies read-modify-write in order when two edits race', async () => {
    const { storage, service } = setup();
    await Promise.all([
      service.handle({ type: 'allow', url: 'https://a.example/' }),
      service.handle({ type: 'allow', url: 'https://b.example/' }),
      service.handle({ type: 'snooze' }),
    ]);
    const session = storage.data.get('session');
    assert.deepEqual(session.allowHosts, ['a.example', 'b.example']);
    assert.equal(session.snoozeUntil, 5000 + 5 * 60_000);
  });

  it('answers the documented reply for a JevError and for an unexpected error', async () => {
    const busy = setup({
      answer: () => {
        throw new JevError('Jev is busy. Trying again in 30 s.', { status: 429 });
      },
    });
    assert.deepEqual(await busy.service.handle({ type: 'check', page }), {
      error: 'Jev is busy. Trying again in 30 s.',
    });
    const broken = setup({
      answer: () => {
        throw new RangeError('out of range');
      },
    });
    assert.deepEqual(await broken.service.handle({ type: 'check', page }), { error: GENERIC_ERROR });
  });
});
