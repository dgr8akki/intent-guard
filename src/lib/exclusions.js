/**
 * Sites whose pages are never described to Jev. A page on one of these hosts
 * reports only its origin, so the drift clock knows a page was viewed but no
 * title or text leaves the browser. The list errs towards skipping: a page
 * that is skipped counts as neither on nor off task, which costs at most a
 * missed nudge.
 *
 * Patterns: `example.com` matches the host and its subdomains, `login.*` the
 * first label, `*.gov` the ending, `*.gov.*` a label anywhere, `*bank*` a
 * substring.
 */

/** @type {string[]} */
export const DEFAULT_EXCLUSIONS = [
  // Mail: the title carries the address, the page carries subjects and bodies.
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'outlook.office365.com',
  'mail.yahoo.com',
  'mail.proton.me',
  'app.fastmail.com',
  'mail.aol.com',
  'mail.zoho.com',
  'www.icloud.com',
  // Signing in and account pages.
  'accounts.google.com',
  'myaccount.google.com',
  'appleid.apple.com',
  'account.microsoft.com',
  'login.*',
  'signin.*',
  'auth.*',
  'sso.*',
  'accounts.*',
  'account.*',
  'id.*',
  // Money.
  '*bank*',
  'paypal.com',
  'venmo.com',
  'chase.com',
  'wellsfargo.com',
  'capitalone.com',
  'americanexpress.com',
  'revolut.com',
  'wise.com',
  'monzo.com',
  'n26.com',
  'coinbase.com',
  'binance.com',
  'kraken.com',
  'intuit.com',
  // Government, which includes tax and benefits.
  '*.gov',
  '*.gov.*',
  '*.gouv.*',
  '*.gc.ca',
  // Health.
  '*health*',
  '*patient*',
  '*medical*',
  '*clinic*',
  '*pharmacy*',
  '*mychart*',
  '*hospital*',
  'nhs.uk',
  // Password managers.
  '1password.com',
  'lastpass.com',
  'bitwarden.com',
  'dashlane.com',
  'keepersecurity.com',
  'nordpass.com',
  'passwords.google.com',
  'vault.*',
  // Documents and files: the path is the capability.
  'docs.google.com',
  'drive.google.com',
  'dropbox.com',
  'onedrive.live.com',
];

const LABEL = '[a-z0-9-]+';
const PATTERN = new RegExp(`^(\\*${LABEL}\\*|(\\*|${LABEL})(\\.(\\*|${LABEL}))*)$`);

/** Lower-cases a hostname and drops a trailing dot, so `Mail.Google.COM.` still matches. */
const cleanHost = (host) =>
  String(host ?? '')
    .toLowerCase()
    .replace(/\.$/, '');

/** @param {string} pattern @param {string} host Already cleaned. */
function matches(pattern, host) {
  if (pattern.startsWith('*') && pattern.endsWith('*')) return host.includes(pattern.slice(1, -1));
  if (pattern.startsWith('*.')) {
    const rest = pattern.slice(2);
    if (rest.endsWith('.*')) return host.split('.').includes(rest.slice(0, -2));
    return host.endsWith(`.${rest}`);
  }
  if (pattern.endsWith('.*')) return host.split('.')[0] === pattern.slice(0, -2);
  return host === pattern || host.endsWith(`.${pattern}`);
}

/**
 * @param {string} host A hostname, as in `location.hostname`.
 * @param {string[]} [userPatterns] What the user added under "Never send these sites".
 */
export function isExcluded(host, userPatterns = []) {
  const clean = cleanHost(host);
  if (!clean) return false;
  return DEFAULT_EXCLUSIONS.some((p) => matches(p, clean)) || userPatterns.some((p) => matches(p, clean));
}

/**
 * Turns what a user typed into a pattern: a pasted URL becomes its host,
 * case and ports are dropped. Returns '' for anything that is not a host.
 *
 * @param {string} input
 */
export function normalizePattern(input) {
  let value = String(input ?? '')
    .trim()
    .toLowerCase();
  if (value.includes('://') || value.includes('/')) {
    try {
      const url = new URL(value.includes('://') ? value : `https://${value}`);
      if (!/^https?:$/.test(url.protocol)) return '';
      value = url.hostname;
    } catch {
      return '';
    }
  }
  value = value.replace(/:\d+$/, '').replace(/\.$/, '');
  return PATTERN.test(value) ? value : '';
}
