import type { App, PluginStats } from "./types";

export const SORT_ORDERS = ["az", "za", "downloads", "stars", "updated", "added"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

// The registry's date for the release a card shows, else the card's own release check.
const releasedAt = (app: App) => Date.parse(app.stats?.updated || app.publishedAt || "") || 0;

export const validCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

// Newer registry data counts store downloads and updates. Both counters must be present and valid.
export const storeActivityOf = (stats?: PluginStats): number | undefined => {
  const activity = stats?.store?.activity;
  if (!activity || !validCount(activity.downloads) || !validCount(activity.updates)) return undefined;
  const total = activity.downloads + activity.updates;
  return validCount(total) ? total : undefined;
};

// Compatible with older registry caches that only contain store.downloads.
export const storeCountOf = (stats?: PluginStats): number | undefined => {
  const activity = storeActivityOf(stats);
  if (activity !== undefined) return activity;
  return validCount(stats?.store?.downloads) ? stats.store.downloads : undefined;
};

// Approximate activity across GitHub downloads and Decky store downloads/updates. These counters
// include repeat downloads and are not unique installs. Undefined when no valid count is known.
export const totalDownloads = (stats?: PluginStats) => {
  const github = validCount(stats?.downloads) ? stats.downloads : undefined;
  const store = storeCountOf(stats);
  if (github === undefined && store === undefined) return undefined;
  const total = (github ?? 0) + (store ?? 0);
  return validCount(total) ? total : undefined;
};

// One Sort option's order over the list as loaded; 0 for a tie. The registry only ever
// appends (custom repos come after it), so "Recently added" is that order reversed.
// Plugins without stats (added repos) go last when sorting by them.
export const compareBy = (order: SortOrder, a: App, b: App, apps: App[]) =>
  order === "downloads"
    ? (totalDownloads(b.stats) ?? -1) - (totalDownloads(a.stats) ?? -1)
    : order === "stars"
      ? (b.stats?.stars ?? -1) - (a.stats?.stars ?? -1)
      : order === "updated"
        ? releasedAt(b) - releasedAt(a)
        : order === "added"
          ? apps.indexOf(b) - apps.indexOf(a)
          : order === "za"
            ? b.name.localeCompare(a.name)
            : a.name.localeCompare(b.name);
