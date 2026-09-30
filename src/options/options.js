/**
 * Settings page, opened on install: picks the Jev provider and connects its
 * key. A saved key is never put back into the input; it shows as a masked
 * chip with Test, Replace and Remove.
 */

import { DEFAULT_PROVIDER, JevError, PROVIDERS, createJevClient, maskKey } from '../lib/jev.js';

/** Outbound links carry a ↗ mark and a hidden "(opens in a new tab)". Trusted constants, so innerHTML is fine. */
const EXTERNAL =
  '<svg class="external" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11L11 5M6 5h5v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="visually-hidden"> (opens in a new tab)</span>';
const link = (href, text) => `<a href="${href}" target="_blank" rel="noreferrer">${text}${EXTERNAL}</a>`;
const STEPS = {
  vercel: [
    `${link(PROVIDERS.vercel.keysUrl, 'Create an AI Gateway API key')} in the Vercel dashboard.`,
    `Set a ${link('https://vercel.com/docs/ai-gateway/observability-and-spend/budgets', 'spend limit')} on it (optional, recommended).`,
    'Paste it here.',
  ],
  typesafe: [`${link(PROVIDERS.typesafe.keysUrl, 'Create an API key')} in the TypeSafe console.`, 'Paste it here.'],
};

/** Status lines never rely on colour alone: each tone has its own mark. */
const ICONS = {
  busy: '<span class="spinner" aria-hidden="true"></span>',
  ok: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="1.3"/><path d="M5 8.3l2 2 4-4.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  error:
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6l6.8 12H1.2z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 6v3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.6" r=".9" fill="currentColor"/></svg>',
  neutral:
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="1.3"/><path d="M5 8h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

const $ = (id) => document.getElementById(id);
const form = $('key-form');
const input = $('api-key');
const cancel = $('cancel');
const connected = $('connected');
const submit = form.querySelector('button[type="submit"]');
const testButton = $('test');
const formStatus = $('key-status');
const connectedStatus = $('connected-status');
const radios = [...form.elements.provider];

let { apiKey = '', provider = DEFAULT_PROVIDER } = await chrome.storage.local.get(['apiKey', 'provider']);
if (!PROVIDERS[provider]) provider = DEFAULT_PROVIDER;
render();

const selected = () => radios.find((radio) => radio.checked)?.value ?? provider;

/** Steps, placeholder and privacy line follow the provider being shown. */
function showProvider(id) {
  $('steps').innerHTML = STEPS[id].map((step) => `<li><span>${step}</span></li>`).join('');
  input.placeholder = PROVIDERS[id].placeholder;
  $('host').textContent = PROVIDERS[id].host;
}

function render(editing = false) {
  const showForm = editing || !apiKey;
  form.hidden = !showForm;
  connected.hidden = showForm;
  cancel.hidden = !apiKey;
  // Same page on install and later; only the kicker changes.
  $('kicker').textContent = !showForm ? 'Settings' : apiKey ? 'Replace your key' : 'Welcome';
  input.value = '';
  setInvalid(false);
  radios.forEach((radio) => (radio.checked = radio.value === provider));
  showProvider(provider);
  $('provider-label').textContent = PROVIDERS[provider].label;
  $('masked').textContent = maskKey(apiKey);
  if (showForm) input.focus({ preventScroll: true }); // keep the welcome headline in view
}

radios.forEach((radio) =>
  radio.addEventListener('change', () => {
    showProvider(selected());
    setStatus(formStatus, '');
    input.focus({ preventScroll: true });
  }),
);

input.addEventListener('input', () => {
  if (input.getAttribute('aria-invalid') === 'true') {
    setInvalid(false);
    setStatus(formStatus, '');
  }
});

/**
 * Checks a key against its provider. Resolves `{ ok: true, note }` when the key can be saved (`note`
 * is set when the provider was busy and the key only accepted, not exercised), or
 * `{ ok: false, message, invalid }`; `invalid` is false when the key itself was not at fault.
 */
async function test(id, key) {
  try {
    const answers = await createJevClient({ getKey: () => key, getProvider: () => id }).evaluate({
      state: 'ping',
      questions: {
        ok: { type: 'choice', instructions: 'Is this a test message?', criteria: { yes: 'Yes', no: 'No' } },
      },
    });
    // The client checks that every question was answered; a choice answer must also carry its choice.
    if (typeof answers.ok?.choice !== 'string') {
      return { ok: false, message: `Unexpected reply from ${PROVIDERS[id].host}.`, invalid: false };
    }
    return { ok: true, note: '' };
  } catch (error) {
    if (!(error instanceof JevError)) {
      console.error('Intent Guard: key check failed', error);
      return { ok: false, message: 'Something went wrong while checking the key. Try again.', invalid: false };
    }
    // A busy provider still accepted the key.
    if (error.busy) return { ok: true, note: 'Key accepted; the provider is busy right now.' };
    // status 0: offline or timed out, so nothing is known about the key.
    return { ok: false, message: error.message, invalid: error.status !== 0 };
  }
}

/** @param {'busy' | 'ok' | 'error' | 'neutral'} [tone] */
function setStatus(el, text, tone) {
  el.classList.remove('status-busy', 'status-ok', 'status-error', 'status-neutral');
  el.replaceChildren();
  if (!text) return;
  el.classList.add(`status-${tone ?? 'neutral'}`);
  el.innerHTML = ICONS[tone ?? 'neutral'];
  el.append(Object.assign(document.createElement('span'), { textContent: text }));
}

function setInvalid(invalid) {
  input.setAttribute('aria-invalid', String(invalid));
}

/** Spinner plus label while a check runs; the input stays put but can't change underneath it. */
function setBusy(button, busy, label) {
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  button.innerHTML = busy ? ICONS.busy : '';
  button.append(label);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = selected();
  const key = input.value.trim();
  if (!key) return input.focus({ preventScroll: true });
  setInvalid(false);
  input.readOnly = true;
  setBusy(submit, true, 'Checking…');
  setStatus(formStatus, `Checking key with ${PROVIDERS[id].label}…`, 'busy');
  const result = await test(id, key);
  input.readOnly = false;
  setBusy(submit, false, 'Connect');
  if (!result.ok) {
    setInvalid(result.invalid);
    return setStatus(formStatus, result.message, 'error');
  }
  apiKey = key;
  provider = id;
  await chrome.storage.local.set({ apiKey, provider });
  setStatus(formStatus, '');
  render();
  testButton.focus(); // the form just went away under the submit button; keep keyboard users on the card
  setStatus(
    connectedStatus,
    result.note || 'Key works. Open the Intent Guard popup to start a session.',
    result.note ? 'neutral' : 'ok',
  );
});

testButton.addEventListener('click', async () => {
  setBusy(testButton, true, 'Test');
  setStatus(connectedStatus, 'Checking key…', 'busy');
  const result = await test(provider, apiKey);
  setBusy(testButton, false, 'Test');
  if (!result.ok) setStatus(connectedStatus, result.message, 'error');
  else setStatus(connectedStatus, result.note || 'Key works.', result.note ? 'neutral' : 'ok');
});

$('replace').addEventListener('click', () => {
  setStatus(connectedStatus, '');
  render(true);
});
cancel.addEventListener('click', () => {
  setStatus(formStatus, '');
  render();
  $('replace').focus(); // back where the edit began
});

$('remove').addEventListener('click', async () => {
  await chrome.storage.local.remove('apiKey');
  apiKey = '';
  setStatus(connectedStatus, '');
  render();
  setStatus(formStatus, 'Key removed from this browser.', 'neutral');
});
