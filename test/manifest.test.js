import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const src = new URL('../src/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', src), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('manifest', () => {
  it('is Manifest V3 with the package version', () => {
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, pkg.version);
  });

  it('references only files that exist', () => {
    const files = [
      manifest.background.service_worker,
      manifest.action.default_popup,
      manifest.options_ui.page,
      ...manifest.content_scripts.flatMap((c) => [...c.js, ...(c.css ?? [])]),
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
    ];
    for (const file of files) assert.ok(existsSync(new URL(file, src)), `missing ${file}`);
  });

  it('asks for storage and scripting only and talks only to the two Jev providers', () => {
    // scripting: to add the content script to tabs that were open before install or session start.
    assert.deepEqual(manifest.permissions, ['scripting', 'storage']);
    assert.deepEqual(manifest.host_permissions, ['https://ai-gateway.vercel.sh/*', 'https://api.typesafe.ai/*']);
    assert.ok(
      manifest.content_scripts.every((c) => !c.all_frames),
      'top frames only',
    );
  });

  it('exposes only the nudge card font to web pages', () => {
    assert.deepEqual(manifest.web_accessible_resources, [
      { resources: ['fonts/source-serif-4.woff2'], matches: ['http://*/*', 'https://*/*'] },
    ]);
    for (const file of manifest.web_accessible_resources[0].resources) {
      assert.ok(existsSync(new URL(file, src)), `missing ${file}`);
    }
  });

  it('keeps the store description within 132 characters', () => {
    assert.ok(manifest.description.length <= 132, `${manifest.description.length} chars`);
  });
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
