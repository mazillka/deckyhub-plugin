import { useEffect, useRef, useState } from "react";
import { getApps, getSettings, REGISTRY_UPDATED } from "../api";
import type { App, HideableButton, PluginStats, RepoPreference, View } from "../types";
import { DEFAULT_COLUMNS_PER_ROW, fetchPluginStats, getDeckyBackend, hydrate, log, notifyUpdates } from "../utils";

// ponytail: fixed pool of 8 GitHub requests in flight; lower it if the registry grows
// big enough to trip GitHub's secondary (burst) rate limit.
const RELEASE_CONCURRENCY = 8;

// Updates' or Discover's plugins and the settings they're shown with: loads them,
// checks each one's latest release, and reloads every 15 minutes, when the
// registry changes and when Decky finishes an install.
export function useApps(view: View) {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [columnsPerRow, setColumnsPerRow] = useState(DEFAULT_COLUMNS_PER_ROW);
  const [repoPreferences, setRepoPreferences] = useState<Record<string, RepoPreference>>({});
  const [hiddenButtons, setHiddenButtons] = useState<HideableButton[]>([]);
  // Release checks finished out of the current load, shown while Updates waits on them.
  const [checked, setChecked] = useState(0);
  // Every listed plugin, for the Quick Access menu's Discover button (its own list is installed ones only).
  const [listedCount, setListedCount] = useState(0);

  // Bumped per load() so a slower, older load can't overwrite a newer one.
  const loadRun = useRef(0);
  // Only the first load shows the spinner; later ones (Refresh, the 15-minute
  // timer, an install finishing) update the cards in place, so the grid keeps
  // its controller focus and scroll position.
  const loaded = useRef(false);

  const load = async (force = false) => {
    const run = ++loadRun.current;
    if (!loaded.current) setLoading(true);
    try {
      // Downloads and stars only matter for Discover's cards and sorting.
      const [appData, settings, stats] = await Promise.all([getApps(), getSettings(), view === "discover" ? fetchPluginStats(force) : Promise.resolve<Record<string, PluginStats>>({})]);
      const local = appData.apps;
      setListedCount(local.length);
      const preferences = settings.repoSettings || {};
      setRepoPreferences(preferences);
      setColumnsPerRow(settings.columnsPerRow);
      setHiddenButtons(settings.hiddenButtons ?? []);
      const tracked = (view === "updates" ? local.filter((app) => app.installedVersion) : local).map((app) => {
        const stat = stats[app.repo.toLowerCase()];
        return stat ? { ...app, stats: stat } : app;
      });
      // A card keeps its last release check until this load's replaces it.
      setApps((current) => {
        const previous = new Map(current.map((app) => [app.id, app]));
        return tracked.map((app) => { const kept = previous.get(app.id); return kept ? { ...kept, stats: app.stats } : app; });
      });
      setLoadError(null);
      // Discover shows every card straight away and fills each in as its
      // release arrives; Updates waits, since it lists only apps with an update.
      if (view === "discover") {
        loaded.current = true;
        setLoading(false);
      }
      const hydrated = [...tracked];
      let next = 0;
      setChecked(0);
      // A rolling pool: each finished request starts the next, rather than
      // waiting for the slowest one in a fixed batch.
      const worker = async () => {
        while (next < tracked.length) {
          const index = next++;
          hydrated[index] = await hydrate(tracked[index], force, preferences[tracked[index].repo]);
          // A newer load took over: stop, rather than check the rest for nothing.
          if (run !== loadRun.current) return;
          setApps((current) => current.map((app) => (app.id === hydrated[index].id ? hydrated[index] : app)));
          setChecked((count) => count + 1);
        }
      };
      await Promise.all(Array.from({ length: Math.min(RELEASE_CONCURRENCY, tracked.length) }, worker));
      if (run !== loadRun.current) return;
      loaded.current = true;
      setLoading(false);
      notifyUpdates(hydrated);
    } catch (error) {
      log(`Loading apps failed: ${error}`);
      setLoadError(String(error));
      setLoading(false);
    }
  };

  useEffect(() => {
    // Automatic refreshes go through the release cache; only the Refresh and
    // Check for Updates buttons force a fresh fetch.
    const refresh = () => void load();
    void load();
    const timer = window.setInterval(refresh, 15 * 60 * 1000);
    window.addEventListener(REGISTRY_UPDATED, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(REGISTRY_UPDATED, refresh);
    };
  }, []);

  // Decky Loader reports when an install it ran finishes; reload so the card
  // picks up the new installed version (release data stays cached). Debounced
  // so an "Update all" batch reloads once, not once per plugin.
  useEffect(() => {
    const backend = getDeckyBackend();
    if (!backend) return;
    let timer = 0;
    const onFinish = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 1000);
    };
    backend.addEventListener("loader/plugin_download_finish", onFinish);
    return () => {
      window.clearTimeout(timer);
      backend.removeEventListener("loader/plugin_download_finish", onFinish);
    };
  }, []);

  return { apps, setApps, loading, loadError, checked, listedCount, columnsPerRow, repoPreferences, setRepoPreferences, hiddenButtons, load };
}
