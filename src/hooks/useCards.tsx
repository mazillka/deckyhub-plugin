import type { ReactNode } from "react";
import { authorSearch, ownerOf } from "../author";
import { AppCard, type CardLayout } from "../components/AppCard";
import { ExpAppCard } from "../components/experimental/ExpAppCard";
import { FocusableGrid } from "../components/FocusableGrid";
import { compareBy, type SortOrder } from "../sorting";
import type { App, Asset, HideableButton, RepoPreference, View } from "../types";
import type { useAppActions } from "./useAppActions";
import type { useBrowseState } from "./useBrowseState";

// How a page draws its plugins: each card's props, a card, and a grid of cards.
export function useCards(o: {
  view: View;
  fullPage?: View;
  experimental: boolean;
  apps: App[];
  repoPreferences: Record<string, RepoPreference>;
  hiddenButtons: HideableButton[];
  columns: number;
  layout: "grid" | "list";
  browse: ReturnType<typeof useBrowseState>;
  actions: ReturnType<typeof useAppActions>;
  reload: () => void;
}) {
  const { view, fullPage, apps, browse, actions } = o;
  const Card = o.experimental ? ExpAppCard : AppCard;
  // Discover's Manage window offers the rest of the plugin's author: the search narrowed to them, over every plugin.
  const moreFromAuthor = (app: App) =>
    view === "discover" && fullPage
      ? {
          count: apps.filter((other) => ownerOf(other) === ownerOf(app)).length,
          show: () => {
            browse.setInstalledFilter("All");
            browse.setCategoryFilter("");
            browse.setQuery(authorSearch(app));
            browse.setBrowsing(true);
          },
        }
      : undefined;
  const cardProps = (app: App) => ({
    app,
    preference: o.repoPreferences[app.repo] ?? { channel: "stable" as const },
    downloadDisabled: actions.downloading,
    hiddenButtons: o.hiddenButtons,
    onDownload: (asset: Asset) => actions.startDownload(asset, app.repo),
    onPreferenceChange: actions.changeAppPreference,
    onUninstalled: o.reload,
  });
  const renderCard = (app: App, layout?: CardLayout): ReactNode => (
    <Card {...cardProps(app)} layout={layout} moreFromAuthor={moreFromAuthor(app)} />
  );
  const renderGrid = (items: App[]) => (
    <FocusableGrid items={items} columns={fullPage ? o.columns : 1} keyFor={(app) => app.id}>
      {(app) => renderCard(app)}
    </FocusableGrid>
  );
  // A shelf is one row of cards, or in the list view a few rows (it follows the Grid / List choice).
  const shelfSize = o.layout === "list" ? 4 : o.columns;
  const shelf = (order: SortOrder, size = shelfSize) =>
    [...apps].sort((a, b) => compareBy(order, a, b, apps) || compareBy("az", a, b, apps)).slice(0, size);
  return { cardProps, renderCard, renderGrid, shelf };
}
