import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// The dashboard rejects over-long fields silently on paste; catch it here instead.
const listing = readFileSync(new URL('../docs/store-listing.md', import.meta.url), 'utf8');
const messages = JSON.parse(readFileSync(new URL('../src/_locales/en/messages.json', import.meta.url), 'utf8'));

/** Every ```text block after `heading`, up to the next heading of the same or higher level. */
function blocks(heading) {
  const start = listing.indexOf(heading);
  assert.notEqual(start, -1, heading);
  const level = heading.match(/^#+/)[0];
  const rest = listing.slice(start + heading.length);
  const next = rest.search(new RegExp(`^#{1,${level.length}} `, 'm'));
  const section = next === -1 ? rest : rest.slice(0, next);
  return [...section.matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1]);
}

/** The plain paragraph under a heading, for fields written without a code fence. */
function paragraph(heading) {
  const start = listing.indexOf(heading);
  assert.notEqual(start, -1, heading);
  return listing
    .slice(start + heading.length)
    .split('\n')
    .slice(1) // the rest of the heading line
    .map((line) => line.trim())
    .find(Boolean);
}

describe('store listing limits', () => {
  it('title 45 and summary 132, both the same text as the manifest resolves to', () => {
    assert.ok(messages.appName.message.length <= 45, `${messages.appName.message.length} chars`);
    assert.ok(messages.appDescription.message.length <= 132, `${messages.appDescription.message.length} chars`);
    assert.equal(paragraph('### Title'), messages.appName.message);
    assert.equal(paragraph('### Summary'), messages.appDescription.message);
  });

  it('single purpose and every permission justification 1,000 or under', () => {
    const texts = [...blocks('### Single purpose'), ...blocks('### Permission justifications')];
    assert.ok(texts.length >= 6, `${texts.length} justification blocks`);
    for (const text of texts) assert.ok(text.length <= 1000, `${text.length} chars: ${text.slice(0, 40)}`);
  });

  it('detailed description within 16,000 and free of promises; release notes within 300', () => {
    const [description] = blocks('### Detailed description');
    assert.ok(description.length <= 16_000, `${description.length} chars`);
    assert.doesNotMatch(
      description,
      /within days|guarantee|100%|never miss|always catch/i,
      'no delivery or accuracy promises',
    );
    assert.match(description.split('\n')[0], /Nothing is sent when no session is running/);
    const [notes] = blocks('## Release notes');
    assert.ok(notes.length <= 300, `${notes.length} chars`);
  });
});
