// What a rating may contain, and how the ratings of a plugin are summed up. No network or storage here.

export class RatingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// owner/name of a GitHub repository, as DeckyHub's registry spells it.
export const PLUGIN = /^(?!\.+\/)[A-Za-z0-9_.-]{1,100}\/(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;
// A random 32-byte id, base64url: what a device makes up for itself.
export const DEVICE = /^[A-Za-z0-9_-]{43}$/;
export const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
export const MAX_BODY = 2048;
// Requests allowed per hour from one (hashed) address and from one device.
export const LIMITS = { ip: 60, device: 20 };

const bad = (message) => new RatingError(400, message);

function parseJson(text) {
  if (text.length > MAX_BODY) throw new RatingError(413, 'Request is too large.');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw bad('The request is not JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('The request must be an object.');
  return body;
}

function identify(body) {
  if (typeof body.plugin !== 'string' || !PLUGIN.test(body.plugin)) throw bad('Unknown plugin name.');
  if (typeof body.device !== 'string' || !DEVICE.test(body.device)) throw bad('Invalid device id.');
  return { plugin: body.plugin.toLowerCase(), device: body.device };
}

// A new or changed rating: stars (1 to 5), works (true or false), or both; and the version it is about.
export function parseRating(text) {
  const body = parseJson(text);
  const { plugin, device } = identify(body);
  const stars = body.stars ?? null;
  const works = body.works ?? null;
  if (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5)) throw bad('Stars are a whole number from 1 to 5.');
  if (works !== null && typeof works !== 'boolean') throw bad('"works" is true or false.');
  if (stars === null && works === null) throw bad('Send stars, works, or both.');
  const version = body.version ?? null;
  if (version !== null && (typeof version !== 'string' || !VERSION.test(version))) throw bad('Invalid version.');
  return { plugin, device, stars, works: works === null ? null : works ? 1 : 0, version };
}

// Taking a rating back.
export function parseWithdraw(text) {
  return identify(parseJson(text));
}

// Rows of {plugin, rated, total, works, broken} to what clients read. average: of the stars given, to one decimal.
export function summarize(rows) {
  const plugins = {};
  for (const row of rows) {
    const entry = {};
    if (row.rated > 0) {
      entry.rated = row.rated;
      entry.average = Math.round((row.total / row.rated) * 10) / 10;
    }
    if (row.works > 0) entry.works = row.works;
    if (row.broken > 0) entry.broken = row.broken;
    plugins[row.plugin] = entry;
  }
  return plugins;
}
