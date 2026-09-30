import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { newSession } from '../src/lib/guard.js';
import { fakeChrome, loadPage } from './page.js';

const session = newSession('Book flights', 2, Date.now() - 60_000);
const youtube = [{ id: 7, url: 'https://www.youtube.com/watch?v=abc' }];

const popup = (chrome) => loadPage('../src/popup/popup.html', '../src/popup/popup.js', chrome);

describe('popup: never send this site', () => {
  it('offers "Don’t judge this site" for the current tab and saves its host', async () => {
    const chrome = fakeChrome({ local: { apiKey: 'vck_x', session }, tabs: youtube });
    const { document, tick, restore } = await popup(chrome);
    const skip = document.getElementById('skip');
    assert.equal(skip.hidden, false);
    assert.match(skip.getAttribute('aria-label'), /www\.youtube\.com/);
    skip.click();
    await tick();
    assert.deepEqual(chrome.data.get('excludedHosts'), ['www.youtube.com']);
    assert.equal(skip.hidden, true, 'the button goes once the site is on the list');
    assert.match(document.getElementById('skip-note').textContent, /www\.youtube\.com/);
    assert.ok(chrome.tabMessages.some((m) => m.id === 7 && m.message.type === 'recheck'));
    restore();
  });

  it('shows a note instead of the button on a site that is already excluded', async () => {
    const chrome = fakeChrome({
      local: { apiKey: 'vck_x', session },
      tabs: [{ id: 1, url: 'https://mail.google.com/mail/' }],
    });
    const { document, restore } = await popup(chrome);
    assert.equal(document.getElementById('skip').hidden, true);
    const note = document.getElementById('skip-note');
    assert.equal(note.hidden, false);
    assert.match(note.textContent, /mail\.google\.com/);
    restore();
  });

  it('offers nothing on pages the extension cannot run on', async () => {
    const chrome = fakeChrome({ local: { apiKey: 'vck_x', session }, tabs: [{ id: 1, url: 'chrome://extensions/' }] });
    const { document, restore } = await popup(chrome);
    assert.equal(document.getElementById('skip').hidden, true);
    assert.equal(document.getElementById('skip-note').hidden, true);
    restore();
  });

  it('opens the list in settings from the note', async () => {
    const chrome = fakeChrome({
      local: { apiKey: 'vck_x', session },
      tabs: [{ id: 1, url: 'https://mail.google.com/' }],
    });
    const { document, tick, restore } = await popup(chrome);
    document.getElementById('skip-edit').click();
    await tick();
    assert.deepEqual(chrome.opened, ['chrome-extension://intent-guard/options/options.html#exclusions']);
    restore();
  });
});

describe('popup: consent line at Start', () => {
  const ready = (extra = {}) => fakeChrome({ local: { apiKey: 'vck_x', ...extra }, tabs: youtube });

  it('tells a first-time user what leaves the browser, naming the provider host', async () => {
    const { document, restore } = await popup(ready());
    const consent = document.getElementById('consent');
    assert.equal(consent.hidden, false);
    assert.match(consent.textContent, /title and first lines go to ai-gateway\.vercel\.sh/);
    assert.match(consent.textContent, /Never on: banking, health, mail/);
    restore();
  });

  it('names the TypeSafe host when that is the provider', async () => {
    const { document, restore } = await popup(ready({ provider: 'typesafe' }));
    assert.match(document.getElementById('consent').textContent, /go to api\.typesafe\.ai/);
    restore();
  });

  it('opens the exclusion list from "edit list"', async () => {
    const chrome = ready();
    const { document, tick, restore } = await popup(chrome);
    document.getElementById('consent-edit').click();
    await tick();
    assert.deepEqual(chrome.opened, ['chrome-extension://intent-guard/options/options.html#exclusions']);
    restore();
  });

  it('goes away for good once acknowledged', async () => {
    const chrome = ready();
    const { document, tick, restore } = await popup(chrome);
    document.getElementById('consent-ok').click();
    await tick();
    assert.equal(document.getElementById('consent').hidden, true);
    assert.equal(typeof chrome.data.get('consentAcknowledgedAt'), 'number');
    restore();

    const again = await popup(fakeChrome({ local: { apiKey: 'vck_x', consentAcknowledgedAt: 1 }, tabs: youtube }));
    assert.equal(again.document.getElementById('consent').hidden, true);
    again.restore();
  });

  it('counts the first Start as acknowledgement', async () => {
    const chrome = ready();
    const { window, document, tick, restore } = await popup(chrome);
    document.getElementById('intent').value = 'Book flights';
    document.getElementById('start-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await tick();
    const start = chrome.sent.find((m) => m.type === 'start');
    assert.equal(start?.session.intent, 'Book flights', 'the worker starts the session so it can reach open tabs');
    assert.equal(start.session.driftMinutes, 2);
    assert.equal(document.getElementById('active').hidden, false);
    assert.equal(typeof chrome.data.get('consentAcknowledgedAt'), 'number');
    restore();
  });
});

describe('popup: provider failures', () => {
  const withError = (lastError) => fakeChrome({ local: { apiKey: 'vck_x', session, lastError }, tabs: youtube });

  it('shows nothing while checks succeed', async () => {
    const { document, restore } = await popup(fakeChrome({ local: { apiKey: 'vck_x', session }, tabs: youtube }));
    assert.equal(document.getElementById('error-line').hidden, true);
    restore();
  });

  it('says the key stopped working and links to settings', async () => {
    const chrome = withError({ message: 'Your API key was rejected. Check it in settings.', status: 401, at: 1 });
    const { document, tick, restore } = await popup(chrome);
    const line = document.getElementById('error-line');
    assert.equal(line.hidden, false);
    assert.match(line.textContent, /Your Jev key stopped working\./);
    assert.ok(line.classList.contains('tone-auth'));
    const link = document.getElementById('error-action');
    assert.equal(link.textContent, 'Fix in settings');
    link.click();
    await tick();
    assert.deepEqual(chrome.opened, ['options']);
    restore();
  });

  it('plays down a busy provider', async () => {
    const { document, restore } = await popup(withError({ message: 'Jev is busy.', status: 429, at: 1 }));
    const line = document.getElementById('error-line');
    assert.match(line.textContent, /Jev is busy; pages are re-checked as you go\./);
    assert.ok(line.classList.contains('tone-busy'));
    restore();
  });

  it('shows other failures in their own words', async () => {
    const message = "Can't reach ai-gateway.vercel.sh. Check your connection and try again.";
    const { document, restore } = await popup(withError({ message, status: 0, at: 1 }));
    assert.match(document.getElementById('error-line').textContent, /Can't reach ai-gateway\.vercel\.sh/);
    restore();
  });

  it('follows the failure as it appears and clears while open', async () => {
    const chrome = fakeChrome({ local: { apiKey: 'vck_x', session }, tabs: youtube });
    const { document, tick, restore } = await popup(chrome);
    await chrome.storage.local.set({ lastError: { message: 'Jev is busy.', status: 429, at: 1 } });
    await tick();
    assert.equal(document.getElementById('error-line').hidden, false);
    await chrome.storage.local.remove('lastError');
    await tick();
    assert.equal(document.getElementById('error-line').hidden, true);
    restore();
  });

  it('ends the session through the service worker so it can clear the badge', async () => {
    const chrome = fakeChrome({ local: { apiKey: 'vck_x', session }, tabs: youtube });
    const { document, tick, restore } = await popup(chrome);
    document.getElementById('end').click();
    await tick();
    assert.deepEqual(chrome.sent.at(-1), { type: 'end' });
    assert.equal(document.getElementById('active').hidden, true);
    restore();
  });
});

describe('popup: stale sessions', () => {
  const HOUR = 3_600_000;
  const active = (extra) =>
    fakeChrome({ local: { apiKey: 'vck_x', session: { ...session, ...extra } }, tabs: youtube });

  it('asks the worker to sweep an expired session as soon as it opens', async () => {
    const chrome = fakeChrome({ local: { apiKey: 'vck_x' }, tabs: youtube });
    const { restore } = await popup(chrome);
    assert.deepEqual(chrome.sent[0], { type: 'sweep' });
    restore();
  });

  it('leads with "Still working on…?" for a session older than four hours', async () => {
    const { document, restore } = await popup(active({ startedAt: Date.now() - 5 * HOUR }));
    const stale = document.getElementById('stale');
    assert.equal(stale.hidden, false);
    assert.match(stale.textContent, /Still working on “Book flights”\?/);
    assert.equal(document.getElementById('active').firstElementChild, stale, 'it comes first');
    restore();
  });

  it('says nothing of the sort for a fresh session', async () => {
    const { document, restore } = await popup(active({}));
    assert.equal(document.getElementById('stale').hidden, true);
    restore();
  });

  it('Continue tells the worker and drops the question', async () => {
    const chrome = active({ startedAt: Date.now() - 5 * HOUR });
    const { document, tick, restore } = await popup(chrome);
    document.getElementById('continue').click();
    await tick();
    assert.ok(chrome.sent.some((m) => m.type === 'continue'));
    // The worker writes confirmedAt; the popup follows the storage change.
    await chrome.storage.local.set({ session: { ...chrome.data.get('session'), confirmedAt: Date.now() } });
    await tick();
    assert.equal(document.getElementById('stale').hidden, true);
    restore();
  });

  it('End from the question ends the session', async () => {
    const chrome = active({ startedAt: Date.now() - 5 * HOUR });
    const { document, tick, restore } = await popup(chrome);
    document.getElementById('stale-end').click();
    await tick();
    assert.ok(chrome.sent.some((m) => m.type === 'end'));
    assert.equal(document.getElementById('active').hidden, true);
    restore();
  });
});
