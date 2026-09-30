/** Popup: starts and ends a focus session. The key lives on the settings page. */

import { isExcluded } from '../lib/exclusions.js';
import { driftLine, errorLine, formatElapsed, isStale, newSession } from '../lib/guard.js';
import { DEFAULT_PROVIDER, PROVIDERS } from '../lib/jev.js';

const $ = (id) => document.getElementById(id);
const setup = $('setup');
const startForm = $('start-form');
const active = $('active');
const intentInput = $('intent');
const count = $('count');

/** The counter stays out of the way until the task gets long. */
const COUNT_FROM = 160;

// The popup only needs to know that a key exists; the key itself stays on the settings page and in the worker.
const [
  connected,
  { session = null, excludedHosts = [], provider, consentAcknowledgedAt = 0, lastError = null },
  currentHost,
] = await Promise.all([
  chrome.storage.local.get('apiKey').then(({ apiKey }) => Boolean(apiKey)),
  chrome.storage.local.get(['session', 'excludedHosts', 'provider', 'consentAcknowledgedAt', 'lastError']),
  hostOfActiveTab(),
]);
let current = session;
let excluded = excludedHosts;
let failure = lastError;
chrome.runtime.sendMessage({ type: 'sweep' }); // a session that ran out ends now, not on the next page check
let consented = Boolean(consentAcknowledgedAt);
$('consent-host').textContent = (PROVIDERS[provider] ?? PROVIDERS[DEFAULT_PROVIDER]).host;
render(current);

// Pages report in while the popup is open: follow the session, and tick the clock.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.excludedHosts) excluded = changes.excludedHosts.newValue ?? [];
  if (changes.lastError) failure = changes.lastError.newValue ?? null;
  if (!changes.session && !changes.excludedHosts && !changes.lastError) return;
  const wasActive = Boolean(current);
  if (changes.session) current = changes.session.newValue ?? null;
  if (current || wasActive) render(current);
});
setInterval(() => current && renderClock(current), 15_000); // only the clock: rows and focus stay put

const openSettings = () => chrome.runtime.openOptionsPage();
$('settings').addEventListener('click', openSettings);
$('connect').addEventListener('click', openSettings);
$('error-action').addEventListener('click', (event) => {
  event.preventDefault();
  openSettings();
});

// The "never send" list lives on the settings page; the popup only adds the site it is looking at.
const openExclusions = (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#exclusions') });
};
$('skip-edit').addEventListener('click', openExclusions);
$('consent-edit').addEventListener('click', openExclusions);

// Said once, before the first session; starting a session counts as having read it.
async function acknowledge() {
  if (consented) return;
  consented = true;
  $('consent').hidden = true;
  await chrome.storage.local.set({ consentAcknowledgedAt: Date.now() });
}
$('consent-ok').addEventListener('click', acknowledge);
$('skip').addEventListener('click', async () => {
  if (!currentHost || excluded.includes(currentHost)) return;
  await chrome.storage.local.set({ excludedHosts: [...excluded, currentHost] });
  await recheckActiveTab();
});

// A task is one line: Enter starts the session, pasted newlines become spaces.
intentInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    startForm.requestSubmit();
  }
});
intentInput.addEventListener('input', () => {
  if (intentInput.value.includes('\n')) intentInput.value = intentInput.value.replace(/\n/g, ' ');
  // Two rows with resize: none hid the start of a long task; grow with the content instead.
  intentInput.style.height = 'auto';
  intentInput.style.height = `${intentInput.scrollHeight}px`;
  const n = intentInput.value.length;
  count.textContent = n < COUNT_FROM ? '' : n >= 200 ? '200 / 200 · limit' : `${n} / 200`;
  count.classList.toggle('at-limit', n >= 200);
});

startForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const intent = intentInput.value.replace(/\s+/g, ' ').trim();
  if (!intent) return intentInput.focus();
  const next = newSession(intent, Number(startForm.elements.drift.value));
  await acknowledge();
  await chrome.runtime.sendMessage({ type: 'start', session: next }); // the worker also reaches tabs already open
  current = next;
  render(next);
  $('end').focus(); // the Start button just vanished under the keyboard user
  await recheckActiveTab();
});

async function endSession() {
  await chrome.runtime.sendMessage({ type: 'end' }); // the worker also clears the badge and the last failure
  intentInput.value = '';
  count.textContent = '';
  current = null;
  render(null);
  await recheckActiveTab();
}
$('end').addEventListener('click', endSession);
$('stale-end').addEventListener('click', endSession);
$('continue').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'continue' }));

function render(session) {
  setup.hidden = connected;
  startForm.hidden = !connected || Boolean(session);
  active.hidden = !connected || !session;
  $('section').textContent = !connected ? 'Setup' : session ? 'In session' : 'New session';
  $('consent').hidden = consented;
  if (!startForm.hidden) intentInput.focus();
  if (active.hidden) return;

  // Hours in, the task may no longer be the task: ask before judging on.
  $('stale').hidden = !isStale(session, Date.now());
  $('stale-task').textContent = session.intent;

  const task = $('active-intent');
  task.textContent = session.intent;
  // Shorter tasks read larger: 25px up to 48 characters, 20px up to 120, then 17px.
  task.classList.toggle('medium', session.intent.length > 48 && session.intent.length <= 120);
  task.classList.toggle('small', session.intent.length > 120);

  // A failed check stays visible until one succeeds; the nudge itself never fires for failures.
  const problem = errorLine(failure);
  const line = $('error-line');
  line.hidden = !problem;
  line.className = `error-line${problem ? ` tone-${problem.tone}` : ''}`;
  $('error-text').textContent = problem?.text ?? '';
  $('error-action').textContent = problem?.action ?? '';

  renderClock(session);

  // Rows are rebuilt only when the hosts change, so a focused "Stop allowing" button survives the clock tick.
  const list = $('allowed-list');
  const shown = [...list.children].map((row) => row.dataset.host);
  if (shown.join('\n') !== session.allowHosts.join('\n')) list.replaceChildren(...session.allowHosts.map(allowedRow));
  $('allowed').hidden = !session.allowHosts.length;

  const skipped = Boolean(currentHost) && isExcluded(currentHost, excluded);
  $('skip').hidden = !currentHost || skipped;
  $('skip').setAttribute('aria-label', `Don’t judge ${currentHost}`);
  $('skip-note').hidden = !skipped;
  $('skip-host').textContent = currentHost;
}

/** The parts that move with time: elapsed, the drift line and the meta line. Safe to call every tick. */
function renderClock(session) {
  const now = Date.now();
  const since = new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const elapsed = formatElapsed(now - session.startedAt);
  $('elapsed-value').textContent = elapsed.value;
  $('elapsed-unit').textContent = elapsed.unit;
  // "1:05 hr" reads badly aloud; the <time> carries the duration and hidden text spells it out.
  const minutes = Math.max(0, Math.floor((now - session.startedAt) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  $('elapsed-time').setAttribute('datetime', `PT${hours ? `${hours}H` : ''}${rest || !hours ? `${rest}M` : ''}`);
  const spoken = [
    hours && `${hours} hour${hours === 1 ? '' : 's'}`,
    (rest || !hours) && `${rest} minute${rest === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' ');
  $('elapsed-text').textContent = `${spoken} in session`;

  const drift = driftLine(session, now);
  $('drift-line').hidden = !drift;
  if (drift) {
    $('drift-text').textContent = drift.text;
    $('drift-detail').textContent = `· ${drift.detail}`;
  }

  const sites = session.allowHosts.length;
  const allowed = sites ? ` · ${sites} site${sites === 1 ? '' : 's'} allowed` : '';
  $('active-meta').textContent = `Since ${since} · nudge after ${session.driftMinutes} min${allowed}`;
}

/** The host of the tab the popup opened over, or '' for pages the extension can't run on. */
async function hostOfActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab?.url ?? '');
    return /^https?:$/.test(url.protocol) ? url.hostname : '';
  } catch {
    return '';
  }
}

/** One allowed site with a way to stop allowing it; the service worker owns session writes. */
function allowedRow(host) {
  const row = document.createElement('li');
  row.dataset.host = host;
  const name = Object.assign(document.createElement('code'), { textContent: host });
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
