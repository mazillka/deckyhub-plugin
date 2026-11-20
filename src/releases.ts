import { log } from "./log";
import { tr } from "./translate";
import {
  type App,
  type AppReleaseOption,
  type Asset,
  type DeckyHubRelease,
  type DeckyHubReleaseOption,
  type PluginStats,
  type RepoPreference,
  type UpdateChannel,
  type VirusScan,
} from "./types";
import { compareVersions, inChannel, installedRelease, releaseVersion } from "./version";
import { fetchNoCors } from "@decky/api";
import { getSettings } from "./api";
import { githubFetch, githubHeaders, githubResponseError, githubToken } from "./github";
import { createRawCache } from "./rawCache";
import {
  CACHE_TTL,
  fetchPluginStats,
  fetchReleaseIndex,
  fetchVirusScans,
  metaDefenderReportOf,
  scanFor,
  virusTotalReportOf,
} from "./registryData";
import { clearStoreReleaseData, lookupForApp } from "./storeOnly";

// fetchReleases' localStorage envelope: when it was fetched (for CACHE_TTL)
// and the data. Only successful results are ever written, so a failure never
// "poisons" it. No ETag re-check: If-None-Match is a header, see githubHeaders().
type CacheEntry<T> = { at: number; data: T };

function readCache<T>(key: string): CacheEntry<T> | null {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

const RELEASES_CACHE_PREFIX = "deckyhub-releases:";

// A repo nobody has looked at for a week (or one since removed) loses its entry.
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let cachePruned = false;

function pruneReleaseCache() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(RELEASES_CACHE_PREFIX) && !(Date.now() - (readCache(key)?.at ?? 0) < CACHE_MAX_AGE))
      localStorage.removeItem(key);
  }
}

function writeCache(key: string, data: unknown): void {
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

function matchingAssets(app: App, assets: Asset[]): Asset[] {
  const include = app.asset.include.map((word) => word.toLowerCase());
  const exclude = app.asset.exclude.map((word) => word.toLowerCase());
  return assets.filter((asset) => {
    const name = asset.name.toLowerCase();
    return (
      name.endsWith(".zip") &&
      !exclude.some((word) => name.includes(word)) &&
      (!include.length || include.every((word) => name.includes(word)))
    );
  });
}

// A repo's recent non-draft releases with every asset, newest first — the one
// GitHub fetch behind the cards (hydrate), both version pickers and DeckyHub's
// own update check, cached per repo so they share it. Callers apply their own
// tag/asset filters on top, so a changed filter never serves stale results.
// GitHub's list endpoint isn't reliably sorted newest-first (a just-published
// release has been seen mid-array), so sort by published date here.
export type Release = {
  tag: string;
  pluginVersion?: string;
  prerelease: boolean;
  publishedAt: string | null;
  url: string;
  notes?: string;
  assets: Asset[];
};

// Lookups for the same repo that overlap share one request.
const inFlight = new Map<string, Promise<Release[]>>();

export function fetchReleases(repo: string, force: boolean): Promise<Release[]> {
  const key = `${repo}:${force}`;
  let request = inFlight.get(key);
  if (!request) {
    request = requestReleases(repo, force).finally(() => inFlight.delete(key));
    inFlight.set(key, request);
  }
  return request;
}

const DECKYHUB_REPO = "mazillka/deckyhub-plugin";

async function requestReleases(repo: string, force: boolean): Promise<Release[]> {
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
      // Only in the registry's release index (see releaseVersion()).
      pluginVersion: typeof item.pluginVersion === "string" && item.pluginVersion ? item.pluginVersion : undefined,
      prerelease: Boolean(item.prerelease),
      publishedAt: item.published_at || null,
      url: item.html_url || `https://github.com/${repo}/releases`,
      notes: typeof item.body === "string" ? item.body : undefined,
      assets: (item.assets || []).map((asset: any) => ({
        name: String(asset.name || ""),
        url: asset.browser_download_url,
        size: asset.size || 0,
        sha256: String(asset.digest || "").replace(/^sha256:/, "") || undefined,
      })),
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
function listOrError<T>(items: Promise<T[]>): Promise<{ items: T[]; error?: string }> {
  return items.then(
    (items) => ({ items }),
    (error) => {
      log(`Release lookup failed: ${error}`);
      return { items: [], error: String(error) };
    },
  );
}

// DeckyHub's own recent releases (both channels) for its update window's
// version picker, each with its DeckyHub-*.zip only when it carries a SHA-256
// — Decky Loader's installer needs one to verify the download.
export function listDeckyHubReleases(force = false): Promise<{ items: DeckyHubReleaseOption[]; error?: string }> {
  return listOrError(
    fetchReleases(DECKYHUB_REPO, force).then((releases) =>
      releases.map(({ assets, ...release }) => ({
        ...release,
        asset: assets.find(
          (asset) => /^DeckyHub-.*\.zip$/i.test(asset.name) && /^[0-9a-f]{64}$/i.test(asset.sha256 ?? ""),
        ),
      })),
    ),
  );
}

// Newest release on the given channel for the QAM "Update" button.
export async function latestDeckyHubRelease(channel: UpdateChannel): Promise<DeckyHubRelease> {
  const { items, error } = await listDeckyHubReleases();
  const release = items.find((item) => inChannel(item, channel));
  return release?.asset
    ? { version: release.tag, asset: release.asset, publishedAt: release.publishedAt, notes: release.notes }
    : { error: error ?? tr("release.noChecksum") };
}

// A tracked app's recent releases (tag-filtered, assets matched to its
// filters) for its version picker in AppDetailsModal.
// Only releases with a matching ZIP: a newer one without it (say a Windows-only build)
// is skipped, so cards and the version picker fall back to the last installable one.
export function listAppReleases(app: App, force = false): Promise<{ items: AppReleaseOption[]; error?: string }> {
  const tagInclude = app.releaseTagInclude?.toLowerCase();
  return lookupForApp(
    app,
    () =>
      listOrError(
        fetchReleases(app.repo, force).then((releases) =>
          releases
            .filter((release) => !tagInclude || release.tag.toLowerCase().includes(tagInclude))
            .map((release) => ({ ...release, assets: matchingAssets(app, release.assets) }))
            .filter((release) => release.assets.length > 0),
        ),
      ),
    { items: [] },
  );
}

// What flagged the version a hydrated app has installed (not the one its card would
// install): a threat from any of the four virus scans, and the registry audit's warnings
// when they cover that release. Undefined when nothing did, or its ZIP isn't known.
export async function installedRisk(app: App, force = false): Promise<App["installedRisk"]> {
  const asset = app.installedAssets?.[0];
  if (!asset) return undefined;
  const [scans, stats, virusTotal, metaDefender] = await Promise.all([
    fetchVirusScans(force),
    fetchPluginStats(force),
    virusTotalReportOf(asset).catch(() => null),
    metaDefenderReportOf(asset).catch(() => null),
  ]);
  const scan = scanFor(scans, asset);
  const threat =
    scan?.result === "infected" ||
    scan?.yara?.result === "infected" ||
    !!(virusTotal && "flagged" in virusTotal && virusTotal.flagged) ||
    !!(metaDefender && "flagged" in metaDefender && metaDefender.flagged);
  const stat = stats[app.repo.toLowerCase()];
  const warnings =
    (app.installedAudit === "stable"
      ? stat?.warnings
      : app.installedAudit === "prerelease"
        ? stat?.prereleaseWarnings
        : undefined) ?? [];
  return threat || warnings.length ? { threat, warnings } : undefined;
}

// Fills in a card's latest release for its channel and whether it's newer
// than what's installed.
export async function hydrate(app: App, force: boolean, preference?: RepoPreference): Promise<App> {
  // Store-only plugins may have old GitHub metadata in a reused cached app object.
  if (app.store) return clearStoreReleaseData(app);
  // An unverified plugin the user chose to trust, under the one name Decky can address it by, updates as a verified one.
  if (app.identityUnverified && app.uninstallName && preference?.trustedIdentity === app.uninstallName)
    app = { ...app, identityUnverified: false, identityTrusted: true, pluginName: app.uninstallName };
  const { items, error } = await listAppReleases(app, force);
  // The saved channel stays as it is, so a first stable release brings the card back to it.
  const prereleaseOnly = items.length > 0 && items.every((item) => item.prerelease);
  const channel: UpdateChannel = prereleaseOnly ? "prerelease" : (preference?.channel ?? "stable");
  const release = items.find((item) => inChannel(item, channel));
  if (!release)
    return { ...app, channel, prereleaseOnly, latestPrerelease: undefined, error: error ?? tr("release.noMatch") };
  const cmp = app.installedVersion ? compareVersions(releaseVersion(release), app.installedVersion) : null;
  const installed = app.identityUnverified ? undefined : installedRelease(items, app.installedVersion);
  return {
    ...app,
    channel,
    prereleaseOnly,
    installedAssets: installed?.release.assets,
    installedAudit: installed?.audit,
    latestVersion: release.tag,
    latestPrerelease: release.prerelease,
    publishedAt: release.publishedAt,
    releaseUrl: release.url,
    releaseNotes: release.notes,
    assets: release.assets,
    pinned: Boolean(preference?.pinVersion),
    // A skipped release counts as up to date until a newer one comes out; a pinned plugin never has an update.
    updateAvailable:
      app.identityUnverified || cmp === null
        ? null
        : cmp > 0 && preference?.skipVersion !== release.tag && !preference?.pinVersion,
  };
}
