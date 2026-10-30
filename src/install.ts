import { stageInstall } from "./api";
import { showInstallDownloadModal } from "./components/DownloadProgress";
import { stopHaptics } from "./haptics";
import { type TFunc } from "./i18n/en";
import { log } from "./log";
import { tr } from "./translate";
import { type App, type Asset } from "./types";
import { compareVersions, displayVersion, normalizeVersion } from "./version";
import { toaster } from "@decky/api";

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

// Set by this copy's onDismount (src/index.tsx). Each load of DeckyHub is a
// fresh module, so after a self-update only the old copy still sees false.
export let unloaded = false;

export const markUnloaded = () => {
  unloaded = true;
  stopHaptics();
};

// Decky Loader reloads DeckyHub itself once its update is installed. If this
// old copy is still mounted after Decky's own 15 s load timeout, that reload
// didn't happen, so ask Decky's plugin loader for the new copy directly.
export function reloadIfStillOld() {
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
export const FRESH_INSTALL_PLUGINS = ["Unifideck"];

export const needsFreshInstall = (pluginName: string, installType: number) => installType !== PLUGIN_INSTALL_TYPE.INSTALL && FRESH_INSTALL_PLUGINS.includes(pluginName);

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
export function handOff() {
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
    traceDeckyInstall(pluginName, version);
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
    for (const { name, version } of updates) traceDeckyInstall(name, version);
    return await callDeckyLoader(
      "utilities/install_plugins",
      updates.map(({ asset, name, version }, index) => ({ artifact: artifacts[index], name, version: normalizeVersion(displayVersion(version)), hash: asset.sha256 ?? "", install_type: PLUGIN_INSTALL_TYPE.UPDATE })),
    );
  } finally {
    done();
  }
}

// Plugins Decky is installing right now (from its start event, so a cancelled
// confirmation never counts), for cards to say "Installing…".
const installingNow = new Set<string>();
const installingListeners = new Set<() => void>();
const setInstalling = (name: string, on: boolean) => {
  if (on) installingNow.add(name);
  else installingNow.delete(name);
  installingListeners.forEach((listener) => listener());
};
export const subscribeInstalling = (listener: () => void) => {
  installingListeners.add(listener);
  return () => void installingListeners.delete(listener);
};
export const isInstalling = (name: string) => installingNow.has(name);

// Logs every stage Decky Loader reports for this install, with elapsed time,
// so deckyhub.log shows where a stuck install stopped. Decky's progress events
// carry no plugin name, so all of them are logged while this one is watched.
// Decky shows no notice when an install finishes, so this toasts one.
export function traceDeckyInstall(pluginName: string, version?: string) {
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
    if (name !== pluginName) return;
    setInstalling(name, true);
    armIdle();
  };
  const onInfo = (progress: number, stage: string) => {
    log(`Decky install ${pluginName} ${progress}% ${stage} at ${elapsed()}`);
    armIdle(stage);
  };
  const stop = () => {
    setInstalling(pluginName, false);
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
    else toaster.toast({ title: "DeckyHub", body: version ? tr("toast.installedVersion", { name, version: displayVersion(version) }) : tr("toast.installed", { name }) });
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

export function callDeckyLoader(route: string, ...args: unknown[]) {
  const backend = getDeckyBackend();
  log(`Decky Loader ${route} ${JSON.stringify(args)}${backend ? "" : " (loader unavailable)"}`);
  if (!backend) return Promise.reject(new Error(tr("error.loaderUnavailable")));
  return backend.call(route, ...args).catch((error: unknown) => {
    log(`Decky Loader ${route} failed: ${error}`);
    throw error;
  });
}

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
