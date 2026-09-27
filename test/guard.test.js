import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TEXT_LIMIT,
  advance,
  createJudge,
  describePage,
  disallow,
  driftLine,
  formatElapsed,
  isAllowed,
  newSession,
  nudgeAt,
  toVerdict,
} from '../src/lib/guard.js';
import { fakeJev, relevance } from './helpers.js';

const page = { url: 'https://www.youtube.com/shorts', title: 'Shorts', text: 'cats' };

describe('toVerdict', () => {
  it('sums each side of the scale', () => {
    assert.equal(toVerdict(relevance(0, 0.1, 0.45, 0.45)).verdict, 'on');
    assert.equal(toVerdict(relevance(0.35, 0.35, 0.2, 0.1)).verdict, 'off');
    assert.equal(toVerdict(relevance(0.25, 0.25, 0.25, 0.25)).verdict, 'unclear');
  });
});

describe('describePage', () => {
  it('puts the task first and caps the page text', () => {
    const state = describePage('Book flights', { ...page, text: 'x'.repeat(5000) });
    assert.match(state, /^User's task: Book flights\n/);
    assert.ok(state.endsWith(`Page text: ${'x'.repeat(TEXT_LIMIT)}`));
  });
});

describe('drift clock', () => {
  const start = newSession('Book flights', 2, 0);

  it('starts on the first off-task page and keeps that start', () => {
    const s1 = advance(start, 'off', page.url, 1000);
    const s2 = advance(s1, 'off', page.url, 50_000);
    assert.equal(s2.offSince, 1000);
    assert.equal(nudgeAt(s2), 1000 + 2 * 60_000);
  });

  it('resets on task and remembers where the task was', () => {
    const s = advance(advance(start, 'off', page.url, 1000), 'on', 'https://flights.example/', 2000);
    assert.equal(s.offSince, null);
    assert.equal(s.lastOnTaskUrl, 'https://flights.example/');
    assert.equal(nudgeAt(s), null);
  });

  it('ignores unclear pages', () => {
    const off = advance(start, 'off', page.url, 1000);
    assert.equal(advance(off, 'unclear', page.url, 9000), off);
    assert.equal(advance(start, 'unclear', page.url, 9000), start);
  });

  it('respects a snooze', () => {
    const s = { ...advance(start, 'off', page.url, 0), snoozeUntil: 10 * 60_000 };
    assert.equal(nudgeAt(s), 10 * 60_000);
  });

  it('matches allowed sites by host', () => {
    const s = { ...start, allowHosts: ['www.youtube.com'] };
    assert.ok(isAllowed(s, 'https://www.youtube.com/watch'));
    assert.ok(!isAllowed(s, 'https://youtube.com/watch'));
  });
});

describe('createJudge', () => {
  it('asks once per task and page', async () => {
    const jev = fakeJev(() => relevance(0.9, 0.1, 0, 0));
    const judge = createJudge({ jev });
    assert.equal((await judge.judge('Book flights', page)).verdict, 'off');
    await judge.judge('Book flights', page);
    await judge.judge('Write report', page);
    assert.equal(jev.calls.length, 2);
  });

  it('evicts the oldest entry past the cap', async () => {
    const jev = fakeJev(() => relevance(0, 0, 0, 1));
    const judge = createJudge({ jev, max: 1 });
    await judge.judge('a', page);
    await judge.judge('b', page);
    await judge.judge('a', page);
    assert.equal(jev.calls.length, 3);
  });

  it('keeps going after a failure', async () => {
    let fail = true;
    const judge = createJudge({
      jev: fakeJev(() => {
        if (fail) throw new Error('boom');
        return relevance(0, 0, 0, 1);
      }),
    });
    await assert.rejects(judge.judge('a', page), /boom/);
    fail = false;
    assert.equal((await judge.judge('a', page)).verdict, 'on');
  });
});

describe('popup session details', () => {
  const start = newSession('Book flights', 2, 0);

  it('formats time in session', () => {
    assert.deepEqual(formatElapsed(30_000), { value: '<1', unit: 'min' });
    assert.deepEqual(formatElapsed(42 * 60_000), { value: '42', unit: 'min' });
    assert.deepEqual(formatElapsed(65 * 60_000), { value: '1:05', unit: 'hr' });
    assert.deepEqual(formatElapsed(-5), { value: '<1', unit: 'min' });
  });

  it('describes drift only while off task', () => {
    assert.equal(driftLine(start, 10_000), null);
    const off = { ...start, offSince: 0 };
    assert.deepEqual(driftLine(off, 20_000), { text: 'Off task for under a minute', detail: 'nudge in 2 min' });
    assert.deepEqual(driftLine(off, 70_000), { text: 'Off task for 1 min', detail: 'nudge in 1 min' });
    assert.deepEqual(driftLine(off, 3 * 60_000), { text: 'Off task for 3 min', detail: 'nudge due' });
    assert.deepEqual(driftLine({ ...off, snoozeUntil: 7 * 60_000 }, 3 * 60_000), {
      text: 'Off task for 3 min',
      detail: 'snoozed for 4 more min',
    });
  });

  it('stops allowing one site', () => {
    const s = { ...start, allowHosts: ['a.com', 'b.com'] };
    assert.deepEqual(disallow(s, 'a.com').allowHosts, ['b.com']);
    assert.deepEqual(s.allowHosts, ['a.com', 'b.com'], 'does not mutate');
  });
});
