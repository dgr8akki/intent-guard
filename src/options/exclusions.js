/**
 * The "Never send these sites" list on the settings page. Hosts are kept in
 * `chrome.storage.local.excludedHosts`; the service worker tells open pages
 * when the list changes.
 */

import { normalizePattern } from '../lib/exclusions.js';

const $ = (id) => document.getElementById(id);
const form = $('exclude-form');
const input = $('exclude-host');
const list = $('exclude-list');
const status = $('exclude-status');

let { excludedHosts = [] } = await chrome.storage.local.get('excludedHosts');
render();

// The popup can add a site while this page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.excludedHosts) return;
  excludedHosts = changes.excludedHosts.newValue ?? [];
  render();
});

const save = () => chrome.storage.local.set({ excludedHosts });

function render() {
  list.replaceChildren(...excludedHosts.map(row));
}

/** One host with a way to remove it. Focus stays in the list, or returns to the field when it empties. */
function row(host) {
  const item = document.createElement('li');
  const name = Object.assign(document.createElement('code'), { textContent: host, title: host });
  const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn-icon' });
  remove.setAttribute('aria-label', `Stop excluding ${host}`);
  remove.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  remove.addEventListener('click', async () => {
    const index = excludedHosts.indexOf(host);
    excludedHosts = excludedHosts.filter((h) => h !== host);
    await save();
    render();
    setStatus(`Removed ${host}.`, 'neutral');
    const next = list.querySelectorAll('button')[Math.min(index, excludedHosts.length - 1)];
    (next ?? input).focus();
  });
  item.append(name, remove);
  return item;
}

function setStatus(text, tone) {
  status.classList.remove('status-ok', 'status-error', 'status-neutral');
  status.textContent = text;
  if (text) status.classList.add(`status-${tone}`);
}

input.addEventListener('input', () => {
  if (input.getAttribute('aria-invalid') === 'true') {
    input.setAttribute('aria-invalid', 'false');
    setStatus('');
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const host = normalizePattern(input.value);
  if (!host) {
    input.setAttribute('aria-invalid', 'true');
    setStatus('Enter a site like example.com.', 'error');
    return input.focus();
  }
  if (excludedHosts.includes(host)) {
    setStatus(`${host} is already listed.`, 'neutral');
    return input.focus();
  }
  excludedHosts = [...excludedHosts, host];
  await save();
  render();
  input.value = '';
  setStatus(`Added ${host}.`, 'ok');
  input.focus();
});
