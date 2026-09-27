/** Popup: starts and ends a focus session. The key lives on the settings page. */

import { driftLine, formatElapsed, newSession } from '../lib/guard.js';

const $ = (id) => document.getElementById(id);
const setup = $('setup');
const startForm = $('start-form');
const active = $('active');
const intentInput = $('intent');
const count = $('count');

/** The counter stays out of the way until the task gets long. */
const COUNT_FROM = 160;

const { apiKey = '', session = null } = await chrome.storage.local.get(['apiKey', 'session']);
let current = session;
render(current);

// Pages report in while the popup is open: follow the session, and tick the clock.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.session) return;
  const wasActive = Boolean(current);
  current = changes.session.newValue ?? null;
  if (current || wasActive) render(current);
});
setInterval(() => current && render(current), 15_000);

const openSettings = () => chrome.runtime.openOptionsPage();
$('settings').addEventListener('click', openSettings);
$('connect').addEventListener('click', openSettings);

// A task is one line: Enter starts the session, pasted newlines become spaces.
intentInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    startForm.requestSubmit();
  }
});
intentInput.addEventListener('input', () => {
  if (intentInput.value.includes('\n')) intentInput.value = intentInput.value.replace(/\n/g, ' ');
  const n = intentInput.value.length;
  count.textContent = n < COUNT_FROM ? '' : n >= 200 ? '200 / 200 · limit' : `${n} / 200`;
  count.classList.toggle('at-limit', n >= 200);
});

startForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const intent = intentInput.value.replace(/\s+/g, ' ').trim();
  if (!intent) return intentInput.focus();
  const next = newSession(intent, Number(startForm.elements.drift.value));
  await chrome.storage.local.set({ session: next });
  current = next;
  render(next);
  await recheckActiveTab();
});

$('end').addEventListener('click', async () => {
  await chrome.storage.local.remove('session');
  intentInput.value = '';
  count.textContent = '';
  current = null;
  render(null);
  await recheckActiveTab();
});

function render(session) {
  setup.hidden = Boolean(apiKey);
  startForm.hidden = !apiKey || Boolean(session);
  active.hidden = !apiKey || !session;
  $('section').textContent = !apiKey ? 'Setup' : session ? 'In session' : 'New session';
  if (!startForm.hidden) intentInput.focus();
  if (active.hidden) return;

  const task = $('active-intent');
  task.textContent = session.intent;
  // Shorter tasks read larger: 25px up to 48 characters, 20px up to 120, then 17px.
  task.classList.toggle('medium', session.intent.length > 48 && session.intent.length <= 120);
  task.classList.toggle('small', session.intent.length > 120);

  const now = Date.now();
  const since = new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const elapsed = formatElapsed(now - session.startedAt);
  $('elapsed-value').textContent = elapsed.value;
  $('elapsed-unit').textContent = elapsed.unit;
  $('elapsed').setAttribute('aria-label', `${elapsed.value} ${elapsed.unit === 'hr' ? 'hours' : 'minutes'} in session`);

  const drift = driftLine(session, now);
  $('drift-line').hidden = !drift;
  if (drift) {
    $('drift-text').textContent = drift.text;
    $('drift-detail').textContent = `· ${drift.detail}`;
  }

  const sites = session.allowHosts.length;
  const allowed = sites ? ` · ${sites} site${sites === 1 ? '' : 's'} allowed` : '';
  $('active-meta').textContent = `Since ${since} · nudge after ${session.driftMinutes} min${allowed}`;

  $('allowed').hidden = !sites;
  $('allowed-list').replaceChildren(...session.allowHosts.map(allowedRow));
}

/** One allowed site with a way to stop allowing it; the service worker owns session writes. */
function allowedRow(host) {
  const row = document.createElement('li');
  const name = Object.assign(document.createElement('code'), { textContent: host, title: host });
  const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn-icon' });
  remove.setAttribute('aria-label', `Stop allowing ${host}`);
  remove.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  remove.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'disallow', host });
    await recheckActiveTab();
  });
  row.append(name, remove);
  return row;
}

/** Tells the visible page to re-check now instead of on its next navigation. */
async function recheckActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: 'recheck' }).catch(() => {}); // no content script on chrome:// pages
}
