import { log } from "./log";
import { tr } from "./translate";
import { type App, type AppReleaseOption, type Asset, type DeckyHubRelease, type DeckyHubReleaseOption, type PluginStats, type RepoPreference, type UpdateChannel } from "./types";
import { compareVersions, inChannel } from "./version";
import { fetchNoCors } from "@decky/api";
import { getSettings } from "./api";
import { githubFetch, githubHeaders, githubResponseError, githubToken } from "./github";

// GitHub's unauthenticated core API allows 60 requests/hour per IP, easy to
// burn through when Discover/Updates check every tracked app. Release lists
// are cached for 30 minutes (one shared entry per repo, see fetchReleases);
// every cache read is bypassed by force=true wherever the user explicitly asks
// to check (Refresh, Check for Updates).
export const CACHE_TTL = 30 * 60 * 1000;

// fetchReleases' localStorage envelope: when it was fetched (for CACHE_TTL)
// and the data. Only successful results are ever written, so a failure never
// "poisons" it. No ETag re-check: If-None-Match is a header, see githubHeaders().
export type CacheEntry<T> = { at: number; data: T };

export function readCache<T>(key: string): CacheEntry<T> | null {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export const RELEASES_CACHE_PREFIX = "deckyhub-releases:";

// A repo nobody has looked at for a week (or one since removed) loses its entry.
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export let cachePruned = false;

export function pruneReleaseCache() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(RELEASES_CACHE_PREFIX) && !(Date.now() - (readCache(key)?.at ?? 0) < CACHE_MAX_AGE)) localStorage.removeItem(key);
  }
}

export function writeCache(key: string, data: unknown): void {
  const value = JSON.stringify({ at: Date.now(), data });
  try {
    // Once per session, so entries for repos no longer listed don't pile up.
    if (!cachePruned) {
      cachePruned = true;
      pruneReleaseCache();
    }
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or storage disabled (private browsing) — caching is a
    // nice-to-have, never worth failing the fetch that already succeeded.
  }
}

export function matchingAssets(app: App, assets: Asset[]): Asset[] {
  const include = app.asset.include.map((word) => word.toLowerCase());
  const exclude = app.asset.exclude.map((word) => word.toLowerCase());
  return assets.filter((asset) => {
    const name = asset.name.toLowerCase();
    return name.endsWith(".zip") && !exclude.some((word) => name.includes(word)) && (!include.length || include.every((word) => name.includes(word)));
  });
}

// A repo's recent non-draft releases with every asset, newest first — the one
// GitHub fetch behind the cards (hydrate), both version pickers and DeckyHub's
// own update check, cached per repo so they share it. Callers apply their own
// tag/asset filters on top, so a changed filter never serves stale results.
// GitHub's list endpoint isn't reliably sorted newest-first (a just-published
// release has been seen mid-array), so sort by published date here.
export type Release = { tag: string; prerelease: boolean; publishedAt: string | null; url: string; notes?: string; assets: Asset[] };

// Lookups for the same repo that overlap share one request.
export const inFlight = new Map<string, Promise<Release[]>>();

export function fetchReleases(repo: string, force: boolean): Promise<Release[]> {
  const key = `${repo}:${force}`;
  let request = inFlight.get(key);
  if (!request) {
    request = requestReleases(repo, force).finally(() => inFlight.delete(key));
    inFlight.set(key, request);
  }
  return request;
}

// mazillka/deckyhub-registry publishes every listed repo's recent releases (and
// DeckyHub's own) as one file every hour (scripts/build_release_index.py there).
// It's read from raw.githubusercontent.com, outside the API's 60-an-hour limit
// that one call per listed repo would use up, so the API is asked only for repos
// the file lacks (added repos and registries). Header-less, so no CORS preflight.
const REGISTRY_RAW = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/";
export const RELEASE_INDEX_URL = `${REGISTRY_RAW}release-index/releases.json`;

// Settings' Registry channel: Pre-release reads the index the registry builds from its
// develop branch (release-index-develop), with main's as the fallback. Module state like
// the GitHub token, primed from settings by every I18nProvider and by Settings on save.
export let registryChannel: UpdateChannel = "stable";
let registryChannelLoaded: Promise<void> | null = null;

export function setRegistryChannel(channel: UpdateChannel | undefined) {
  registryChannel = channel === "prerelease" ? "prerelease" : "stable";
  registryChannelLoaded = Promise.resolve();
}

const indexUrls = (file: string) => [...(registryChannel === "prerelease" ? [`${REGISTRY_RAW}release-index-develop/${file}`] : []), `${REGISTRY_RAW}release-index/${file}`];

// An index this old means its job stopped publishing; ask GitHub instead. Generous on
// purpose: GitHub skips scheduled runs for hours at a time, and a list of 300+ plugins
// can't be asked of the API at 60 requests an hour, so a day-old index beats none.
export const RELEASE_INDEX_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// One of the release index's files, downloaded once and shared by every caller for
// CACHE_TTL. A forced refresh downloads it again, unless one started in the last
// minute (every card of one Refresh shares it); switching the Registry channel
// downloads the other branch's. `pick` turns the file into what callers get, and its
// fallback stands in for a missing or broken file, which moves on to the next URL.
export function cachedRawJson<T>(file: string, pick: (data: any) => T, fallback: T) {
  let cached: { at: number; urls: string; request: Promise<T> } | null = null;
  return async (force = false) => {
    // A failed settings read is retried on the next call rather than kept.
    registryChannelLoaded ??= getSettings().then((settings) => setRegistryChannel(settings.registryChannel), () => {
      registryChannelLoaded = null;
    });
    await registryChannelLoaded;
    const urls = indexUrls(file);
    if (!cached || cached.urls !== urls.join(" ") || Date.now() - cached.at > (force ? 60_000 : CACHE_TTL)) {
      cached = { at: Date.now(), urls: urls.join(" "), request: firstRawJson(urls, pick, fallback) };
    }
    return cached.request;
  };
}

async function firstRawJson<T>(urls: string[], pick: (data: any) => T, fallback: T): Promise<T> {
  for (const url of urls) {
    try {
      const response = await fetchNoCors(url, { signal: AbortSignal.timeout(15_000) });
      const picked = response.ok ? pick(await response.json()) : fallback;
      if (picked !== fallback) return picked;
    } catch (error: unknown) {
      log(`${url} unavailable: ${error}`);
    }
  }
  return fallback;
}

export const fetchReleaseIndex = cachedRawJson<Record<string, unknown[]> | null>(
  "releases.json",
  (index) => (Date.now() - Date.parse(index.generatedAt) < RELEASE_INDEX_MAX_AGE ? index.releases : null),
  null,
);

// Each listed plugin's stats (see PluginStats), published next to the release
// index by the same job. Only Discover uses it, so a missing file just leaves them out.
export const fetchPluginStats = cachedRawJson<Record<string, PluginStats>>(
  "stats.json",
  (stats) => stats.plugins ?? {},
  {},
);

export const DECKYHUB_REPO = "mazillka/deckyhub-plugin";

export async function requestReleases(repo: string, force: boolean): Promise<Release[]> {
  const cacheKey = `${RELEASES_CACHE_PREFIX}${repo}`;
  const cached = readCache<Release[]>(cacheKey);
  if (cached && !force && Date.now() - cached.at < CACHE_TTL) return cached.data;
  const url = `https://api.github.com/repos/${repo}/releases?per_page=20`;
  const indexed = (await fetchReleaseIndex(force))?.[repo.toLowerCase()];
  // DeckyHub's own update check asks GitHub first: one request, and a new DeckyHub
  // release must show up at once, not whenever the index job next runs (GitHub
  // skips its scheduled runs for hours). The index is its fallback.
  let body: unknown = repo.toLowerCase() === DECKYHUB_REPO ? undefined : indexed;
  const fromIndex = Boolean(body);
  if (!body) {
    try {
      const response = await githubFetch(url);
      if (!response.ok) throw await githubResponseError(response);
      body = await response.json();
      // GitHub sometimes answers [] to an authenticated request for a repo that has
      // releases (about 1 in 4 in October 2026; unauthenticated ones got the list every
      // time), so ask once more without the token before believing it. No headers also
      // means no CORS preflight (see githubHeaders()).
      if (githubToken && Array.isArray(body) && !body.length) {
        const retry = await fetchNoCors(url, { signal: AbortSignal.timeout(15_000) });
        if (retry.ok) body = await retry.json();
      }
    } catch (error) {
      // Older releases beat an error card; a rate limit still raises the banner.
      if (cached) return cached.data;
      if (!indexed) throw error;
      body = indexed;
    }
  }
  const releases: Release[] = (Array.isArray(body) ? body : [])
    .filter((item: any) => !item.draft)
    .map((item: any) => ({
      tag: String(item.tag_name || item.name),
      prerelease: Boolean(item.prerelease),
      publishedAt: item.published_at || null,
      url: item.html_url || `https://github.com/${repo}/releases`,
      notes: typeof item.body === "string" ? item.body : undefined,
      assets: (item.assets || []).map((asset: any) => ({ name: String(asset.name || ""), url: asset.browser_download_url, size: asset.size || 0, sha256: String(asset.digest || "").replace(/^sha256:/, "") || undefined })),
    }))
    .sort((a: Release, b: Release) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0));
  // An empty answer never replaces releases we've already seen: that's far more likely
  // the glitch above than a repo deleting every release.
  if (!releases.length && cached?.data.length) return cached.data;
  // The index is already one shared download, so only API answers are kept (all 300+
  // index lists would fill most of localStorage's ~5 MB); drop any older API copy.
  if (fromIndex) {
    try {
      localStorage.removeItem(cacheKey);
    } catch {}
  } else writeCache(cacheKey, releases);
  return releases;
}

// A failed lookup becomes an empty list plus the error, for the caller to show.
export function listOrError<T>(items: Promise<T[]>): Promise<{ items: T[]; error?: string }> {
  return items.then((items) => ({ items }), (error) => {
    log(`Release lookup failed: ${error}`);
    return { items: [], error: String(error) };
  });
}

// DeckyHub's own recent releases (both channels) for its update window's
// version picker, each with its DeckyHub-*.zip only when it carries a SHA-256
// — Decky Loader's installer needs one to verify the download.
export function listDeckyHubReleases(force = false): Promise<{ items: DeckyHubReleaseOption[]; error?: string }> {
  return listOrError(fetchReleases(DECKYHUB_REPO, force).then((releases) => releases.map(({ assets, ...release }) => ({
    ...release,
    asset: assets.find((asset) => /^DeckyHub-.*\.zip$/i.test(asset.name) && /^[0-9a-f]{64}$/i.test(asset.sha256 ?? "")),
  }))));
}

// Newest release on the given channel for the QAM "Update" button.
export async function latestDeckyHubRelease(channel: UpdateChannel): Promise<DeckyHubRelease> {
  const { items, error } = await listDeckyHubReleases();
  const release = items.find((item) => inChannel(item, channel));
  return release?.asset ? { version: release.tag, asset: release.asset, publishedAt: release.publishedAt, notes: release.notes } : { error: error ?? tr("release.noChecksum") };
}

// A tracked app's recent releases (tag-filtered, assets matched to its
// filters) for its version picker in AppDetailsModal.
// Only releases with a matching ZIP: a newer one without it (say a Windows-only build)
// is skipped, so cards and the version picker fall back to the last installable one.
export function listAppReleases(app: App, force = false): Promise<{ items: AppReleaseOption[]; error?: string }> {
  const tagInclude = app.releaseTagInclude?.toLowerCase();
  return listOrError(fetchReleases(app.repo, force).then((releases) => releases
    .filter((release) => !tagInclude || release.tag.toLowerCase().includes(tagInclude))
    .map((release) => ({ ...release, assets: matchingAssets(app, release.assets) }))
    .filter((release) => release.assets.length > 0)));
}

// Fills in a card's latest release for its channel and whether it's newer
// than what's installed.
export async function hydrate(app: App, force: boolean, preference?: RepoPreference): Promise<App> {
  const channel: UpdateChannel = preference?.channel ?? "stable";
  const { items, error } = await listAppReleases(app, force);
  const release = items.find((item) => inChannel(item, channel));
  if (!release) return { ...app, channel, error: error ?? tr("release.noMatch") };
  const cmp = app.installedVersion ? compareVersions(release.tag, app.installedVersion) : null;
  return {
    ...app,
    channel,
    latestVersion: release.tag,
    publishedAt: release.publishedAt,
    releaseUrl: release.url,
    releaseNotes: release.notes,
    assets: release.assets,
    updateAvailable: cmp === null ? null : cmp > 0,
  };
}
