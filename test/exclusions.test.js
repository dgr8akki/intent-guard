import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_EXCLUSIONS, isExcluded, normalizePattern } from '../src/lib/exclusions.js';

describe('exclusions', () => {
  it('skips mail, sign-in, money, government, health and password managers by default', () => {
    for (const host of [
      'mail.google.com',
      'outlook.live.com',
      'outlook.office.com',
      'accounts.google.com',
      'login.microsoftonline.com',
      'www.paypal.com',
      'online.bankofamerica.com',
      'www.irs.gov',
      'www.gov.uk',
      'my.1password.com',
      'www.nhs.uk',
      'mychart.example.org',
    ]) {
      assert.ok(isExcluded(host), host);
    }
  });

  it('leaves ordinary sites alone', () => {
    for (const host of [
      'www.youtube.com',
      'github.com',
      'en.wikipedia.org',
      'news.ycombinator.com',
      'www.google.com',
      'docs.python.org',
      'auth0.com',
    ]) {
      assert.ok(!isExcluded(host), host);
    }
  });

  it('matches a plain host and its subdomains, not lookalikes', () => {
    assert.ok(isExcluded('paypal.com'));
    assert.ok(isExcluded('www.paypal.com'));
    assert.ok(!isExcluded('notpaypal.com'));
    assert.ok(!isExcluded('paypal.com.evil.example'));
  });

  it('honours the user list on top of the defaults', () => {
    assert.ok(isExcluded('example.com', ['example.com']));
    assert.ok(isExcluded('a.example.com', ['example.com']));
    assert.ok(!isExcluded('example.org', ['example.com']));
    assert.ok(isExcluded('mail.google.com', []));
  });

  it('ignores case and trailing dots in the host', () => {
    assert.ok(isExcluded('Mail.Google.COM.'));
  });

  it('normalises pasted URLs into host patterns and rejects junk', () => {
    assert.equal(normalizePattern(' https://Mail.Example.com/inbox?x=1 '), 'mail.example.com');
    assert.equal(normalizePattern('example.com:8080'), 'example.com');
    assert.equal(normalizePattern('*.gov'), '*.gov');
    assert.equal(normalizePattern('login.*'), 'login.*');
    assert.equal(normalizePattern('*bank*'), '*bank*');
    assert.equal(normalizePattern('   '), '');
    assert.equal(normalizePattern('not a host'), '');
    assert.equal(normalizePattern('chrome://extensions'), '');
  });

  it('ships every default in normalised form', () => {
    for (const pattern of DEFAULT_EXCLUSIONS) assert.equal(normalizePattern(pattern), pattern);
  });
});
