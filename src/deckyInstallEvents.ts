import { toaster } from "@decky/api";
import { callDeckyLoader, getDeckyBackend, reloadIfStillOld } from "./deckyLoader";
import { log } from "./log";
import { tr } from "./translate";
import { displayVersion } from "./version";

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
    idleTimer = window.setTimeout(
      () => {
        log(`Decky install ${pluginName}: no progress after ${elapsed()} — check journalctl -u plugin_loader`);
        toaster.toast({
          title: tr("toast.installStalledTitle", { name: pluginName }),
          body: tr("toast.installStalledBody"),
        });
        stop();
      },
      stage?.endsWith("download_remote") ? 120_000 : 45_000,
    );
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
    else
      toaster.toast({
        title: "DeckyHub",
        body: version
          ? tr("toast.installedVersion", { name, version: displayVersion(version) })
          : tr("toast.installed", { name }),
      });
  };
  // Backstop: Decky never sends finish after a silent failure.
  const timer = window.setTimeout(
    () => {
      log(`Decky install ${pluginName}: no finish after ${elapsed()} — check journalctl -u plugin_loader`);
      stop();
    },
    10 * 60 * 1000,
  );
  backend.addEventListener("loader/plugin_download_start", onStart);
  backend.addEventListener("loader/plugin_download_info", onInfo);
  backend.addEventListener("loader/plugin_download_finish", onFinish);
}

// Decky Loader announces each install with `loader/add_plugin_install_prompt` (name, version,
// request id, hash, install type) and installs once `utilities/confirm_plugin_install` gets that id.
export function confirmDeckyPrompt(pluginName: string, version: string, hash: string) {
  const backend = getDeckyBackend();
  if (!backend) return () => undefined;
  const onPrompt = (name: string, promptVersion: string, requestId: string, promptHash: unknown) => {
    if (name !== pluginName || promptVersion !== version || (promptHash || "") !== hash) return;
    if (typeof requestId !== "string") return;
    log(`Confirming Decky Loader's install prompt for ${name} (trusted browser)`);
    // One prompt per request: a later manual install of the same plugin must still ask.
    backend.removeEventListener("loader/add_plugin_install_prompt", onPrompt);
    void callDeckyLoader("utilities/confirm_plugin_install", requestId).catch(() => undefined);
  };
  backend.addEventListener("loader/add_plugin_install_prompt", onPrompt);
  return () => backend.removeEventListener("loader/add_plugin_install_prompt", onPrompt);
}
