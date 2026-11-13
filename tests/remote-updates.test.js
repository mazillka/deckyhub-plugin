import assert from 'node:assert/strict';
import test from 'node:test';
import { updateLine, updateSignature, validSummary } from '../docs/remote-updates.js';

const summary = updates => ({ updates, checkedAt: 1 });

test('only a well-formed summary from the device is accepted', () => {
  assert.ok(validSummary(summary([{ name: 'A', version: '1.0' }])));
  assert.ok(validSummary({ updates: [], checkedAt: null }));
  for (const bad of [null, {}, { updates: 'x', checkedAt: 1 }, summary([{ name: 1, version: '1' }]), summary([null]),
    summary(Array.from({ length: 51 }, () => ({ name: 'A', version: '1' }))), { updates: [], checkedAt: 'now' }]) {
    assert.equal(validSummary(bad), false);
  }
});

test('the line says what is waiting, in a few words', () => {
  assert.match(updateLine({ updates: [], checkedAt: null }, 'Deck'), /has not checked/);
  assert.equal(updateLine(summary([]), 'Deck'), 'Deck is up to date.');
  assert.equal(updateLine(summary([{ name: 'A', version: '2' }]), 'Deck'), 'Deck has 1 plugin update waiting: A 2.');
  const many = summary(['A', 'B', 'C', 'D', 'E'].map(name => ({ name, version: '1' })));
  assert.equal(updateLine(many, 'Deck'), 'Deck has 5 plugin updates waiting: A 1, B 1, C 1 and 2 more.');
});

test('the same set of updates has the same signature, in any order', () => {
  const a = summary([{ name: 'A', version: '1' }, { name: 'B', version: '2' }]);
  const b = summary([{ name: 'B', version: '2' }, { name: 'A', version: '1' }]);
  assert.equal(updateSignature(a), updateSignature(b));
  assert.notEqual(updateSignature(a), updateSignature(summary([{ name: 'A', version: '2' }])));
});
