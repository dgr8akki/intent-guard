/**
 * Two small courtesies on the key field that the shared options.js leaves to the page:
 * Show/Hide for a pasted key, and a reason when Connect is pressed with nothing typed.
 */

const $ = (id) => document.getElementById(id);
const input = $('api-key');
const button = $('show-key');
const status = $('key-status');

// Button text never changes; screen readers get the on/off from aria-pressed.
function reveal(show) {
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(show));
}

button.addEventListener('click', () => {
  reveal(input.type === 'password');
  input.focus({ preventScroll: true });
});

// Hide the key again on Connect and on Cancel. Either way the user is done looking at it.
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
