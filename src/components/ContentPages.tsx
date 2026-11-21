import type { RefObject } from "react";
import { useT } from "../i18n";
import type { useAppActions } from "../hooks/useAppActions";
import type { useApps } from "../hooks/useApps";
import type { useBrowseState } from "../hooks/useBrowseState";
import type { useCards } from "../hooks/useCards";
import type { useDiscoverView } from "../hooks/useDiscoverView";
import type { View } from "../types";
import { ContentBadge } from "./ContentBadge";
import { ContentHeader } from "./ContentHeader";
import { LoadErrorCard, LoadingPanel } from "./ContentStatus";
import { DiscoverBody } from "./DiscoverBody";
import { DiscoverFilters } from "./DiscoverFilters";
import { ExpDiscoverFilters } from "./experimental/ExpDiscoverFilters";
import { ExpHeader } from "./experimental/ExpHeader";
import type { Layout } from "./LayoutToggle";
import { RateLimitBanner } from "./RateLimitBanner";
import { V2Library } from "./v2/V2Library";
import { Welcome } from "./Welcome";

// What Content has worked out, handed to the page that draws it.
export type ContentContext = {
  view: View;
  experimental: boolean;
  info: { title: string; description?: string; empty: string };
  data: ReturnType<typeof useApps>;
  browse: ReturnType<typeof useBrowseState>;
  discover: ReturnType<typeof useDiscoverView>;
  actions: ReturnType<typeof useAppActions>;
  cards: ReturnType<typeof useCards>;
  layout: Layout;
  setLayout: (layout: Layout) => void;
  swapRef: RefObject<HTMLDivElement | null>;
};

// Experimental V2: the two-pane list and detail instead of cards.
export function V2Page({ view, info, data, browse, discover, actions, cards }: ContentContext) {
  return (
    <V2Library
      view={view}
      apps={discover.shown}
      allApps={data.apps}
      loading={data.loading}
      loadError={data.loadError}
      checked={data.checked}
      updateAllCount={discover.batchUpdates.length}
      updatingAll={actions.updatingAll}
      onUpdateAll={() => void actions.updateAll(discover.batchUpdates, discover.shown)}
      query={browse.query}
      onQuery={browse.setQuery}
      sortOrder={browse.sortOrder}
      onSortOrder={browse.setSortOrder}
      onRefresh={() => void data.load(true)}
      category={discover.activeCategory}
      onCategory={browse.setCategoryFilter}
      categories={discover.categories}
      cardProps={cards.cardProps}
      updateCount={discover.updateCount}
      installedCount={data.installedCount}
      emptyTitle={info.empty}
    />
  );
}

// The title row: name (or the open category), its badges, layout toggle, Refresh and Update all.
function PageHeader({ view, experimental, info, data, browse, discover, actions, layout, setLayout }: ContentContext) {
  const t = useT();
  const Header = experimental ? ExpHeader : ContentHeader;
  return (
    <Header
      view={view}
      title={browse.browsing ? discover.activeCategory || t("discover.allPlugins") : info.title}
      badge={
        <ContentBadge
          view={view}
          updateCount={discover.updateCount}
          totalDownloads={data.apps.reduce((sum, app) => sum + (app.stats?.downloads ?? 0), 0)}
          registryChannel={data.registryChannel}
        />
      }
      description={browse.browsing ? t("discover.pluginCount", { count: discover.shown.length }) : info.description}
      onBack={browse.browsing ? () => browse.setBrowsing(false) : undefined}
      layout={layout}
      onLayout={setLayout}
      onRefresh={() => void data.load(true)}
      updateAllCount={discover.batchUpdates.length}
      updatingAll={actions.updatingAll}
      onUpdateAll={() => void actions.updateAll(discover.batchUpdates, discover.shown)}
    />
  );
}

function PageBody(ctx: ContentContext) {
  const { view, experimental, info, data, browse, discover, cards, layout, swapRef } = ctx;
  const Filters = experimental ? ExpDiscoverFilters : DiscoverFilters;
  const { query, installedFilter } = browse;
  const filtering = Boolean(query || installedFilter !== "All" || discover.activeCategory);
  const clearFilters = () => {
    browse.setQuery("");
    browse.setInstalledFilter("All");
    browse.setCategoryFilter("");
  };
  return (
    <DiscoverBody
      swapRef={swapRef}
      view={view}
      experimental={experimental}
      home={discover.home}
      browsing={browse.browsing}
      onStopBrowsing={() => browse.setBrowsing(false)}
      total={data.apps.length}
      categoryCounts={discover.categoryCounts}
      shelf={cards.shelf}
      onBrowse={browse.openBrowse}
      layout={layout}
      columns={data.columnsPerRow}
      renderCard={cards.renderCard}
      renderGrid={cards.renderGrid}
      filters={
        view === "discover" &&
        browse.browsing && (
          <Filters
            query={query}
            onQuery={browse.setQuery}
            installed={installedFilter}
            onInstalled={browse.setInstalledFilter}
            category={discover.activeCategory}
            onCategory={browse.setCategoryFilter}
            categories={discover.categories}
            countWith={discover.countWith}
            sortOrder={browse.sortOrder}
            onSortOrder={browse.setSortOrder}
            thenBy={browse.thenBy}
            onThenBy={browse.setThenBy}
          />
        )
      }
      shown={discover.shown}
      restoredCount={browse.restored?.count}
      emptyTitle={info.empty}
      onClear={view === "discover" && filtering ? clearFilters : undefined}
    />
  );
}

// Updates, Installed or Discover in Default or Experimental style: loading or error state, or the header and list.
export function ContentPage(ctx: ContentContext) {
  const { data } = ctx;
  return (
    <>
      {ctx.view === "discover" && <Welcome />}
      {data.loading && <LoadingPanel checked={data.checked} total={data.apps.length} />}
      {data.loadError && <LoadErrorCard error={data.loadError} onRetry={() => void data.load(true)} />}
      {!data.loading && !data.loadError && (
        <>
          <PageHeader {...ctx} />
          <PageBody {...ctx} />
        </>
      )}
    </>
  );
}

// The page's frame: the rate-limit note above whichever page the UI style picks.
export function ContentFrame({
  ctx,
  v2,
  pageRef,
}: {
  ctx: ContentContext;
  v2: boolean;
  pageRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={pageRef}>
      <RateLimitBanner />
      {v2 ? <V2Page {...ctx} /> : <ContentPage {...ctx} />}
    </div>
  );
}
