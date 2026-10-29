import { fetchNoCors, toaster } from "@decky/api";
import { getSettings, logFrontend, stageInstall } from "./api";
import { showInstallDownloadModal } from "./components/DownloadProgress";
import { en, type MessageKey, type TFunc } from "./i18n/en";
import type { App, AppReleaseOption, Asset, DeckyHubRelease, DeckyHubReleaseOption, PluginStats, RepoPreference, UpdateChannel } from "./types";
import { compareVersions, displayVersion, inChannel, normalizeVersion } from "./version";

// GitHub's unauthenticated core API allows 60 requests/hour per IP, easy to
// burn through when Discover/Updates check every tracked app. Release lists
// are cached for 30 minutes (one shared entry per repo, see fetchReleases);
// every cache read is bypassed by force=true wherever the user explicitly asks
// to check (Refresh, Check for Updates).
const CACHE_TTL = 30 * 60 * 1000;
const UPDATE_NOTICE_KEY = "deckyhub-update-notice";
export const DEFAULT_COLUMNS_PER_ROW = 3;
export const pageStyle = { boxSizing: "border-box" as const, height: "100%", overflowY: "auto" as const, padding: "64px 12px 96px", scrollPaddingBottom: 96, scrollPaddingTop: 64, width: "100%" };
// Sizes read CSS variables that fall back to the Default density; the Compact
// setting overrides them on the page root (see applyDensity).
// Centers an icon and its label on one line, whatever the button's width.
export const iconRow = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8 } as const;
// minWidth 0: Steam's DialogButton has a minimum width of its own, which pushed a
// narrow button (the Manage gear) over its neighbour in side-by-side rows on a Deck.
export const compactButtonStyle = { ...iconRow, width: "100%", minWidth: 0, minHeight: "var(--dh-button-height, 40px)", marginBottom: "var(--dh-button-gap, 8px)", padding: "var(--dh-button-padding, 6px 10px)" };
export const modalButtonStyle = { ...compactButtonStyle, marginBottom: 0 };
export const sectionDividerStyle = { borderTop: "1px solid rgba(255, 255, 255, 0.14)", margin: "var(--dh-divider-margin, 16px) 0" };
// Text screen readers (and tests) still read, e.g. an icon-only button's label.
export const visuallyHidden = { position: "absolute" as const, width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" as const };
export const windowGap = "var(--dh-window-gap, 10px)";
export const gridGap = "var(--dh-grid-gap, 12px)";
// The tile every card and section is drawn on (see Card and AppCard).
// Same no-responsibility note the install confirm shows, kept in view on the Updates, Discover and Search pages.
export const disclaimerStyle = { marginBottom: "var(--dh-card-gap, 14px)", padding: "8px 12px", color: "#ffb3b3", fontSize: "max(12px, 0.85em)", background: "rgba(255, 107, 107, 0.08)", borderLeft: "3px solid #ff6b6b", borderRadius: 6 };

export const surfaceStyle = {
  background: "linear-gradient(160deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02))",
  border: "1px solid rgba(255, 255, 255, 0.09)",
  borderRadius: 8,
  boxSizing: "border-box" as const,
};

const COMPACT_SIZES: Record<string, string> = {
  "--dh-button-height": "28px",
  "--dh-button-padding": "2px 10px",
  "--dh-button-gap": "4px",
  "--dh-divider-margin": "8px",
  "--dh-window-gap": "6px",
  "--dh-grid-gap": "8px",
  "--dh-card-gap": "8px",
  "--dh-card-padding": "0 10px",
};

// Applies Display Settings' density to this window and, in Gaming Mode, to the
// main window the Quick Access popup was opened from (where modals render).
export function applyDensity(density: string) {
  let opener: Document | undefined;
  try {
    opener = window.opener?.document;
  } catch {
    // A cross-origin opener isn't ours to style.
  }
  for (const root of [document.documentElement, opener?.documentElement]) {
    if (!root) continue;
    for (const [name, value] of Object.entries(COMPACT_SIZES)) {
      if (density === "compact") root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    }
  }
}
// Reserves a fixed two-line height so cards in the same grid row stay aligned regardless of description length.
export const cardDescriptionStyle = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden",
  minHeight: "2.6em",
  lineHeight: "1.3em",
};

export function substitute(template: string, vars?: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, name) => String(vars?.[name] ?? match));
}

// Messages built outside any component tree (GitHub errors, the updates
// toast) use the locale I18nProvider last resolved — English until then.
let tr: TFunc = (key, vars) => substitute(en[key], vars);

export function setTranslator(t: TFunc) {
  tr = t;
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

// No headers unless a token is set: any header makes fetchNoCors a CORS
// preflight to Decky Loader, and on a real Deck those preflights have been
// seen to stall forever (loader never reads them; Chrome's 6-socket pool for
// them fills up), hanging every GitHub call until its timeout. GitHub's
// default response is the same JSON the vnd.github+json Accept asked for.
function githubHeaders(): Record<string, string> {
  return githubToken ? { Authorization: `Bearer ${githubToken}` } : {};
}

// React runs a child's effects before its parent's, so the first GitHub call
// on a route fires before I18nProvider has loaded the saved token. Wait for
// it once here instead of spending that call unauthenticated.
let tokenLoaded: Promise<void> | null = null;

export async function githubFetch(url: string) {
  // A failed settings read is retried on the next call rather than kept.
  tokenLoaded ??= getSettings().then((settings) => setGithubToken(settings.githubToken || ""), () => {
    tokenLoaded = null;
  });
  await tokenLoaded;
  return fetchNoCors(url, { headers: githubHeaders(), signal: AbortSignal.timeout(15_000) });
}

// GitHub's REST API is what every fetch in this file hits — unauthenticated
// by default, so a 403/429 here is almost always its rate limit (60 req/hr
// for the core API, 10/min for search; 5,000/hr and 30/min once a token is
// set), not a real access error. The raw "GitHub API returned 403" that
// used to surface gave no indication of that, so pull whatever wait-time
// hint the response actually offers (some responses omit these headers
// entirely — that's fine, the message just degrades to a generic one)
// instead of guessing, and nudge toward adding a token when none is set.
// Writes to DeckyHub's backend log (see Export Logs); never throws.
export const log = (message: string) => void logFrontend(message).catch(() => undefined);

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

export const readableBytes = (bytes = 0) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

// Where a registry lives by convention: registry/apps.json on the default branch
// (raw.githubusercontent.com resolves HEAD to it), via GitHub's raw-content host.
// The Manage page takes "owner/repo" and expands it to this, so adding a registry
// whose source is a GitHub repo is one short field.
export const registryUrlForRepo = (repo: string) => `https://raw.githubusercontent.com/${repo.trim()}/HEAD/registry/apps.json`;

// Same rule as REPOSITORY_NAME in main.py: neither part may be only dots.
const REPOSITORY_PATTERN = /^(?!\.+\/)[A-Za-z0-9_.-]+\/(?!\.+$)[A-Za-z0-9_.-]+$/;

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

export const statusKey = (app: App): MessageKey =>
  !app.installedVersion ? "filter.notInstalled" : app.updateAvailable ? "status.updateAvailable" : app.updateAvailable === false ? "status.upToDate" : "filter.installed";

export const statusColor = (app: App) => (app.error ? "#ff6b6b" : !app.installedVersion ? "#8b929a" : app.updateAvailable ? "#f0c33c" : app.updateAvailable === false ? "#6bcb6b" : undefined);

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
    if (key.startsWith(RELEASES_CACHE_PREFIX) && !(Date.now() - (readCache(key)?.at ?? 0) < CACHE_MAX_AGE)) localStorage.removeItem(key);
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

// Shared by both version pickers: label each release with "v" plus
// an "(installed)"/"(latest)" suffix — items[0] is the newest since every
// release-list fetch above sorts by publish date before returning.
export function buildVersionOptions<T extends { tag: string }>(items: T[], installedVersion: string | null | undefined, t: TFunc): { data: string; label: string }[] {
  return items.map((item) => {
    const version = normalizeVersion(item.tag);
    const isInstalled = Boolean(installedVersion) && version === normalizeVersion(installedVersion!);
    const isLatest = items[0]?.tag === item.tag;
    const suffix = isInstalled ? ` (${t("settings.installedLabel")})` : isLatest ? ` (${t("settings.latestLabel")})` : "";
    return { data: item.tag, label: `${displayVersion(item.tag)}${suffix}` };
  });
}

// Decky Loader's PluginInstallType enum (backend enums.py) — passed to the
// global `utilities/install_plugin` route to tell its native installer what
// kind of operation this is.
export const PLUGIN_INSTALL_TYPE = { INSTALL: 0, REINSTALL: 1, UPDATE: 2, DOWNGRADE: 3 } as const;

export function resolveDeckyHubInstallType(latestVersion: string, installedVersion: string): 1 | 2 | 3 {
  const cmp = compareVersions(latestVersion, installedVersion) ?? 1;
  return cmp > 0 ? PLUGIN_INSTALL_TYPE.UPDATE : cmp < 0 ? PLUGIN_INSTALL_TYPE.DOWNGRADE : PLUGIN_INSTALL_TYPE.REINSTALL;
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
    // Decky Loader's frontend plugin loader; importPlugin() unloads a plugin and loads its current dist.
    DeckyPluginLoader?: { importPlugin(name: string): Promise<void> };
  }
}

export const getDeckyBackend = () => window.DeckyBackend ?? window.opener?.DeckyBackend ?? null;

// The tick Steam itself plays when its trackpad cursor moves onto a new element:
// TriggerSimpleHapticEvent(controller, 2 = both pads, 1 = Tick, intensity 1, gain 0),
// on the Deck's built-in controller (type 4) only. Played as focus moves within
// DeckyHub (Motion in index.tsx), unless Display Settings turns it off.
let hapticsOn = true;
let deckController: number | undefined;
let controllerList: { unregister: () => void } | null = null;
let lastTick = 0;
export const setHaptics = (on: boolean) => {
  hapticsOn = on;
};
export function hapticTick() {
  const input = (window as any).SteamClient?.Input;
  // One tick per move: a focus change can fire several focus events at once.
  if (!hapticsOn || !input || Date.now() - lastTick < 40) return;
  try {
    controllerList ??= input.RegisterForControllerListChanges((controllers: { eControllerType: number; nControllerIndex: number }[]) => {
      deckController = controllers.find((controller) => controller.eControllerType === 4)?.nControllerIndex;
    });
    if (deckController === undefined) return;
    lastTick = Date.now();
    input.TriggerSimpleHapticEvent(deckController, 2, 1, 1, 0);
  } catch (error) {
    log(`Haptic tick failed: ${error}`);
    hapticsOn = false;
  }
}

// Set by this copy's onDismount (src/index.tsx). Each load of DeckyHub is a
// fresh module, so after a self-update only the old copy still sees false.
let unloaded = false;
export const markUnloaded = () => {
  unloaded = true;
  controllerList?.unregister();
  controllerList = null;
};

// Decky Loader reloads DeckyHub itself once its update is installed. If this
// old copy is still mounted after Decky's own 15 s load timeout, that reload
// didn't happen, so ask Decky's plugin loader for the new copy directly.
function reloadIfStillOld() {
  window.setTimeout(() => {
    if (unloaded) return;
    log("DeckyHub was not reloaded after its update; asking Decky Loader to load the new version");
    void (window.DeckyPluginLoader ?? window.opener?.DeckyPluginLoader)?.importPlugin("DeckyHub");
  }, 15_000);
}

// Hands a release ZIP to Decky Loader's own installer — the route the Decky
// Store uses. The loader shows its native confirm/progress dialog and does the
// SHA-256 check and install itself. DeckyHub's backend downloads the ZIP first
// (stage_install in main.py: Decky's own download of a GitHub URL can hang) and
// Decky reads it as file://.
//
// Plugins that are uninstalled first and then installed fresh instead of
// updated in place. Decky Loader's in-place update uninstalls the old version
// mid-install, which turns its file watcher back on: the watcher starts the new
// version while it's still being installed, and the installer then stops that
// copy seconds into its startup. Unifideck hangs there, and Decky grew to 9.6 GB
// and froze the Deck. A fresh install keeps the watcher off throughout.
const FRESH_INSTALL_PLUGINS = ["Unifideck"];

export const needsFreshInstall = (pluginName: string, installType: number) => installType !== PLUGIN_INSTALL_TYPE.INSTALL && FRESH_INSTALL_PLUGINS.includes(pluginName);

// Its progress window stays open, spinning once the ZIP is in, until `handedOver`
// settles (Decky's dialog is up, or it failed); without one, until it's staged.
async function localZip(asset: Asset, repo: string, handedOver?: Promise<void>) {
  const jobId = `install-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const staged = stageInstall(asset, repo, jobId);
  showInstallDownloadModal(tr, jobId, asset.name, asset.size, handedOver ?? staged);
  const { path, error } = await staged;
  if (!path) throw new Error(error);
  return `file://${path}`;
}

// A promise and the function that settles it, for localZip's handedOver.
function handOff() {
  let done = () => {};
  const handedOver = new Promise<void>((resolve) => (done = resolve));
  return { handedOver, done };
}

export async function installDeckyPlugin(asset: Asset, repo: string, pluginName: string, version: string, installType: 0 | 1 | 2 | 3) {
  const { handedOver, done } = handOff();
  try {
    // Before any uninstall, so a failed download leaves the plugin as it was.
    const artifact = await localZip(asset, repo, handedOver);
    if (needsFreshInstall(pluginName, installType)) {
      await uninstallDeckyPlugin(pluginName);
      log(`Decky Loader uninstalled ${pluginName} before a fresh install`);
      installType = PLUGIN_INSTALL_TYPE.INSTALL;
    }
    traceDeckyInstall(pluginName);
    const result = await callDeckyLoader("utilities/install_plugin", artifact, pluginName, normalizeVersion(displayVersion(version)), asset.sha256 ?? "", installType);
    log(`Decky Loader install_plugin ${pluginName} accepted, waiting for confirm/progress`);
    return result;
  } finally {
    done();
  }
}

// Several updates in one go: Decky Loader shows one confirm dialog listing them
// all and installs them in order. Fresh-install plugins need their uninstall
// first, so callers leave them out.
export async function updateDeckyPlugins(updates: { asset: Asset; repo: string; name: string; version: string }[]) {
  // One at a time, so a single progress window shows at once; the last one
  // stays up until Decky's dialog is.
  const { handedOver, done } = handOff();
  try {
    const artifacts: string[] = [];
    for (const [index, { asset, repo }] of updates.entries()) artifacts.push(await localZip(asset, repo, index === updates.length - 1 ? handedOver : undefined));
    return await callDeckyLoader(
      "utilities/install_plugins",
      updates.map(({ asset, name, version }, index) => ({ artifact: artifacts[index], name, version: normalizeVersion(displayVersion(version)), hash: asset.sha256 ?? "", install_type: PLUGIN_INSTALL_TYPE.UPDATE })),
    );
  } finally {
    done();
  }
}

// Logs every stage Decky Loader reports for this install, with elapsed time,
// so deckyhub.log shows where a stuck install stopped. Decky's progress events
// carry no plugin name, so all of them are logged while this one is watched.
function traceDeckyInstall(pluginName: string) {
  const backend = getDeckyBackend();
  if (!backend) return;
  const started = Date.now();
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
  // Decky can fail an install without ever sending finish (e.g. a remote_binary
  // download error leaves it at 95%), so warn once its events go quiet.
  // Remote binaries download with no progress events, so that stage gets longer.
  let idleTimer = 0;
  const armIdle = (stage?: string) => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      log(`Decky install ${pluginName}: no progress after ${elapsed()} — check journalctl -u plugin_loader`);
      toaster.toast({ title: tr("toast.installStalledTitle", { name: pluginName }), body: tr("toast.installStalledBody") });
      stop();
    }, stage?.endsWith("download_remote") ? 120_000 : 45_000);
  };
  const onStart = (name: string) => {
    log(`Decky install start ${name} at ${elapsed()}`);
    if (name === pluginName) armIdle();
  };
  const onInfo = (progress: number, stage: string) => {
    log(`Decky install ${pluginName} ${progress}% ${stage} at ${elapsed()}`);
    armIdle(stage);
  };
  const stop = () => {
    window.clearTimeout(timer);
    window.clearTimeout(idleTimer);
    backend.removeEventListener("loader/plugin_download_start", onStart);
    backend.removeEventListener("loader/plugin_download_info", onInfo);
    backend.removeEventListener("loader/plugin_download_finish", onFinish);
  };
  const onFinish = (name: string) => {
    log(`Decky install finish ${name} at ${elapsed()}`);
    if (name !== pluginName) return;
    stop();
    if (name === "DeckyHub") reloadIfStillOld();
  };
  // Backstop: Decky never sends finish after a silent failure.
  const timer = window.setTimeout(() => {
    log(`Decky install ${pluginName}: no finish after ${elapsed()} — check journalctl -u plugin_loader`);
    stop();
  }, 10 * 60 * 1000);
  backend.addEventListener("loader/plugin_download_start", onStart);
  backend.addEventListener("loader/plugin_download_info", onInfo);
  backend.addEventListener("loader/plugin_download_finish", onFinish);
}

// Decky Loader's uninstall deletes the plugin's folder and its settings right
// away, with no dialog of its own — callers must confirm first.
export function uninstallDeckyPlugin(pluginName: string) {
  return callDeckyLoader("utilities/uninstall_plugin", pluginName);
}

function callDeckyLoader(route: string, ...args: unknown[]) {
  const backend = getDeckyBackend();
  log(`Decky Loader ${route} ${JSON.stringify(args)}${backend ? "" : " (loader unavailable)"}`);
  if (!backend) return Promise.reject(new Error(tr("error.loaderUnavailable")));
  return backend.call(route, ...args).catch((error: unknown) => {
    log(`Decky Loader ${route} failed: ${error}`);
    throw error;
  });
}

// The name in a repo's root plugin.json (every Decky plugin has one), or null. Read
// from raw.githubusercontent.com, which doesn't count against the GitHub API limit;
// header-less, so no CORS preflight (see githubHeaders()).
// ponytail: root only, so a monorepo plugin (MAKO keeps it in a subfolder) is found only once it's in a list.
export const manifestName = (repo: string): Promise<string | null> =>
  fetchNoCors(`https://raw.githubusercontent.com/${repo}/HEAD/plugin.json`, { signal: AbortSignal.timeout(10_000) })
    .then((response) => (response.ok ? response.json() : null))
    .then((manifest) => (typeof manifest?.name === "string" ? manifest.name : null), () => null);

// What the Manage window can hand to Decky Loader's installer for the selected
// release, if anything: "Update" for an installed Decky plugin when
// the release is newer, "Install" for a registry Decky plugin that isn't
// installed yet. A fresh install has no installed manifest to name it, so it
// uses the detection rule's first name (the plugin's manifest name).
// Releases without a GitHub checksum (assets uploaded before mid-2025) can
// still be installed; Decky Loader skips verification for an empty hash.
export function installAction(app: App, release: { tag: string; assets: Asset[] }): { type: 0 | 1 | 2 | 3; name: string } | null {
  if (!release.assets[0]) return null;
  if (app.pluginName) return { type: resolveDeckyHubInstallType(release.tag, app.installedVersion ?? ""), name: app.pluginName };
  if (!app.installedVersion && app.detect?.type === "decky-plugin") return { type: PLUGIN_INSTALL_TYPE.INSTALL, name: app.detect.names?.[0] ?? app.name };
  return null;
}

export function installTypeLabel(t: TFunc, type: number, version: string, updateLabel = t("settings.updateTo", { version })) {
  return type === PLUGIN_INSTALL_TYPE.INSTALL
    ? t("appcard.installVersion", { version })
    : type === PLUGIN_INSTALL_TYPE.REINSTALL
    ? t("settings.reinstallTo", { version })
    : type === PLUGIN_INSTALL_TYPE.DOWNGRADE
    ? t("settings.downgradeTo", { version })
    : updateLabel;
}

function matchingAssets(app: App, assets: Asset[]): Asset[] {
  const include = app.asset.include.map((word) => word.toLowerCase());
  const exclude = app.asset.exclude.map((word) => word.toLowerCase());
  return assets.filter((asset) => {
    const name = asset.name.toLowerCase();
    return name.endsWith(".zip") && !exclude.some((word) => name.includes(word)) && (!include.length || include.every((word) => name.includes(word)));
  });
}

// True the first time `value` is seen under `key`, so a toast shows once per
// update. Without storage it's always true: the toast just repeats next time.
export function seenOnce(key: string, value: string) {
  try {
    if (localStorage.getItem(key) === value) return false;
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable.
  }
  return true;
}

export function notifyUpdates(apps: App[]) {
  const updates = apps.filter((app) => app.updateAvailable && app.latestVersion);
  const notice = updates.map((app) => `${app.repo}:${app.latestVersion}`).sort().join("|");
  if (!notice || !seenOnce(UPDATE_NOTICE_KEY, notice)) return;
  toaster.toast({ title: tr("toast.updatesAvailable", { count: updates.length }), body: updates.map((app) => `${app.name} (${app.latestVersion})`).join(", ") });
}

// A repo's recent non-draft releases with every asset, newest first — the one
// GitHub fetch behind the cards (hydrate), both version pickers and DeckyHub's
// own update check, cached per repo so they share it. Callers apply their own
// tag/asset filters on top, so a changed filter never serves stale results.
// GitHub's list endpoint isn't reliably sorted newest-first (a just-published
// release has been seen mid-array), so sort by published date here.
type Release = { tag: string; prerelease: boolean; publishedAt: string | null; url: string; notes?: string; assets: Asset[] };

// Lookups for the same repo that overlap share one request.
const inFlight = new Map<string, Promise<Release[]>>();

function fetchReleases(repo: string, force: boolean): Promise<Release[]> {
  const key = `${repo}:${force}`;
  let request = inFlight.get(key);
  if (!request) {
    request = requestReleases(repo, force).finally(() => inFlight.delete(key));
    inFlight.set(key, request);
  }
  return request;
}

// mazillka/deckyhub-registry publishes every listed repo's recent releases (and
// DeckyHub's own) as one file every 30 minutes (scripts/build_release_index.py there).
// It's read from raw.githubusercontent.com, outside the API's 60-an-hour limit
// that one call per listed repo would use up, so the API is asked only for repos
// the file lacks (added repos and registries). Header-less, so no CORS preflight.
const RELEASE_INDEX_URL = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/release-index/releases.json";
// An index this old means its job stopped publishing; ask GitHub instead. Generous on
// purpose: GitHub skips scheduled runs for hours at a time, and a list of 300+ plugins
// can't be asked of the API at 60 requests an hour, so a day-old index beats none.
const RELEASE_INDEX_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// One of the registry's raw files, downloaded once and shared by every caller for
// CACHE_TTL. A forced refresh downloads it again, unless one started in the last
// minute (every card of one Refresh shares it). `pick` turns the file into what
// callers get, and its fallback stands in for a missing or broken file.
function cachedRawJson<T>(url: string, pick: (data: any) => T, fallback: T) {
  let cached: { at: number; request: Promise<T> } | null = null;
  return (force = false) => {
    if (!cached || Date.now() - cached.at > (force ? 60_000 : CACHE_TTL)) {
      cached = {
        at: Date.now(),
        request: fetchNoCors(url, { signal: AbortSignal.timeout(15_000) })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => (data ? pick(data) : fallback))
          .catch((error: unknown) => {
            log(`${url} unavailable: ${error}`);
            return fallback;
          }),
      };
    }
    return cached.request;
  };
}

const fetchReleaseIndex = cachedRawJson<Record<string, unknown[]> | null>(
  RELEASE_INDEX_URL,
  (index) => (Date.now() - Date.parse(index.generatedAt) < RELEASE_INDEX_MAX_AGE ? index.releases : null),
  null,
);

// Each listed plugin's stats (see PluginStats), published next to the release
// index by the same job. Only Discover uses it, so a missing file just leaves them out.
export const fetchPluginStats = cachedRawJson<Record<string, PluginStats>>(
  "https://raw.githubusercontent.com/mazillka/deckyhub-registry/release-index/stats.json",
  (stats) => stats.plugins ?? {},
  {},
);

// "2 days ago", "3 months ago": how long ago a card's plugin was last released.
export function timeAgo(time: number) {
  const days = Math.round((time - Date.now()) / 86_400_000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return Math.abs(days) < 31 ? format.format(days, "day") : Math.abs(days) < 365 ? format.format(Math.round(days / 30), "month") : format.format(Math.round(days / 365), "year");
}

// Download and star counts on cards: "1.2K", in the reader's locale.
export const compactNumber = (value: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);

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
function listOrError<T>(items: Promise<T[]>): Promise<{ items: T[]; error?: string }> {
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
