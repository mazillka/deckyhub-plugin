import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { translate, ukrainianTexts } from '../docs/remote-i18n.js';

test('English stays as it is, and so does anything unknown', () => {
  assert.equal(translate('Request cancelled.', 'en'), 'Request cancelled.');
  assert.equal(translate('Something new.', 'uk'), 'Something new.');
  assert.equal(translate(undefined, 'uk'), undefined);
});

test("the browser's own reason stays after the translated message", () => {
  const base = 'Could not reach your device. Check that Remote access is on and that it is on the same network as this browser.';
  assert.equal(translate(`${base} (WebTransportError: Opening handshake failed.)`, 'uk'), `${translate(base, 'uk')} (WebTransportError: Opening handshake failed.)`);
  assert.notEqual(translate(base, 'uk'), base);
});

test('messages with a name or a number are translated too', () => {
  assert.equal(translate('Steam Deck selected.', 'uk'), 'Steam Deck вибрано.');
  assert.equal(translate('Used 5 minutes ago', 'uk'), 'Використано 5 хв тому');
  assert.equal(translate('Used just now', 'uk'), 'Використано щойно');
  assert.equal(translate('Pairing rejected.', 'uk'), 'Сполучення відхилено.');
  assert.equal(translate('Request failed.', 'uk'), 'Запит: не вдалося.');
  assert.equal(translate('Request cancelled.', 'uk'), 'Запит скасовано.');
  assert.equal(translate('Foo (disabled)', 'uk'), 'Foo (вимкнено)');
  assert.equal(translate('Request disable for Foo', 'uk'), 'Запит на вимикання: Foo');
  assert.equal(translate('1 installed plugin', 'uk'), 'Встановлено 1 плагін');
  assert.equal(translate('3 installed plugins', 'uk'), 'Встановлено 3 плагіни');
  assert.equal(translate('12 installed plugins', 'uk'), 'Встановлено 12 плагінів');
  assert.equal(translate('Pre-release: No threats', 'uk'), 'Попередній випуск: Загроз немає');
  assert.equal(translate('Steam Deck has 2 plugin updates waiting: A 1, B 2.', 'uk'), 'Steam Deck: на оновлення чекає 2 плагіни: A 1, B 2.');
  assert.equal(translate('Steam Deck: 5 plugin updates', 'uk'), 'Steam Deck: 5 оновлень плагінів');
  assert.equal(translate('Virus scan of v1.2: ClamAV: no threats found. A clean scan isn\'t proof of safety.', 'uk'),
    'Перевірка на віруси v1.2: ClamAV: no threats found. Чиста перевірка не доводить безпеку.');
});

// Every sentence the page's scripts write must have a Ukrainian text, or the Ukrainian page shows English.
test('every plain English sentence in the page scripts is translated', () => {
  // The bug-report details stay in English: they are for whoever reads the report.
  // Browser names ("Samsung Internet") are proper names and stay as they are.
  const NOT_SHOWN = new Set(['prefers-reduced-motion', 'DeckyHub connection details', 'Samsung Internet']);
  const missing = [];
  for (const file of ['remote-install.js', 'remote-plugins.js', 'remote-updates.js']) {
    const source = readFileSync(new URL(`../docs/${file}`, import.meta.url), 'utf8');
    for (const match of source.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
      const text = match[1].replace(/\\'/g, '\'');
      if (!/^[A-Z][a-z].*\s.*[a-z.…]$/.test(text) || text.length < 12 || [...NOT_SHOWN].some(part => text.includes(part))) continue;
      if (!ukrainianTexts.has(text) && translate(text, 'uk') === text) missing.push(`${file}: ${text}`);
    }
  }
  assert.deepEqual(missing, []);
});
