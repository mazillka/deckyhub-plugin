// DeckyHub's ratings API, a Cloudflare Worker with a D1 database (see ../README.md).
//   POST   /v1/rate       {plugin, device, stars?, works?, version?}   a rating (again: it replaces the last one)
//   DELETE /v1/rate       {plugin, device}                             takes it back
//   GET    /v1/aggregate  the numbers per plugin, for the registry to publish and clients to show
import { LIMITS, RatingError, parseRating, parseWithdraw, summarize } from './logic.js';
import { d1Store } from './store.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const reply = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...headers } });

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// store: the ratings' storage; salt: a secret that makes the address hashes unguessable; hash: sha256 of a string.
export function createHandler({ store, salt, now = Date.now, hash = sha256 }) {
  // The request's own address, hashed with the secret and the day: it counts requests and is never kept.
  const addressKey = async (request) =>
    `ip:${await hash(`${request.headers.get('CF-Connecting-IP') ?? 'unknown'}|${salt}|${Math.floor(now() / DAY)}`)}`;

  async function limit(request, device) {
    const window = Math.floor(now() / HOUR);
    const ip = await store.hit(await addressKey(request), window);
    const mine = await store.hit(`dev:${device}`, window);
    await store.purge(window - 48);
    if (ip > LIMITS.ip || mine > LIMITS.device) throw new RatingError(429, 'Too many requests. Try again later.');
  }

  return async function handle(request) {
    const { pathname } = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (pathname === '/v1/aggregate') {
        if (request.method !== 'GET') return reply(405, { error: 'Use GET.' });
        return reply(
          200,
          { generatedAt: new Date(now()).toISOString(), plugins: summarize(await store.aggregate()) },
          { 'Cache-Control': 'public, max-age=300' },
        );
      }
      if (pathname === '/v1/rate') {
        if (request.method !== 'POST' && request.method !== 'DELETE') return reply(405, { error: 'Use POST or DELETE.' });
        const text = await request.text();
        if (request.method === 'POST') {
          const rating = parseRating(text);
          await limit(request, rating.device);
          await store.save(rating, now());
        } else {
          const target = parseWithdraw(text);
          await limit(request, target.device);
          await store.withdraw(target);
        }
        return reply(200, { ok: true });
      }
      return reply(404, { error: 'Not found.' });
    } catch (error) {
      if (error instanceof RatingError)
        return reply(error.status, { error: error.message }, error.status === 429 ? { 'Retry-After': '3600' } : {});
      console.error(error);
      return reply(500, { error: 'Something went wrong.' });
    }
  };
}

export default {
  fetch: (request, env) => createHandler({ store: d1Store(env.DB), salt: env.ADDRESS_SALT })(request),
};
