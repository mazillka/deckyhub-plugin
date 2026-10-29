import { getSettings } from "./api";
import { tr } from "./translate";
import { fetchNoCors } from "@decky/api";

// GitHub's unauthenticated REST API allows only 60 requests/hour (10/min for
// search) per device, versus 5,000/hour once a personal access token is set
// in Settings — see setGithubToken(). Held in module scope (not React state)
// since it's read from plain async functions with no component tree of
// their own; every route's I18nProvider primes it from getSettings() on
// mount and re-primes it whenever Settings saves a new one (see i18n/index.tsx).
export let githubToken = "";

export function setGithubToken(token: string) {
  githubToken = token.trim();
  // A token lifts the limit that the banner is warning about.
  if (githubToken) reportRateLimit(null, 0);
}

// Latest unauthenticated rate-limit hit, shown by RateLimitBanner on every
// screen that calls GitHub. Module state + a window event rather than React
// state, since githubResponseError() below has no component tree.
export const RATE_LIMIT_CHANGED = "deckyhub-rate-limit-changed";

export let rateLimit = { until: 0, minutesKnown: false };

export function reportRateLimit(minutes: number | null, until = Date.now() + (minutes ?? 15) * 60_000) {
  rateLimit = { until, minutesKnown: minutes !== null };
  window.dispatchEvent(new Event(RATE_LIMIT_CHANGED));
}

// No headers unless a token is set: any header makes fetchNoCors a CORS
// preflight to Decky Loader, and on a real Deck those preflights have been
// seen to stall forever (loader never reads them; Chrome's 6-socket pool for
// them fills up), hanging every GitHub call until its timeout. GitHub's
// default response is the same JSON the vnd.github+json Accept asked for.
export function githubHeaders(): Record<string, string> {
  return githubToken ? { Authorization: `Bearer ${githubToken}` } : {};
}

// React runs a child's effects before its parent's, so the first GitHub call
// on a route fires before I18nProvider has loaded the saved token. Wait for
// it once here instead of spending that call unauthenticated.
export let tokenLoaded: Promise<void> | null = null;

export async function githubFetch(url: string) {
  // A failed settings read is retried on the next call rather than kept.
  tokenLoaded ??= getSettings().then((settings) => setGithubToken(settings.githubToken || ""), () => {
    tokenLoaded = null;
  });
  await tokenLoaded;
  return fetchNoCors(url, { headers: githubHeaders(), signal: AbortSignal.timeout(15_000) });
}

export async function githubResponseError(response: Response): Promise<Error> {
  if (response.status !== 403 && response.status !== 429) return new Error(tr("github.error", { status: response.status }));
  const minutesUntil = (epochSeconds: number) => Math.max(1, Math.ceil((epochSeconds * 1000 - Date.now()) / 60_000));
  const retryAfter = Number(response.headers.get("retry-after"));
  const resetAt = Number(response.headers.get("x-ratelimit-reset"));
  const remaining = response.headers.get("x-ratelimit-remaining");
  const minutes = Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.max(1, Math.ceil(retryAfter / 60))
    : remaining === "0" && Number.isFinite(resetAt) && resetAt > 0
    ? minutesUntil(resetAt)
    : null;
  if (!githubToken) reportRateLimit(minutes);
  const parts = [`${tr("rateLimit.title")}.`, minutes ? tr("rateLimit.retryIn", { minutes }) : tr("rateLimit.retryLater")];
  if (!githubToken) parts.push(tr("rateLimit.howToAvoid"));
  return new Error(parts.join(" "));
}

// GitHub's own quota report for this device (or token). Querying it doesn't
// count against the limit. Only the hourly "core" bucket is returned — that's
// the one release checks drain; search has its own tiny per-minute bucket.
export async function githubCoreQuota(): Promise<{ limit: number; remaining: number; reset: number } | null> {
  const response = await githubFetch("https://api.github.com/rate_limit");
  if (!response.ok) throw await githubResponseError(response);
  return (await response.json()).resources?.core ?? null;
}

// Where a registry lives by convention: registry/apps.json on the default branch
// (raw.githubusercontent.com resolves HEAD to it), via GitHub's raw-content host.
// The Manage page takes "owner/repo" and expands it to this, so adding a registry
// whose source is a GitHub repo is one short field.
export const registryUrlForRepo = (repo: string) => `https://raw.githubusercontent.com/${repo.trim()}/HEAD/registry/apps.json`;

// Same rule as REPOSITORY_NAME in main.py: neither part may be only dots.
export const REPOSITORY_PATTERN = /^(?!\.+\/)[A-Za-z0-9_.-]+\/(?!\.+$)[A-Za-z0-9_.-]+$/;

export const isRepositoryName = (value: string) => REPOSITORY_PATTERN.test(value.trim());

// Short, scannable label for a registry URL: "owner/repo" for GitHub raw URLs,
// otherwise the host plus the file name. The Manage list shows this instead of the
// full URL, with a dropdown to switch the whole list back to the real URLs.
export function registryLabel(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const parts = pathname.split("/").filter(Boolean);
    if (hostname === "raw.githubusercontent.com" && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return parts.length ? `${hostname}/${parts[parts.length - 1]}` : hostname;
  } catch {
    return url;
  }
}

// The name in a repo's root plugin.json (every Decky plugin has one), or null. Read
// from raw.githubusercontent.com, which doesn't count against the GitHub API limit;
// header-less, so no CORS preflight (see githubHeaders()).
// ponytail: root only, so a monorepo plugin (MAKO keeps it in a subfolder) is found only once it's in a list.
export const manifestName = (repo: string): Promise<string | null> =>
  fetchNoCors(`https://raw.githubusercontent.com/${repo}/HEAD/plugin.json`, { signal: AbortSignal.timeout(10_000) })
    .then((response) => (response.ok ? response.json() : null))
    .then((manifest) => (typeof manifest?.name === "string" ? manifest.name : null), () => null);
