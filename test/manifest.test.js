import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { describeSharedManifest } from './manifest-shared.js';

const root = new URL('../', import.meta.url);
const src = new URL('src/', root);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', src), 'utf8'));
const messages = (locale) => JSON.parse(readFileSync(new URL(`_locales/${locale}/messages.json`, src), 'utf8'));
const en = messages('en');

describe('manifest', () => {
  describeSharedManifest(root);

  it('asks for storage and scripting only, and for the hosts it already runs on', () => {
    // scripting: to add the content script to tabs that were open before install or session start.
    assert.deepEqual(manifest.permissions, ['scripting', 'storage']);
    // Host permissions mirror the content script's matches. Without them tabs.query({ url }) returns
    // nothing and scripting.executeScript is refused, so open tabs could never be reached; the install
    // warning is already the broad one because of the content script, so this adds no new prompt.
    const matches = manifest.content_scripts.flatMap((c) => c.matches);
    assert.deepEqual(manifest.host_permissions, [
      ...matches,
      'https://ai-gateway.vercel.sh/*',
      'https://api.typesafe.ai/*',
    ]);
    assert.ok(
      manifest.content_scripts.every((c) => !c.all_frames),
      'top frames only',
    );
  });

  it('takes its name and summary from the locale files', () => {
    assert.equal(manifest.default_locale, 'en');
    assert.equal(manifest.name, '__MSG_appName__');
    assert.equal(manifest.short_name, '__MSG_appShortName__');
    assert.equal(manifest.description, '__MSG_appDescription__');
    for (const locale of ['en', 'en_GB']) {
      const m = messages(locale);
      assert.deepEqual(Object.keys(m).sort(), ['appDescription', 'appName', 'appShortName'], locale);
    }
  });

  it('has a store title and summary that fit the dashboard and say nothing about blocking', () => {
    assert.ok(en.appName.message.length <= 45, `${en.appName.message.length} chars`);
    assert.equal(en.appShortName.message, 'Intent Guard');
    assert.ok(en.appDescription.message.length <= 132, `${en.appDescription.message.length} chars`);
    assert.doesNotMatch(en.appDescription.message, /gentle|block/i);
    assert.ok((en.appDescription.message.match(/focus/gi) ?? []).length <= 1, '"focus" at most once');
  });

  it('exposes nothing to web pages', () => {
    // A web-accessible file lets any site detect the extension by loading it; the nudge uses Georgia instead.
    assert.equal(manifest.web_accessible_resources, undefined);
  });
});

describe('extension pages', () => {
  for (const page of ['popup/popup.html', 'options/options.html']) {
    it(`${page} declares its colour scheme and a description`, () => {
      const html = readFileSync(new URL(page, src), 'utf8');
      assert.match(html, /<meta name="color-scheme" content="light dark" \/>/);
      assert.match(html, /<meta\s+name="description"\s+content="Intent Guard[^"]+"\s*\/>/);
    });
  }
});

describe('background service worker', () => {
  const background = readFileSync(new URL('background.js', src), 'utf8');

  it('guards setAccessLevel so a missing method cannot abort worker startup', () => {
    // storage.local.setAccessLevel arrived in Chrome 140. Called unguarded on an older
    // Chrome it throws during evaluation and onMessage never registers, so nothing nudges.
    assert.ok(!/setAccessLevel\(/.test(background), 'unguarded setAccessLevel( call');
    assert.match(background, /setAccessLevel\?\.\(/);
  });

  it('requires a Chrome that has storage.local.setAccessLevel', () => {
    assert.ok(
      Number(manifest.minimum_chrome_version) >= 140,
      `minimum_chrome_version ${manifest.minimum_chrome_version}`,
    );
  });
});
