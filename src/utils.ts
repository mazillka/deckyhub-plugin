import { fetchNoCors, toaster } from "@decky/api";
import type { MessageKey } from "./i18n/en";
import type { App, Asset, DeckyHubRelease, RepoPreference, UpdateChannel } from "./types";

export const CACHE_TTL = 60 * 1000;
export const UPDATE_NOTICE_KEY = "deckyhub-update-notice";
export const pageStyle = { boxSizing: "border-box" as const, height: "calc(100vh - 192px)", margin: "96px 0 96px", overflowY: "auto" as const, padding: "8px 12px 12px", width: "100%" };

export const readableBytes = (bytes = 0) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

export const statusKey = (app: App): MessageKey =>
  !app.installedVersion ? "filter.notInstalled" : app.updateAvailable ? "status.updateAvailable" : app.updateAvailable === false ? "status.upToDate" : "filter.installed";

export const statusColor = (app: App) => (app.error ? "#ff6b6b" : app.updateAvailable ? "#f0c33c" : app.updateAvailable === false ? "#6bcb6b" : undefined);

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
    const response = await fetchNoCors(`https://api.github.com/repos/mazillka/deckyhub-plugin/${endpoint}`, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
    const body = await response.json();
    const release = Array.isArray(body) ? body.find((item) => item.prerelease && !item.draft) : body;
    const asset = (release?.assets || []).find((item: any) => /^DeckyHub-.*\.zip$/i.test(String(item.name)));
    const sha256 = String(asset?.digest || "").replace(/^sha256:/, "");
    if (!asset || !String(asset.name).startsWith("DeckyHub-") || !/^[0-9a-f]{64}$/i.test(sha256)) throw new Error("DeckyHub release ZIP with SHA-256 checksum not found");
    return { version: release.tag_name || release.name, url: release.html_url, asset: { name: asset.name, url: asset.browser_download_url, size: asset.size || 0, sha256 } };
  } catch (error) {
    return { error: String(error) };
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
      const response = await fetchNoCors(`https://api.github.com${endpoint}`, { headers: { Accept: "application/vnd.github+json" } });
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
