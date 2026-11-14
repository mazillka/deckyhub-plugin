import type { App, PluginStats } from "./types";

export const SORT_ORDERS = ["az", "za", "downloads", "stars", "updated", "added"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

// The registry's date for the release a card shows, else the card's own release check.
const releasedAt = (app: App) => Date.parse(app.stats?.updated || app.publishedAt || "") || 0;

// All-time downloads of a plugin: GitHub's plus the Decky store's, which count different installs (the
// store's are what Decky installs, GitHub's the ZIPs fetched from there). Undefined when neither is known.
export const totalDownloads = (stats?: PluginStats) =>
  stats?.downloads === undefined && !stats?.store ? undefined : (stats.downloads ?? 0) + (stats.store?.downloads ?? 0);

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
