import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createHandler } from '../ratings/src/index.js';
import { LIMITS, parseRating, summarize } from '../ratings/src/logic.js';
import { d1Store } from '../ratings/src/store.js';

// D1's statement API on top of SQLite, which D1 is made of: the Worker's SQL runs for real.
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../ratings/schema.sql', import.meta.url), 'utf8'));
  return {
    sqlite,
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const on = (...values) => ({
        run: async () => void statement.run(...values),
        first: async () => statement.get(...values) ?? null,
        all: async () => ({ results: statement.all(...values) }),
      });
      // D1 lets a statement without parameters run without bind().
      return { bind: on, ...on() };
    },
  };
}

const DEVICE = 'a'.repeat(43);
const OTHER = 'b'.repeat(43);
const setup = (start = Date.UTC(2026, 10, 14, 12)) => {
  const db = fakeD1();
  const clock = { now: start };
  const handle = createHandler({ store: d1Store(db), salt: 'secret', now: () => clock.now });
  const call = (method, path, body, ip = '203.0.113.7') =>
    handle(new Request(`https://api.example${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'CF-Connecting-IP': ip } }));
  return { db, clock, call };
};

test('a rating needs a real plugin, a device id, whole stars from 1 to 5 or works, and nothing else', () => {
  const ok = { plugin: 'Owner/Name', device: DEVICE };
  assert.deepEqual(parseRating(JSON.stringify({ ...ok, stars: 4, works: true, ui: false, version: '1.2.3' })), { plugin: 'owner/name', device: DEVICE, stars: 4, works: 1, ui: 0, version: '1.2.3' });
  assert.equal(parseRating(JSON.stringify({ ...ok, ui: true })).ui, 1);
  assert.equal(parseRating(JSON.stringify({ ...ok, works: false })).works, 0);
  for (const bad of [
    { ...ok },
    { ...ok, stars: 0 },
    { ...ok, stars: 6 },
    { ...ok, stars: 3.5 },
    { ...ok, stars: '5' },
    { ...ok, works: 'yes' },
    { ...ok, stars: 5, ui: 'yes' },
    { ...ok, stars: 5, version: 'bad version!' },
    { plugin: '../x', device: DEVICE, stars: 5 },
    { plugin: 'owner', device: DEVICE, stars: 5 },
    { plugin: 'a/b', device: 'short', stars: 5 },
  ])
    assert.throws(() => parseRating(JSON.stringify(bad)), { status: 400 }, JSON.stringify(bad));
  assert.throws(() => parseRating('not json'), { status: 400 });
  assert.throws(() => parseRating('[]'), { status: 400 });
  assert.throws(() => parseRating(JSON.stringify({ ...ok, stars: 5, pad: 'x'.repeat(3000) })), { status: 413 });
});

test('ratings are summed per plugin: the average of the stars given, and how many say it works or not', async () => {
  const { call } = setup();
  const rate = (device, plugin, extra) => call('POST', '/v1/rate', { plugin, device, ...extra });
  await rate(DEVICE, 'o/p', { stars: 5, works: true });
  await rate(OTHER, 'o/p', { stars: 2, works: false });
  await rate('c'.repeat(43), 'o/p', { works: true, ui: true });
  await rate('d'.repeat(43), 'o/p', { ui: false });
  await rate(DEVICE, 'o/q', { stars: 4 });
  const response = await call('GET', '/v1/aggregate');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
  const { plugins } = await response.json();
  assert.deepEqual(plugins['o/p'], { rated: 2, average: 3.5, works: 2, broken: 1, easy: 1, hard: 1 });
  assert.deepEqual(plugins['o/q'], { rated: 1, average: 4 });
});

test('rating again replaces the last rating, and a device can take it back', async () => {
  const { call } = setup();
  await call('POST', '/v1/rate', { plugin: 'o/p', device: DEVICE, stars: 1, works: false });
  await call('POST', '/v1/rate', { plugin: 'o/p', device: DEVICE, stars: 5 });
  assert.deepEqual((await (await call('GET', '/v1/aggregate')).json()).plugins['o/p'], { rated: 1, average: 5 });
  assert.equal((await call('DELETE', '/v1/rate', { plugin: 'o/p', device: DEVICE })).status, 200);
  assert.deepEqual((await (await call('GET', '/v1/aggregate')).json()).plugins, {});
});

test('a device and an address get a limited number of requests an hour, and the count starts again the next hour', async () => {
  const { call, clock } = setup();
  const send = (device, ip) => call('POST', '/v1/rate', { plugin: 'o/p', device, stars: 3 }, ip);
  for (let i = 0; i < LIMITS.device; i++) assert.equal((await send(DEVICE, '198.51.100.1')).status, 200);
  const refused = await send(DEVICE, '198.51.100.1');
  assert.equal(refused.status, 429);
  assert.equal(refused.headers.get('Retry-After'), '3600');
  assert.equal((await send(OTHER, '198.51.100.2')).status, 200, 'another device and address are not limited');
  clock.now += 3_600_000;
  assert.equal((await send(DEVICE, '198.51.100.1')).status, 200);
  // One address, many devices: the address limit stops it.
  const second = setup();
  let last = 200;
  for (let i = 0; i <= LIMITS.ip && last === 200; i++)
    last = (await second.call('POST', '/v1/rate', { plugin: 'o/p', device: String(i).padStart(43, 'x'), stars: 3 }, '192.0.2.9')).status;
  assert.equal(last, 429);
});

test('no address is stored, only a hash of it, and old counts are deleted', async () => {
  const { call, clock, db } = setup();
  await call('POST', '/v1/rate', { plugin: 'o/p', device: DEVICE, stars: 3 }, '203.0.113.77');
  const keys = db.sqlite.prepare('SELECT key FROM hits').all().map((row) => row.key);
  assert.equal(keys.length, 2);
  assert.ok(keys.every((key) => !key.includes('203.0.113.77')));
  assert.ok(keys.some((key) => /^ip:[0-9a-f]{64}$/.test(key)));
  clock.now += 3 * 24 * 3_600_000;
  await call('POST', '/v1/rate', { plugin: 'o/p', device: OTHER, stars: 3 }, '203.0.113.78');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM hits WHERE key = ?").get(keys.find((key) => key.startsWith('dev:'))).n, 0, 'the first day is gone');
});

test('other methods, paths and preflights get the right answers, with CORS', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/v1/rate')).status, 405);
  assert.equal((await call('POST', '/v1/aggregate', {})).status, 405);
  assert.equal((await call('GET', '/nope')).status, 404);
  const preflight = await call('OPTIONS', '/v1/rate');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await call('POST', '/v1/rate', { plugin: 'x', device: DEVICE, stars: 5 })).status, 400);
});

test('summarize leaves out what has no data', () => {
  assert.deepEqual(summarize([{ plugin: 'a/b', rated: 0, total: 0, works: 0, broken: 3 }]), { 'a/b': { broken: 3 } });
});
