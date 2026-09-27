/** Popup: starts and ends a focus session, and saves the API key. */

import { createJevClient } from '../lib/jev.js';
import { newSession } from '../lib/guard.js';

const startForm = document.getElementById('start-form');
const active = document.getElementById('active');
const intentInput = document.getElementById('intent');
const keyInput = document.getElementById('api-key');
const status = document.getElementById('key-status');

const { apiKey = '', session = null } = await chrome.storage.local.get(['apiKey', 'session']);
keyInput.value = apiKey;
render(session);
(apiKey ? intentInput : keyInput).focus();

startForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const next = newSession(intentInput.value.trim(), Number(document.getElementById('drift').value));
  await chrome.storage.local.set({ session: next });
  render(next);
  await recheckActiveTab();
});

document.getElementById('end').addEventListener('click', async () => {
  await chrome.storage.local.remove('session');
  render(null);
  await recheckActiveTab();
});

function render(session) {
  startForm.hidden = Boolean(session);
  active.hidden = !session;
  if (!session) return;
  document.getElementById('active-intent').textContent = session.intent;
  const since = new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const allowed = session.allowHosts.length ? ` · ${session.allowHosts.length} site(s) allowed` : '';
  document.getElementById('active-meta').textContent =
    `Since ${since} · nudge after ${session.driftMinutes} min${allowed}`;
}

/** Tells the visible page to re-check now instead of on its next navigation. */
async function recheckActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'recheck' }).catch(() => {}); // no content script on chrome:// pages
}

document.getElementById('key-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const key = keyInput.value.trim();
  await chrome.storage.local.set({ apiKey: key });
  setStatus('Checking key…');
  try {
    const jev = createJevClient({ getKey: () => key });
    await jev.evaluate({
      state: 'ping',
      questions: { ok: { type: 'boolean', instructions: 'Is this a test message?' } },
    });
    setStatus('Key saved and working.', 'ok');
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

function setStatus(text, tone) {
  status.textContent = text;
  status.className = tone ? `hint status-${tone}` : 'hint';
}
