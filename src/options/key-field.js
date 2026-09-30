/**
 * Two small courtesies on the key field that the shared options.js leaves to the page:
 * Show/Hide for a pasted key, and a reason when Connect is pressed with nothing typed.
 */

const $ = (id) => document.getElementById(id);
const input = $('api-key');
const button = $('show-key');
const status = $('key-status');

// The label stays put; aria-pressed carries the state.
function reveal(show) {
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(show));
}

button.addEventListener('click', () => {
  reveal(input.type === 'password');
  input.focus({ preventScroll: true });
});

// A key that has been checked goes to storage, and a cancelled edit is over: nothing readable stays on screen.
input.form.addEventListener('submit', () => reveal(false));
$('cancel').addEventListener('click', () => reveal(false));

// options.js handles the submit first and only refocuses on an empty field; say why nothing happened.
input.form.addEventListener('submit', () => {
  if (input.value.trim()) return;
  input.setAttribute('aria-invalid', 'true');
  status.dataset.tone = 'error';
  status.replaceChildren(
    ...[document.querySelector('template[data-icon="error"]')?.content.cloneNode(true)].filter(Boolean),
    Object.assign(document.createElement('span'), { textContent: 'Paste your API key first.' }),
  );
});
