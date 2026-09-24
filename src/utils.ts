import { fetchNoCors, toaster } from "@decky/api";
import type { MessageKey } from "./i18n/en";
import type { App, Asset, DeckyHubRelease, DeckyHubReleaseOption, RepoPreference, UpdateChannel } from "./types";

export const CACHE_TTL = 60 * 1000;
export const UPDATE_NOTICE_KEY = "deckyhub-update-notice";
export const DEFAULT_COLUMNS_PER_ROW = 3;
export const pageStyle = { boxSizing: "border-box" as const, height: "100%", overflowY: "auto" as const, padding: "64px 12px 96px", scrollPaddingBottom: 96, scrollPaddingTop: 64, width: "100%" };
export const compactButtonStyle = { width: "100%", minHeight: 36, marginBottom: 8, padding: "6px 10px" };
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

export const readableBytes = (bytes = 0) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

export const statusKey = (app: App): MessageKey =>
  !app.installedVersion ? "filter.notInstalled" : app.updateAvailable ? "status.updateAvailable" : app.updateAvailable === false ? "status.upToDate" : "filter.installed";

export const statusColor = (app: App) => (!app.installedVersion || app.error ? "#ff6b6b" : app.updateAvailable ? "#f0c33c" : app.updateAvailable === false ? "#6bcb6b" : undefined);

const keyFor = (app: App) => `deckyhub-release:${app.repo}:${app.source}`;

function cached(app: App, force: boolean): any | null {
  if (force) return null;
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(app)) || "null");
    return value && Date.now() - value.at < CACHE_TTL ? value.data : null;
  } catch {
    return null;
  }
}

function versionNumbers(value: string, pattern?: string) {
  const match = pattern ? value.match(new RegExp(pattern, "i")) : value.match(/v?(\d+(?:\.\d+)+)/i);
  return match ? (match[1] || match[0]).replace(/^v/i, "").split(".").map(Number) : null;
}

export const normalizeVersion = (value: string) => value.trim().replace(/^v/i, "");

// Decky Loader's PluginInstallType enum (backend enums.py) — passed to the
// global `utilities/install_plugin` route to tell its native installer what
// kind of operation this is.
export const PLUGIN_INSTALL_TYPE = { REINSTALL: 1, UPDATE: 2, DOWNGRADE: 3 } as const;

export function resolveDeckyHubInstallType(latestVersion: string, installedVersion: string): 1 | 2 | 3 {
  const target = versionNumbers(latestVersion);
  const current = installedVersion === "unknown" ? null : versionNumbers(installedVersion);
  if (!target || !current) return PLUGIN_INSTALL_TYPE.UPDATE;
  for (let i = 0; i < Math.max(target.length, current.length); i++) {
    const t = target[i] || 0, c = current[i] || 0;
    if (t !== c) return t > c ? PLUGIN_INSTALL_TYPE.UPDATE : PLUGIN_INSTALL_TYPE.DOWNGRADE;
  }
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

function isUpdate(app: App, latest: string | null, publishedAt: string | null) {
  if (!app.installedVersion || (!latest && !publishedAt)) return null;
  if (app.versionStrategy === "release-date")
    return publishedAt && !Number.isNaN(Date.parse(app.installedVersion)) ? Date.parse(app.installedVersion) < Date.parse(publishedAt) : null;
  const installed = versionNumbers(app.installedVersion, app.versionStrategy === "custom" ? app.versionPattern : undefined);
  const target = latest ? versionNumbers(latest, app.versionStrategy === "custom" ? app.versionPattern : undefined) : null;
  if (!installed || !target) return null;
  for (let i = 0; i < Math.max(installed.length, target.length); i++) {
    if ((installed[i] || 0) !== (target[i] || 0)) return (installed[i] || 0) < (target[i] || 0);
  }
  return false;
}

function matchingAssets(app: App, assets: any[], extraInclude: string[] = []): Asset[] {
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

export async function latestDeckyHubRelease(channel: UpdateChannel): Promise<DeckyHubRelease> {
  try {
    const endpoint = channel === "prerelease" ? "releases?per_page=20" : "releases/latest";
    const response = await fetchWithTimeout(`https://api.github.com/repos/mazillka/deckyhub-plugin/${endpoint}`, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
    const body = await response.json();
    const release = Array.isArray(body)
      ? body.filter((item) => item.prerelease && !item.draft).sort(
        (a, b) => (Date.parse(String(b.published_at)) || 0) - (Date.parse(String(a.published_at)) || 0),
      )[0]
      : body;
    const asset = (release?.assets || []).find((item: any) => /^DeckyHub-.*\.zip$/i.test(String(item.name)));
    const sha256 = String(asset?.digest || "").replace(/^sha256:/, "");
    if (!asset || !String(asset.name).startsWith("DeckyHub-") || !/^[0-9a-f]{64}$/i.test(sha256)) throw new Error("DeckyHub release ZIP with SHA-256 checksum not found");
    return { version: release.tag_name || release.name, url: release.html_url, asset: { name: asset.name, url: asset.browser_download_url, size: asset.size || 0, sha256 } };
  } catch (error) {
    return { error: String(error) };
  }
}

// Recent DeckyHub releases (stable and pre-release together) for the version
// picker in DeckyHubUpdateModal — lets the user reinstall or downgrade to a
// specific past release, not just install whatever is newest.
export async function listDeckyHubReleases(limit = 20): Promise<{ items: DeckyHubReleaseOption[]; error?: string }> {
  try {
    const response = await fetchWithTimeout(`https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=${limit}`, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
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
          url: item.html_url || "https://github.com/mazillka/deckyhub-plugin/releases",
          asset: validAsset ? { name: asset.name, url: asset.browser_download_url, size: asset.size || 0, sha256 } : undefined,
        };
      });
    return { items };
  } catch (error) {
    return { items: [], error: String(error) };
  }
}

export async function hydrate(app: App, force: boolean, preference?: RepoPreference): Promise<App> {
  try {
    let release = cached(app, force);
    if (!release) {
      const endpoint =
        app.source === "tags"
          ? `/repos/${app.repo}/tags?per_page=1`
          : preference?.channel === "prerelease" || app.releaseTagInclude
          ? `/repos/${app.repo}/releases?per_page=20`
          : `/repos/${app.repo}/releases/latest`;
      const response = await fetchWithTimeout(`https://api.github.com${endpoint}`, { headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
      const body = await response.json();
      release = Array.isArray(body)
        ? preference?.channel === "prerelease"
          ? body.find((item) => item.prerelease && !item.draft)
          : app.releaseTagInclude
          ? body.find((item) => String(item.tag_name || "").toLowerCase().includes(app.releaseTagInclude!.toLowerCase()))
          : { tag_name: body[0]?.name, html_url: `https://github.com/${app.repo}/releases`, assets: [] }
        : body;
      if (!release) throw new Error("No matching release found");
      localStorage.setItem(keyFor(app), JSON.stringify({ at: Date.now(), data: release }));
    }
    const latestVersion = release.tag_name || release.name || null;
    const publishedAt = release.published_at || null;
    return {
      ...app,
      latestVersion,
      publishedAt,
      releaseUrl: release.html_url || `https://github.com/${app.repo}/releases`,
      assets: matchingAssets(app, release.assets || [], preference?.assetFilter),
      updateAvailable: isUpdate(app, latestVersion, publishedAt),
    };
  } catch (error) {
    return { ...app, error: String(error) };
  }
}
