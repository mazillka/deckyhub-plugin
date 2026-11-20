import type { TFunc } from "./i18n/en";
import { compareBy, type SortOrder } from "./sorting";
import type { App, HideableButton, View } from "./types";
import { installAction, needsFreshInstall, PLUGIN_INSTALL_TYPE } from "./utils";

// What a page is called and says, and what it shows when nothing matches.
export function viewInfo(t: TFunc, view: View) {
  if (view === "updates")
    return { title: t("nav.updates"), description: t("view.updatesDescription"), empty: t("view.updatesEmpty") };
  if (view === "installed")
    return { title: t("filter.installed"), description: undefined, empty: t("view.installedEmpty") };
  return { title: t("nav.discover"), description: t("view.discoverDescription"), empty: t("view.discoverEmpty") };
}

export type Filters = { query: string; installed: string; category: string };

// Discover's filters; Status and Category are overridable so each dropdown option can say
// how many cards it would show next to the other filters.
export const matchesFilters = (app: App, { query, installed, category }: Filters) =>
  (!query ||
    `${app.name} ${app.repo} ${app.category} ${app.description ?? ""}`.toLowerCase().includes(query.toLowerCase())) &&
  (installed === "All" || (installed === "Installed") === Boolean(app.installedVersion)) &&
  (!category || app.category === category);

const isShown = (app: App, view: View, filters: Filters) =>
  view === "updates"
    ? app.updateAvailable === true
    : view === "installed"
      ? Boolean(app.installedVersion)
      : matchesFilters(app, filters);

// Apps with an update first; Updates keeps registry order otherwise, Discover follows the Sort
// dropdown. The registry only ever appends (custom repos come after it), so "Recently added" is
// that order reversed. Plugins without stats (added repos) go last when sorting by them.
export const visibleApps = (apps: App[], view: View, filters: Filters, sortOrder: SortOrder, thenBy: SortOrder) =>
  apps
    .filter((app) => isShown(app, view, filters))
    .sort(
      (a, b) =>
        Number(b.updateAvailable === true) - Number(a.updateAvailable === true) ||
        (view === "updates"
          ? 0
          : compareBy(sortOrder, a, b, apps) || compareBy(thenBy, a, b, apps) || compareBy("az", a, b, apps)),
    );

// Decky plugins the Updates page can update in one batch (see updateDeckyPlugins).
export const batchUpdatesOf = (shown: App[], view: View, hiddenButtons: HideableButton[]) =>
  view === "updates" && !hiddenButtons.includes("update")
    ? shown.flatMap((app) => {
        const action = app.latestVersion ? installAction(app, { tag: app.latestVersion, assets: app.assets }) : null;
        return app.updateAvailable === true &&
          action?.type === PLUGIN_INSTALL_TYPE.UPDATE &&
          !needsFreshInstall(action.name, action.type)
          ? [{ asset: app.assets[0], repo: app.repo, name: action.name, version: app.latestVersion! }]
          : [];
      })
    : [];

// Biggest categories first, as chips on the home.
export const categoryCountsOf = (apps: App[], categories: string[]) =>
  categories
    .map((category) => [category, apps.filter((app) => app.category === category).length] as const)
    .sort((a, b) => b[1] - a[1]);
