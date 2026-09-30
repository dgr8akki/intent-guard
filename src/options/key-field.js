/**
 * Two small courtesies on the key field that the shared options.js leaves to the page:
 * a Show/Hide toggle, and a reason when Connect is pressed with nothing typed.
 */

const $ = (id) => document.getElementById(id);
const input = $('api-key');
const show = $('show-key');
const status = $('key-status');

show.addEventListener('click', () => {
  const revealed = input.type === 'password';
  input.type = revealed ? 'text' : 'password';
  show.setAttribute('aria-pressed', String(revealed));
  show.textContent = revealed ? 'Hide' : 'Show';
});

// options.js handles the submit first and only refocuses on an empty field; say why nothing happened.
$('key-form').addEventListener('submit', () => {
  if (input.value.trim()) return;
  input.setAttribute('aria-invalid', 'true');
  status.dataset.tone = 'error';
  status.replaceChildren(
    ...[document.querySelector('template[data-icon="error"]')?.content.cloneNode(true)].filter(Boolean),
    Object.assign(document.createElement('span'), { textContent: 'Paste your API key first.' }),
  );
});
