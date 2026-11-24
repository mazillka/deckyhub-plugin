import { useEffect, useRef, useState } from "react";
import { getApps, getSettings, REGISTRY_UPDATED } from "../api";
import { markSharedNames } from "../author";
import { useColumns } from "./useColumns";
import type { App, HideableButton, PluginStats, RepoPreference, UpdateChannel, View, VirusScan } from "../types";
import {
  DEFAULT_COLUMNS_PER_ROW,
  fetchPluginStats,
  fetchVirusScans,
  getDeckyBackend,
  hydrate,
  log,
  notifyUpdates,
  scanFor,
} from "../utils";
import { metaDefenderReportOf, virusTotalReportOf } from "../registryData";
import { installedRisk } from "../releases";
import { notifyInstalledRisks } from "../notify";

// ponytail: fixed pool of 8 GitHub requests in flight; lower it if the registry grows
// big enough to trip GitHub's secondary (burst) rate limit.
const RELEASE_CONCURRENCY = 8;

type Stats = Record<string, PluginStats>;

// The apps this page lists (installed ones only, outside Discover), with their stats.
function trackedApps(local: App[], view: View, showBadges: boolean, stats: Stats): App[] {
  return (view !== "discover" ? local.filter((app) => app.installedVersion) : local).map((app) => {
    const stat = stats[app.repo.toLowerCase()];
    // Updates keeps only the audit warnings: no downloads, root, fork or AI badges there.
    return stat
      ? { ...app, stats: showBadges ? stat : { warnings: stat.warnings, prereleaseWarnings: stat.prereleaseWarnings } }
      : app;
  });
}

// A card keeps its last release check until this load's replaces it.
function keepLastChecks(current: App[], tracked: App[]): App[] {
  const previous = new Map(current.map((app) => [app.id, app]));
  return tracked.map((app) => {
    const kept = previous.get(app.id);
    return kept ? { ...kept, stats: app.stats } : app;
  });
}

// One app's latest release, installed-version risk and (with badges) its scan reports.
async function hydrateOne(
  tracked: App,
  force: boolean,
  preference: RepoPreference | undefined,
  showBadges: boolean,
  scans: Record<string, VirusScan>,
): Promise<App> {
  const fresh = await hydrate(tracked, force, preference);
  // Every view, Updates too: the installed version's own scan and warnings.
  const app = { ...fresh, installedRisk: await installedRisk(fresh, force).catch(() => undefined) };
  if (!showBadges) return app;
  // The report for the ZIP this card installs, once its release is known.
  const withScan = { ...app, scan: scanFor(scans, app.assets[0]) };
  if (!app.assets[0]) return withScan;
  const [virusTotal, metaDefender] = await Promise.all([
    virusTotalReportOf(app.assets[0]).catch(() => null),
    metaDefenderReportOf(app.assets[0]).catch(() => null),
  ]);
  return { ...withScan, virusTotal, metaDefender };
}

// A rolling pool: each finished request starts the next, rather than
// waiting for the slowest one in a fixed batch. A task returning false stops its worker.
async function runPool(count: number, task: (index: number) => Promise<boolean>) {
  let next = 0;
  const worker = async () => {
    while (next < count) if (!(await task(next++))) return;
  };
  await Promise.all(Array.from({ length: Math.min(RELEASE_CONCURRENCY, count) }, worker));
}

// Checks every app's release, a few at a time; `onChecked` gets each result and says whether to go on.
async function hydrateAll(
  tracked: App[],
  force: boolean,
  preferences: Record<string, RepoPreference>,
  showBadges: boolean,
  scans: Record<string, VirusScan>,
  onChecked: (app: App) => boolean,
) {
  const hydrated = [...tracked];
  await runPool(tracked.length, async (index) => {
    const repo = tracked[index].repo;
    hydrated[index] = await hydrateOne(tracked[index], force, preferences[repo], showBadges, scans);
    return onChecked(hydrated[index]);
  });
  return hydrated;
}

// The settings the page is shown with, taken from each load.
function useLoadedSettings() {
  const [columnsPerRow, setColumnsPerRow] = useState(DEFAULT_COLUMNS_PER_ROW);
  const [repoPreferences, setRepoPreferences] = useState<Record<string, RepoPreference>>({});
  const [hiddenButtons, setHiddenButtons] = useState<HideableButton[]>([]);
  // Settings' Registry channel, for the header's Pre-release registry badge.
  const [registryChannel, setRegistryChannel] = useState<UpdateChannel>("stable");
  // Every listed plugin, for the Quick Access menu's Discover button (its own list is installed ones only).
  const [listedCount, setListedCount] = useState(0);
  const [installedCount, setInstalledCount] = useState(0);
  // Returns the per-repo preferences, which the release checks use.
  const apply = (settings: Awaited<ReturnType<typeof getSettings>>, listed: App[]) => {
    setListedCount(listed.length);
    setInstalledCount(listed.filter((app) => app.installedVersion).length);
    const preferences = settings.repoSettings || {};
    setRepoPreferences(preferences);
    setColumnsPerRow(settings.columnsPerRow);
    setHiddenButtons(settings.hiddenButtons ?? []);
    setRegistryChannel(settings.registryChannel === "prerelease" ? "prerelease" : "stable");
    return preferences;
  };
  return {
    columnsPerRow,
    repoPreferences,
    setRepoPreferences,
    hiddenButtons,
    registryChannel,
    listedCount,
    installedCount,
    apply,
  };
}

// Discover and Installed show stats and security badges on their cards; Updates needs the audit warnings
// too, for its Update and Update all confirms.
const fetchAll = (showBadges: boolean, force: boolean) =>
  Promise.all([
    getApps(),
    getSettings(),
    fetchPluginStats(force),
    showBadges ? fetchVirusScans(force) : Promise.resolve<Record<string, VirusScan>>({}),
  ]);

// Reloads every 15 minutes, when the registry changes and when Decky finishes an install.
function useReloads(load: (force?: boolean) => Promise<void>) {
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
}

// Updates' or Discover's plugins and the settings they're shown with: loads them,
// checks each one's latest release, and reloads every 15 minutes, when the
// registry changes and when Decky finishes an install.
export function useApps(view: View) {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { apply: applySettings, ...settings } = useLoadedSettings();
  const columnsPerRow = useColumns(settings.columnsPerRow);
  // Release checks finished out of the current load, shown while Updates waits on them.
  const [checked, setChecked] = useState(0);

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
      // Discover and Installed both show stats and security badges on their cards.
      const showBadges = view !== "updates";
      const [appData, loadedSettings, stats, scans] = await fetchAll(showBadges, force);
      const local = markSharedNames(appData.apps);
      const preferences = applySettings(loadedSettings, local);
      const tracked = trackedApps(local, view, showBadges, stats);
      // A card keeps its last release check until this load's replaces it.
      setApps((current) => keepLastChecks(current, tracked));
      setLoadError(null);
      // Discover shows every card straight away and fills each in as its
      // release arrives; Updates waits, since it lists only apps with an update.
      if (view !== "updates") {
        loaded.current = true;
        setLoading(false);
      }
      setChecked(0);
      const hydrated = await hydrateAll(tracked, force, preferences, showBadges, scans, (fresh) => {
        // A newer load took over: stop, rather than check the rest for nothing.
        if (run !== loadRun.current) return false;
        setApps((current) => current.map((app) => (app.id === fresh.id ? fresh : app)));
        setChecked((count) => count + 1);
        return true;
      });
      if (run !== loadRun.current) return;
      loaded.current = true;
      setLoading(false);
      notifyUpdates(hydrated);
      notifyInstalledRisks(hydrated);
    } catch (error) {
      log(`Loading apps failed: ${error}`);
      setLoadError(String(error));
      setLoading(false);
    }
  };

  useReloads(load);

  return {
    apps,
    setApps,
    loading,
    loadError,
    checked,
    ...settings,
    columnsPerRow,
    load,
  };
}
