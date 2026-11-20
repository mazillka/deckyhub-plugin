import { backupPluginSettings, getSettings, stageInstall } from "./api";
import { showInstallDownloadModal } from "./components/DownloadProgress";
import { stopHaptics } from "./haptics";
import { type TFunc } from "./i18n/en";
import { log } from "./log";
import { tr } from "./translate";
import { type App, type Asset } from "./types";
import { compareVersions, displayVersion, normalizeVersion, releaseVersion } from "./version";
import { toaster } from "@decky/api";
import { callDeckyLoader, getDeckyBackend } from "./deckyLoader";
import { confirmDeckyPrompt, traceDeckyInstall } from "./deckyInstallEvents";

// Shared by both version pickers: label each release with "v" plus
// an "(installed)"/"(latest)" suffix — items[0] is the newest since every
// release-list fetch above sorts by publish date before returning.
export function buildVersionOptions<T extends { tag: string; pluginVersion?: string }>(
  items: T[],
  installedVersion: string | null | undefined,
  t: TFunc,
): { data: string; label: string }[] {
  return items.map((item) => {
    const cmp = installedVersion ? compareVersions(releaseVersion(item), installedVersion) : null;
    const isInstalled =
      Boolean(installedVersion) &&
      (cmp === null ? normalizeVersion(item.tag) === normalizeVersion(installedVersion!) : cmp === 0);
    const isLatest = items[0]?.tag === item.tag;
    const suffix = isInstalled
      ? ` (${t("settings.installedLabel")})`
      : isLatest
        ? ` (${t("settings.latestLabel")})`
        : "";
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

// Saves the plugin's settings first (backups.py), unless turned off in Settings: Decky deletes a removed
// plugin's settings, and a bad update can spoil them. Whatever goes wrong here never stops the change itself.
async function backUpFirst(...names: string[]) {
  try {
    if ((await getSettings()).backupBeforeChange === false) return;
    for (const name of names) {
      const result = await backupPluginSettings(name);
      if (result.error) log(`Couldn't back up ${name}'s settings: ${result.error}`);
    }
  } catch (error) {
    log(`Backing up before the change failed: ${error}`);
  }
}

// Hands a release ZIP to Decky Loader's own installer — the route the Decky
// Store uses. The loader shows its native confirm/progress dialog and does the
// SHA-256 check and install itself. DeckyHub's backend downloads the ZIP first
// (stage_install in py_modules/deckyhub/downloads.py: Decky's own download of a GitHub URL can hang) and
// Decky reads it as file://.
//
// Plugins that are uninstalled first and then installed fresh instead of
// updated in place. Decky Loader's in-place update uninstalls the old version
// mid-install, which turns its file watcher back on: the watcher starts the new
// version while it's still being installed, and the installer then stops that
// copy seconds into its startup. Unifideck hangs there, and Decky grew to 9.6 GB
// and froze the Deck. A fresh install keeps the watcher off throughout.
const FRESH_INSTALL_PLUGINS = ["Unifideck"];

export const needsFreshInstall = (pluginName: string, installType: number) =>
  installType !== PLUGIN_INSTALL_TYPE.INSTALL && FRESH_INSTALL_PLUGINS.includes(pluginName);

// Its progress window stays open, spinning once the ZIP is in, until `handedOver`
// settles (Decky's dialog is up, or it failed); without one, until it's staged.
export async function localZip(asset: Asset, repo: string, handedOver?: Promise<void>) {
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

export async function installDeckyPlugin(
  asset: Asset,
  repo: string,
  pluginName: string,
  version: string,
  installType: 0 | 1 | 2 | 3,
  // A trusted browser's request: confirm Decky Loader's own install prompt for this plugin
  // too, since the device owner already chose to trust that browser.
  confirmForUser = false,
) {
  const { handedOver, done } = handOff();
  let stopConfirming = () => {};
  try {
    // Before any uninstall, so a failed download leaves the plugin as it was.
    const artifact = await localZip(asset, repo, handedOver);
    if (installType !== PLUGIN_INSTALL_TYPE.INSTALL) await backUpFirst(pluginName);
    if (needsFreshInstall(pluginName, installType)) {
      await uninstallDeckyPlugin(pluginName, false);
      log(`Decky Loader uninstalled ${pluginName} before a fresh install`);
      installType = PLUGIN_INSTALL_TYPE.INSTALL;
    }
    traceDeckyInstall(pluginName, version);
    const loaderVersion = normalizeVersion(displayVersion(version));
    // Only once the ZIP is staged, and only for this very file, so no other prompt for the
    // same plugin (a manual install started meanwhile, say) is answered for the user.
    if (confirmForUser) stopConfirming = confirmDeckyPrompt(pluginName, loaderVersion, asset.sha256 ?? "");
    const result = await callDeckyLoader(
      "utilities/install_plugin",
      artifact,
      pluginName,
      loaderVersion,
      asset.sha256 ?? "",
      installType,
    );
    log(`Decky Loader install_plugin ${pluginName} accepted, waiting for confirm/progress`);
    return result;
  } finally {
    done();
    window.setTimeout(stopConfirming, 60_000);
  }
}

// Several updates (or, with installType INSTALL, new plugins) in one go: Decky Loader shows
// one confirm dialog listing them all and installs them in order. Fresh-install plugins need their uninstall
// first, so callers leave them out.
export async function updateDeckyPlugins(
  updates: { asset: Asset; repo: string; name: string; version: string }[],
  installType: 0 | 2 = PLUGIN_INSTALL_TYPE.UPDATE,
) {
  // One at a time, so a single progress window shows at once; the last one
  // stays up until Decky's dialog is.
  const { handedOver, done } = handOff();
  try {
    const artifacts: string[] = [];
    for (const [index, { asset, repo }] of updates.entries())
      artifacts.push(await localZip(asset, repo, index === updates.length - 1 ? handedOver : undefined));
    if (installType !== PLUGIN_INSTALL_TYPE.INSTALL) await backUpFirst(...updates.map(({ name }) => name));
    for (const { name, version } of updates) traceDeckyInstall(name, version);
    return await callDeckyLoader(
      "utilities/install_plugins",
      updates.map(({ asset, name, version }, index) => ({
        artifact: artifacts[index],
        name,
        version: normalizeVersion(displayVersion(version)),
        hash: asset.sha256 ?? "",
        install_type: installType,
      })),
    );
  } finally {
    done();
  }
}

// Decky Loader's uninstall deletes the plugin's folder and its settings right
// away, with no dialog of its own — callers must confirm first.
export async function uninstallDeckyPlugin(pluginName: string, backUp = true) {
  if (backUp) await backUpFirst(pluginName);
  return callDeckyLoader("utilities/uninstall_plugin", pluginName);
}

// Decky Loader's own switch for a plugin: it stops or starts the plugin and remembers the choice (nothing is deleted).
export const setDeckyPluginEnabled = (pluginName: string, enabled: boolean) =>
  callDeckyLoader(enabled ? "utilities/enable_plugin" : "utilities/disable_plugin", pluginName);

// What the Manage window can hand to Decky Loader's installer for the selected
// release, if anything: "Update" for an installed Decky plugin when
// the release is newer, "Install" for a registry Decky plugin that isn't
// installed yet. A fresh install has no installed manifest to name it, so it
// uses the detection rule's first name (the plugin's manifest name).
// Releases without a GitHub checksum (assets uploaded before mid-2025) can
// still be installed; Decky Loader skips verification for an empty hash.
export function installAction(
  app: App,
  release: { tag: string; pluginVersion?: string; assets: Asset[] },
): { type: 0 | 1 | 2 | 3; name: string } | null {
  if (!release.assets[0] || app.identityUnverified) return null;
  if (app.pluginName)
    return {
      type: resolveDeckyHubInstallType(releaseVersion(release), app.installedVersion ?? ""),
      name: app.pluginName,
    };
  if (!app.installedVersion && app.detect?.type === "decky-plugin")
    return { type: PLUGIN_INSTALL_TYPE.INSTALL, name: app.detect.names?.[0] ?? app.name };
  return null;
}

// Install or update an unverified plugin on the user's say-so: the one name Decky can address it by
// (uninstallName), which the confirmation names. Only offered where that name is unambiguous.
export function unverifiedInstallAction(
  app: App,
  release: { tag: string; pluginVersion?: string; assets: Asset[] },
): { type: 0 | 1 | 2 | 3; name: string } | null {
  if (!app.identityUnverified || !app.uninstallName || !app.installedVersion || !release.assets[0]) return null;
  return {
    type: resolveDeckyHubInstallType(releaseVersion(release), app.installedVersion),
    name: app.uninstallName,
  };
}

export function installTypeLabel(
  t: TFunc,
  type: number,
  version: string,
  updateLabel = t("settings.updateTo", { version }),
) {
  return type === PLUGIN_INSTALL_TYPE.INSTALL
    ? t("appcard.installVersion", { version })
    : type === PLUGIN_INSTALL_TYPE.REINSTALL
      ? t("settings.reinstallTo", { version })
      : type === PLUGIN_INSTALL_TYPE.DOWNGRADE
        ? t("settings.downgradeTo", { version })
        : updateLabel;
}
