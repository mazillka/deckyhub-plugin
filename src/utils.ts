import { fetchNoCors, toaster } from "@decky/api";
import type { MessageKey, TFunc } from "./i18n/en";
import type { App, AppReleaseOption, Asset, DeckyHubRelease, DeckyHubReleaseOption, RepoPreference, UpdateChannel } from "./types";

// GitHub's unauthenticated core API allows 60 requests/hour per device —
// easy to burn through when Discover/Updates hydrates every tracked app on
// each load, plus the DeckyHub and per-app version pickers each fetch their
// own release list on every open. 5 minutes trades a little staleness for
// substantially fewer requests; every cache read is bypassed by force=true
// wherever the user explicitly asks to check (Refresh, Check for Updates).
export const CACHE_TTL = 5 * 60 * 1000;
export const UPDATE_NOTICE_KEY = "deckyhub-update-notice";
export const DEFAULT_COLUMNS_PER_ROW = 3;
export const pageStyle = { boxSizing: "border-box" as const, height: "100%", overflowY: "auto" as const, padding: "64px 12px 96px", scrollPaddingBottom: 96, scrollPaddingTop: 64, width: "100%" };
export const compactButtonStyle = { width: "100%", minHeight: 36, marginBottom: 8, padding: "6px 10px", textAlign: "center" as const };
export const modalButtonStyle = { width: "100%", minHeight: 36, padding: "6px 10px", textAlign: "center" as const };
export const sectionDividerStyle = { borderTop: "1px solid rgba(255, 255, 255, 0.14)", margin: "16px 0" };
// Reserves a fixed two-line height so cards in the same grid row stay aligned regardless of description length.
export const cardDescriptionStyle = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden",
  minHeight: "2.6em",
  lineHeight: "1.3em",
};

export function fetchWithTimeout(input: string, init?: RequestInit) {
  return fetchNoCors(input, { ...init, signal: AbortSignal.timeout(15_000) });
}

// GitHub's unauthenticated REST API allows only 60 requests/hour (10/min for
// search) per device, versus 5,000/hour once a personal access token is set
// in Settings — see setGithubToken(). Held in module scope (not React state)
// since it's read from plain async functions with no component tree of
// their own; every route's I18nProvider primes it from getSettings() on
// mount and re-primes it whenever Settings saves a new one (see i18n/index.tsx).
let githubToken = "";

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

export function githubHeaders(): Record<string, string> {
  return githubToken ? { Accept: "application/vnd.github+json", Authorization: `Bearer ${githubToken}` } : { Accept: "application/vnd.github+json" };
}

// GitHub's REST API is what every fetch in this file hits — unauthenticated
// by default, so a 403/429 here is almost always its rate limit (60 req/hr
// for the core API, 10/min for search; 5,000/hr and 30/min once a token is
// set), not a real access error. The raw "GitHub API returned 403" that
// used to surface gave no indication of that, so pull whatever wait-time
// hint the response actually offers (some responses omit these headers
// entirely — that's fine, the message just degrades to a generic one)
// instead of guessing, and nudge toward adding a token when none is set.
export async function githubResponseError(response: Response): Promise<Error> {
  if (response.status !== 403 && response.status !== 429) return new Error(`GitHub API returned ${response.status}`);
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
  const hint = githubToken ? "" : " Add a GitHub token in Settings to raise this limit.";
  return new Error(
    minutes ? `GitHub API rate limit reached — try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.${hint}` : `GitHub API rate limit reached — try again later.${hint}`,
  );
}

// GitHub's own quota report for this device (or token). Querying it doesn't
// count against the limit. Only the hourly "core" bucket is returned — that's
// the one release checks drain; search has its own tiny per-minute bucket.
export async function githubCoreQuota(): Promise<{ limit: number; remaining: number; reset: number } | null> {
  const response = await fetchWithTimeout("https://api.github.com/rate_limit", { headers: githubHeaders() });
  if (!response.ok) throw await githubResponseError(response);
  return (await response.json()).resources?.core ?? null;
}

export const readableBytes = (bytes = 0) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

export const statusKey = (app: App): MessageKey =>
  !app.installedVersion ? "filter.notInstalled" : app.updateAvailable ? "status.updateAvailable" : app.updateAvailable === false ? "status.upToDate" : "filter.installed";

export const statusColor = (app: App) => (!app.installedVersion || app.error ? "#ff6b6b" : app.updateAvailable ? "#f0c33c" : app.updateAvailable === false ? "#6bcb6b" : undefined);

const keyFor = (app: App) => `deckyhub-release:${app.repo}:${app.source}`;

// Shared by every GitHub-fetching function below — a plain localStorage
// {at, data} envelope read back only when still under CACHE_TTL and not
// explicitly bypassed. Only successful results are ever written (see each
// call site's try/catch), so a transient failure never "poisons" the cache
// for the next attempt.
function readCache<T>(key: string, force: boolean): T | null {
  if (force) return null;
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && Date.now() - value.at < CACHE_TTL ? (value.data as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Quota exceeded or storage disabled (private browsing) — caching is a
    // nice-to-have, never worth failing the fetch that already succeeded.
  }
}

function versionNumbers(value: string) {
  const match = value.match(/v?(\d+(?:\.\d+)+)/i);
  return match ? match[1].split(".").map(Number) : null;
}

export const normalizeVersion = (value: string) => value.trim().replace(/^v/i, "");

// Shared by DeckyHubUpdateModal and AppDetailsModal's version pickers: keep
// the current selection if it's still present in the (channel-filtered)
// list and this isn't a forced refresh, otherwise fall back to the newest
// item. "Check for Updates"/"Refresh" (pinLatest) overrides a still-valid
// manual selection on purpose, since that's the point of explicitly checking.
export function selectDefaultTag<T extends { tag: string }>(filtered: T[], current: string, pinLatest: boolean): string {
  if (!pinLatest && current && filtered.some((item) => item.tag === current)) return current;
  return filtered[0]?.tag ?? "";
}

// Shared by the same two version pickers: label each release with "v" plus
// an "(installed)"/"(latest)" suffix — items[0] is the newest since every
// release-list fetch above sorts by publish date before returning.
export function buildVersionOptions<T extends { tag: string; version: string }>(items: T[], installedVersion: string | null | undefined, t: TFunc): { data: string; label: string }[] {
  return items.map((item) => {
    const version = normalizeVersion(item.version);
    const isInstalled = Boolean(installedVersion) && version === normalizeVersion(installedVersion!);
    const isLatest = items[0]?.tag === item.tag;
    const suffix = isInstalled ? ` (${t("settings.installedLabel")})` : isLatest ? ` (${t("settings.latestLabel")})` : "";
    return { data: item.tag, label: `v${version}${suffix}` };
  });
}

// Decky Loader's PluginInstallType enum (backend enums.py) — passed to the
// global `utilities/install_plugin` route to tell its native installer what
// kind of operation this is.
export const PLUGIN_INSTALL_TYPE = { REINSTALL: 1, UPDATE: 2, DOWNGRADE: 3 } as const;

// DeckyHub's own versions can carry a pre-release suffix ("1.0.3-rc.2"),
// which versionNumbers() above deliberately ignores (it only wants the
// release-number part for third-party apps). That made every "1.0.3-rc.N"
// compare as an identical "1.0.3" here, so switching between rc.1/rc.2/rc.3
// in the version picker always resolved to Reinstall. Parse the suffix too.
function parseDeckyHubVersion(value: string) {
  const [release, prerelease] = normalizeVersion(value).split(/-(.+)/, 2);
  return { release: release.split(".").map((part) => Number(part) || 0), prerelease: prerelease ?? null };
}

// A version with no pre-release suffix outranks the same release number with
// one ("1.0.3" > "1.0.3-rc.9"); between two suffixed versions, compare their
// trailing number ("rc.2" > "rc.1"), falling back to plain string order if a
// suffix doesn't end in one (covers anything other than "-rc.N" gracefully).
function comparePrerelease(target: string | null, current: string | null): number {
  if (target === current) return 0;
  if (target === null) return 1;
  if (current === null) return -1;
  const targetNumber = Number(target.match(/(\d+)$/)?.[1]);
  const currentNumber = Number(current.match(/(\d+)$/)?.[1]);
  if (!Number.isNaN(targetNumber) && !Number.isNaN(currentNumber) && targetNumber !== currentNumber) return targetNumber > currentNumber ? 1 : -1;
  return target > current ? 1 : target < current ? -1 : 0;
}

export function resolveDeckyHubInstallType(latestVersion: string, installedVersion: string): 1 | 2 | 3 {
  if (installedVersion === "unknown") return PLUGIN_INSTALL_TYPE.UPDATE;
  const target = parseDeckyHubVersion(latestVersion);
  const current = parseDeckyHubVersion(installedVersion);
  for (let i = 0; i < Math.max(target.release.length, current.release.length); i++) {
    const t = target.release[i] || 0, c = current.release[i] || 0;
    if (t !== c) return t > c ? PLUGIN_INSTALL_TYPE.UPDATE : PLUGIN_INSTALL_TYPE.DOWNGRADE;
  }
  const prereleaseCmp = comparePrerelease(target.prerelease, current.prerelease);
  if (prereleaseCmp !== 0) return prereleaseCmp > 0 ? PLUGIN_INSTALL_TYPE.UPDATE : PLUGIN_INSTALL_TYPE.DOWNGRADE;
  return PLUGIN_INSTALL_TYPE.REINSTALL;
}

// window.DeckyBackend is Decky Loader's own internal WS bridge, separate from
// this plugin's `@decky/api` connection (which is scoped to this plugin's own
// backend and cannot reach loader-global routes like `utilities/install_plugin`).
// In Gaming Mode the Quick Access Menu renders in its own popup window opened
// via window.open(), where DeckyBackend lives only on window.opener.
declare global {
  interface Window {
    DeckyBackend?: {
      call<Args extends unknown[] = unknown[], Return = unknown>(route: string, ...args: Args): Promise<Return>;
      addEventListener<Args extends unknown[] = unknown[]>(event: string, listener: (...args: Args) => void): void;
      removeEventListener<Args extends unknown[] = unknown[]>(event: string, listener: (...args: Args) => void): void;
    };
  }
}

export const getDeckyBackend = () => window.DeckyBackend ?? window.opener?.DeckyBackend ?? null;

// Hands a verified release ZIP to Decky Loader's own installer — the route the
// Decky Store uses. The loader shows its native confirm/progress dialog and
// does the download, SHA-256 check and install itself.
export function installDeckyPlugin(asset: Asset, pluginName: string, version: string, installType: 1 | 2 | 3) {
  const backend = getDeckyBackend();
  if (!backend) return Promise.reject(new Error("Decky Loader's installer is unavailable"));
  return backend.call("utilities/install_plugin", asset.url, pluginName, normalizeVersion(version), asset.sha256 ?? "", installType);
}

// Updates-page "Install update" is offered only for installed Decky plugins
// whose newest matching ZIP carries a checksum the loader can verify.
export const canInstallUpdate = (app: App) => Boolean(app.updateAvailable && app.pluginName && app.assets[0]?.sha256);

export function selfUpdateStageKey(key: string | undefined): MessageKey {
  switch ((key ?? "").split(".").pop()) {
    case "start":
      return "settings.selfUpdateStageStart";
    case "download_zip":
    case "increment_count":
      return "settings.selfUpdateStageDownload";
    case "open_zip":
    case "parse_zip":
      return "settings.selfUpdateStageVerify";
    case "uninstalling_previous":
      return "settings.selfUpdateStageRemove";
    case "installing_plugin":
      return "settings.selfUpdateStageInstall";
    default:
      return "settings.selfUpdateStageWorking";
  }
}

function isUpdate(app: App, latest: string | null) {
  if (!app.installedVersion || !latest) return null;
  const installed = versionNumbers(app.installedVersion);
  const target = versionNumbers(latest);
  if (!installed || !target) return null;
  for (let i = 0; i < Math.max(installed.length, target.length); i++) {
    if ((installed[i] || 0) !== (target[i] || 0)) return (installed[i] || 0) < (target[i] || 0);
  }
  return false;
}

export function matchingAssets(app: App, assets: any[], extraInclude: string[] = []): Asset[] {
  const include = [...app.asset.include, ...extraInclude].map((word) => word.toLowerCase());
  const exclude = app.asset.exclude.map((word) => word.toLowerCase());
  return assets
    .filter((asset) => {
      const name = String(asset.name || "").toLowerCase();
      return name.endsWith(".zip") && !exclude.some((word) => name.includes(word)) && (!include.length || include.every((word) => name.includes(word)));
    })
    .map((asset) => ({ name: asset.name, url: asset.browser_download_url, size: asset.size || 0, sha256: String(asset.digest || "").replace(/^sha256:/, "") || undefined }));
}

export function notifyUpdates(apps: App[]) {
  const updates = apps.filter((app) => app.updateAvailable && app.latestVersion);
  const notice = updates.map((app) => `${app.repo}:${app.latestVersion}`).sort().join("|");
  if (!notice || localStorage.getItem(UPDATE_NOTICE_KEY) === notice) return;
  localStorage.setItem(UPDATE_NOTICE_KEY, notice);
  toaster.toast({ title: `${updates.length} update${updates.length === 1 ? "" : "s"} available`, body: updates.map((app) => `${app.name} (${app.latestVersion})`).join(", ") });
}

// GitHub's list-releases endpoint doesn't reliably come back sorted newest
// first — observed in the wild returning a just-published release sandwiched
// in the middle of the array — so every version picker below sorts by
// published date itself instead of trusting response order for "latest".
const byPublishedDesc = (a: { publishedAt: string | null }, b: { publishedAt: string | null }) =>
  (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0);

// Recent DeckyHub releases (stable and pre-release together) for the version
// picker in DeckyHubUpdateModal — lets the user reinstall or downgrade to a
// specific past release, not just install whatever is newest.
export async function listDeckyHubReleases(limit = 20, force = false): Promise<{ items: DeckyHubReleaseOption[]; error?: string }> {
  const cacheKey = `deckyhub-releases:${limit}`;
  const cached = readCache<DeckyHubReleaseOption[]>(cacheKey, force);
  if (cached) return { items: cached };
  try {
    const response = await fetchWithTimeout(`https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=${limit}`, { headers: githubHeaders() });
    if (!response.ok) throw await githubResponseError(response);
    const body = await response.json();
    const items: DeckyHubReleaseOption[] = (Array.isArray(body) ? body : [])
      .filter((item: any) => !item.draft)
      .map((item: any) => {
        const asset = (item.assets || []).find((a: any) => /^DeckyHub-.*\.zip$/i.test(String(a.name)));
        const sha256 = String(asset?.digest || "").replace(/^sha256:/, "");
        const validAsset = asset && String(asset.name).startsWith("DeckyHub-") && /^[0-9a-f]{64}$/i.test(sha256);
        return {
          tag: String(item.tag_name || item.name),
          version: String(item.tag_name || item.name),
          prerelease: Boolean(item.prerelease),
          publishedAt: item.published_at || null,
          url: item.html_url || "https://github.com/mazillka/deckyhub-plugin/releases",
          asset: validAsset ? { name: asset.name, url: asset.browser_download_url, size: asset.size || 0, sha256 } : undefined,
        };
      })
      .sort(byPublishedDesc);
    writeCache(cacheKey, items);
    return { items };
  } catch (error) {
    return { items: [], error: String(error) };
  }
}

// Newest release on the given channel for the QAM "Update" button — reuses
// listDeckyHubReleases() (and its cache) instead of a second GitHub request.
export async function latestDeckyHubRelease(channel: UpdateChannel, force = false): Promise<DeckyHubRelease> {
  const { items, error } = await listDeckyHubReleases(20, force);
  const release = items.find((item) => item.prerelease === (channel === "prerelease"));
  return release?.asset ? { version: release.version, asset: release.asset } : { error: error ?? "DeckyHub release ZIP with SHA-256 checksum not found" };
}

export async function hydrate(app: App, force: boolean, preference?: RepoPreference): Promise<App> {
  const channel: UpdateChannel = preference?.channel ?? "stable";
  try {
    let release = readCache<any>(keyFor(app), force);
    if (!release) {
      const endpoint = preference?.channel === "prerelease" || app.releaseTagInclude ? `/repos/${app.repo}/releases?per_page=20` : `/repos/${app.repo}/releases/latest`;
      const response = await fetchWithTimeout(`https://api.github.com${endpoint}`, { headers: githubHeaders() });
      if (!response.ok) throw await githubResponseError(response);
      const body = await response.json();
      // GitHub's list-releases response isn't reliably ordered newest-first
      // (see byPublishedDesc above), so pick the newest match by published
      // date rather than trusting which one comes first in the array.
      const byRawPublishedDesc = (a: any, b: any) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0);
      release = Array.isArray(body)
        ? preference?.channel === "prerelease"
          ? body.filter((item) => item.prerelease && !item.draft).sort(byRawPublishedDesc)[0]
          : body.filter((item) => String(item.tag_name || "").toLowerCase().includes(app.releaseTagInclude!.toLowerCase())).sort(byRawPublishedDesc)[0]
        : body;
      if (!release) throw new Error("No matching release found");
      writeCache(keyFor(app), release);
    }
    const latestVersion = release.tag_name || release.name || null;
    const publishedAt = release.published_at || null;
    return {
      ...app,
      channel,
      latestVersion,
      publishedAt,
      releaseUrl: release.html_url || `https://github.com/${app.repo}/releases`,
      assets: matchingAssets(app, release.assets || [], preference?.assetFilter),
      updateAvailable: isUpdate(app, latestVersion),
    };
  } catch (error) {
    return { ...app, channel, error: String(error) };
  }
}

// Recent releases for a tracked app's own version picker (AppDetailsModal) —
// unlike hydrate()'s single "current release" fetch, this returns the last
// ~20 so the user can pick a specific past version to download, not just
// whatever's newest.
export async function listAppReleases(app: App, preference?: RepoPreference, force = false): Promise<{ items: AppReleaseOption[]; error?: string }> {
  const cacheKey = `deckyhub-app-releases:${app.repo}:${app.source}`;
  const cached = readCache<AppReleaseOption[]>(cacheKey, force);
  if (cached) return { items: cached };
  try {
    const response = await fetchWithTimeout(`https://api.github.com/repos/${app.repo}/releases?per_page=20`, { headers: githubHeaders() });
    if (!response.ok) throw await githubResponseError(response);
    const body = await response.json();
    const items: AppReleaseOption[] = (Array.isArray(body) ? body : [])
      .filter((item: any) => !item.draft)
      .filter((item: any) => !app.releaseTagInclude || String(item.tag_name || item.name || "").toLowerCase().includes(app.releaseTagInclude!.toLowerCase()))
      .map((item: any) => ({
        tag: String(item.tag_name || item.name),
        version: String(item.tag_name || item.name),
        prerelease: Boolean(item.prerelease),
        publishedAt: item.published_at || null,
        url: item.html_url || `https://github.com/${app.repo}/releases`,
        assets: matchingAssets(app, item.assets || [], preference?.assetFilter),
      }))
      .sort(byPublishedDesc);
    writeCache(cacheKey, items);
    return { items };
  } catch (error) {
    return { items: [], error: String(error) };
  }
}
