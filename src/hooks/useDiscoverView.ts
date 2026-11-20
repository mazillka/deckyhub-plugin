import type { App, HideableButton, View } from "../types";
import { batchUpdatesOf, categoryCountsOf, matchesFilters, visibleApps } from "../discover";
import type { useBrowseState } from "./useBrowseState";

// What a page shows out of its apps: the plugins that pass the filters (in sort order),
// the categories to filter by, and the Update all batch.
export function useDiscoverView(
  view: View,
  apps: App[],
  browse: ReturnType<typeof useBrowseState>,
  hiddenButtons: HideableButton[],
) {
  const { query, installedFilter, categoryFilter, sortOrder, thenBy, browsing } = browse;
  const categories = [...new Set(apps.map((app) => app.category))].sort((a, b) => a.localeCompare(b));
  // A category that vanished on reload (registry change) stops filtering rather than hiding everything.
  const activeCategory = categories.includes(categoryFilter) ? categoryFilter : "";
  const filters = { query, installed: installedFilter, category: activeCategory };
  const shown = visibleApps(apps, view, filters, sortOrder, thenBy);
  return {
    categories,
    activeCategory,
    shown,
    home: view === "discover" && !browsing,
    batchUpdates: batchUpdatesOf(shown, view, hiddenButtons),
    updateCount: apps.filter((app) => app.updateAvailable).length,
    categoryCounts: categoryCountsOf(apps, categories),
    // How many cards each Status or Category option would show next to the other filters.
    countWith: (installed: string, category: string) =>
      apps.filter((app) => matchesFilters(app, { query, installed, category })).length,
  };
}
