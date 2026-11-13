import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describe } from '../docs/remote-plugins.js';

// A tiny stand-in for the DOM: enough for describe() to build what the Paired devices list shows.
const document = {
  createElement() {
    const node = { children: [], className: '', title: '', textContent: '', href: '', append(...items) { this.children.push(...items); }, get childElementCount() { return this.children.length; } };
    return node;
  },
};
const texts = parts => parts.flatMap(part => [part.textContent, ...(part.children || []).map(child => child.textContent)]);

test('shows badges, numbers and the virus scan of a matched plugin', () => {
  const record = {
    id: 'example', downloads: 194400, stars: 303, latest: 'v1.2.0', updated: '2026-09-03T00:00:00Z', root: true,
    warnings: ['obfuscated'], scan: { tag: 'v1.2.0', kind: 'clean', clamav: 'clean', yara: 'clean', virusTotal: [0, 67] },
  };
  const out = texts(describe(document, record, { obfuscated: ['Hidden code', 'obfuscated'] })).join(' | ');
  assert.match(out, /Runs as root/);
  assert.match(out, /Hidden code/);
  assert.match(out, /No threats/);
  assert.match(out, /194\.4K GitHub downloads · 303 stars · latest release v1\.2\.0 · updated 2026-09-03/);
  assert.match(out, /VirusTotal: 0 of 67 engines flagged it/);
  assert.match(out, /isn't proof of safety/);
});

test('an unknown audit code still shows, and a record with no data adds only its link', () => {
  const unknown = texts(describe(document, { id: 'x', warnings: ['brand-new'] }, {})).join(' | ');
  assert.match(unknown, /brand-new/);
  const bare = describe(document, { id: 'x' }, {});
  assert.equal(bare.length, 1);
  assert.equal(bare[0].textContent, 'All details on DeckyHub');
});

test('a bad id gets no link', () => {
  assert.deepEqual(describe(document, { id: '../evil' }, {}), []);
});
