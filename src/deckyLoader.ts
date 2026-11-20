import { stopHaptics } from "./haptics";
import { log } from "./log";
import { tr } from "./translate";

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
let unloaded = false;

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

export function callDeckyLoader(route: string, ...args: unknown[]) {
  const backend = getDeckyBackend();
  log(`Decky Loader ${route} ${JSON.stringify(args)}${backend ? "" : " (loader unavailable)"}`);
  if (!backend) return Promise.reject(new Error(tr("error.loaderUnavailable")));
  return backend.call(route, ...args).catch((error: unknown) => {
    log(`Decky Loader ${route} failed: ${error}`);
    throw error;
  });
}
