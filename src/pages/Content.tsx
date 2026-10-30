import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Focusable, Navigation, PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaSync } from "react-icons/fa";
import { downloadAsset } from "../api";
import { useT } from "../i18n";
import type { App, Asset, UpdateChannel, View } from "../types";
import { compactButtonStyle, compactNumber, hydrate, installAction, needsFreshInstall, PLUGIN_INSTALL_TYPE, updateDeckyPlugins } from "../utils";
import { AppCard } from "../components/AppCard";
import { confirmPluginInstall } from "../components/InstallFlow";
import { showDownloadModal } from "../components/DownloadProgress";
import { AppList } from "../components/AppList";
import { ContentHeader } from "../components/ContentHeader";
import { DiscoverFilters } from "../components/DiscoverFilters";
import { EmptyState } from "../components/EmptyState";
import { DiscoverHome } from "../components/DiscoverHome";
import { FocusableGrid } from "../components/FocusableGrid";
import { countBadgeStyle, QuickAccessNav } from "../components/QuickAccessNav";
import { compareBy, type SortOrder } from "../sorting";
import { Card, useSwapAnimation } from "../components/Card";
import { useLayout } from "../components/LayoutToggle";
import { useApps } from "../hooks/useApps";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { Welcome } from "../components/Welcome";



export function Content({ fullPage }: { fullPage?: View }) {
  const t = useT();
  const view: View = fullPage ?? "updates";
  const { apps, setApps, loading, loadError, checked, listedCount, columnsPerRow, repoPreferences, setRepoPreferences, hiddenButtons, load } = useApps(view);
  const [downloading, setDownloading] = useState(false);
  const [query, setQuery] = useState("");
  const [installedFilter, setInstalledFilter] = useState("All");
  // "" means every category.
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("az");
  // Breaks Sort's ties (many plugins share 0 stars or downloads); A to Z breaks any left.
  const [thenBy, setThenBy] = useState<SortOrder>("az");
  // Discover opens on its shelves; a category chip or See all browses the whole list, a page at a time.
  const [browsing, setBrowsing] = useState(false);
  const [layout, setLayout] = useLayout();
  const [updatingAll, setUpdatingAll] = useState(false);
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  // Slides the shelves, category, page, layout, filter or sort in when it changes.
  const swapRef = useSwapAnimation([browsing, layout, categoryFilter, installedFilter, sortOrder, thenBy]);

  const info = view === "updates"
    ? { title: t("nav.updates"), description: t("view.updatesDescription"), empty: t("view.updatesEmpty") }
    : { title: t("nav.discover"), description: t("view.discoverDescription"), empty: t("view.discoverEmpty") };


  // Opening a category, or going back, replaces what had focus: hand it to the
  // Back button or the first chip, so the D-pad doesn't start from nowhere.
  const switchedView = useRef(false);
  useEffect(() => {
    if (!switchedView.current) {
      switchedView.current = true;
      return;
    }
    requestAnimationFrame(() => pageRef.current?.querySelector<HTMLElement>(browsing ? ".deckyhub-back-button button" : ".deckyhub-category-chips button")?.focus());
  }, [browsing]);

  useEffect(() => {
    if (!fullPage) requestAnimationFrame(() => quickAccessRef.current?.scrollIntoView({ block: "start" }));
  }, [fullPage]);

  // Resolves once the download settles (or its window closes), so the Manage
  // window, which can't see this component's state, can re-enable its buttons.
  const startDownload = async (asset: Asset, repo?: string) => {
    try {
      const result = await downloadAsset(asset, repo);
      if (result.error) throw new Error(result.error);
      if (!result.jobId) return;
      setDownloading(true);
      await new Promise<void>((resolve) =>
        showDownloadModal(t, result.jobId!, { state: "queued", filename: asset.name, total: asset.size }, () => {
          setDownloading(false);
          resolve();
        }),
      );
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  // AppDetailsModal persists the change itself (saveRepoSettings); this keeps
  // the card's preference in sync and re-checks that one card's latest release
  // for the new channel (from the release cache), so its status and quick
  // Update button follow the channel without a full reload.
  const changeAppChannel = (repo: string, channel: UpdateChannel) => {
    const preference = { channel };
    setRepoPreferences((current) => ({ ...current, [repo]: preference }));
    setApps((current) => current.map((app) => (app.repo === repo ? { ...app, channel } : app)));
    const app = apps.find((item) => item.repo === repo);
    if (app) void hydrate(app, false, preference).then((next) => setApps((current) => current.map((item) => (item.id === next.id ? next : item))));
  };

  const categories = [...new Set(apps.map((app) => app.category))].sort((a, b) => a.localeCompare(b));
  // A category that vanished on reload (registry change) stops filtering rather than hiding everything.
  const activeCategory = categories.includes(categoryFilter) ? categoryFilter : "";

  // Discover's filters, with the Status and Category values overridable so each
  // dropdown option can say how many cards it would show next to the other filters.
  const matchesFilters = (app: App, installed = installedFilter, category = activeCategory) =>
    (!query || `${app.name} ${app.repo} ${app.category} ${app.description ?? ""}`.toLowerCase().includes(query.toLowerCase())) &&
    (installed === "All" || (installed === "Installed") === Boolean(app.installedVersion)) &&
    (!category || app.category === category);
  const countWith = (installed: string, category: string) => apps.filter((app) => matchesFilters(app, installed, category)).length;
  const discoverFilters = view === "discover" && browsing && (
    <DiscoverFilters
      query={query}
      onQuery={setQuery}
      installed={installedFilter}
      onInstalled={setInstalledFilter}
      category={activeCategory}
      onCategory={setCategoryFilter}
      categories={categories}
      countWith={countWith}
      sortOrder={sortOrder}
      onSortOrder={setSortOrder}
      thenBy={thenBy}
      onThenBy={setThenBy}
    />
  );

  const totalDownloads = apps.reduce((sum, app) => sum + (app.stats?.downloads ?? 0), 0);

  const visibleApps = apps
    .filter((app) =>
      view === "updates"
        ? app.updateAvailable === true
        : matchesFilters(app),
    )
    // Apps with an update first; Updates keeps registry order otherwise, Discover follows the Sort
    // dropdown. The registry only ever appends (custom repos come after it), so "Recently added" is
    // that order reversed. Plugins without stats (added repos) go last when sorting by them.
    .sort((a, b) =>
      Number(b.updateAvailable === true) - Number(a.updateAvailable === true) || (view === "updates" ? 0
        : compareBy(sortOrder, a, b, apps) || compareBy(thenBy, a, b, apps) || compareBy("az", a, b, apps)));
  const home = view === "discover" && !browsing;
  // Discover's grid shows three rows of cards a page; lists (and Updates) show everything.
  const openBrowse = (category: string, sort?: SortOrder) => {
    setCategoryFilter(category);
    if (sort) setSortOrder(sort);
   
    setBrowsing(true);
  };
  // Biggest categories first, as chips on the home.
  const categoryCounts = categories.map((category) => [category, apps.filter((app) => app.category === category).length] as const).sort((a, b) => b[1] - a[1]);
  // A shelf is one row of cards, or in the list view a few rows (it follows the Grid / List choice).
  const shelfSize = layout === "list" ? 4 : columnsPerRow;
  const shelf = (order: SortOrder) => [...apps].sort((a, b) => compareBy(order, a, b, apps) || compareBy("az", a, b, apps)).slice(0, shelfSize);
  const updateCount = apps.filter((app) => app.updateAvailable).length;
  // Decky plugins the Updates page can update in one batch (see updateDeckyPlugins).
  const batchUpdates = view === "updates" && !hiddenButtons.includes("update")
    ? visibleApps.flatMap((app) => {
        const action = app.latestVersion ? installAction(app, { tag: app.latestVersion, assets: app.assets }) : null;
        return app.updateAvailable === true && action?.type === PLUGIN_INSTALL_TYPE.UPDATE && !needsFreshInstall(action.name, action.type) ? [{ asset: app.assets[0], repo: app.repo, name: action.name, version: app.latestVersion! }] : [];
      })
    : [];
  // Decky's own dialog takes over, so leave the page once the request is sent.
  const updateAll = async () => {
    const label = t("content.updateAll", { count: batchUpdates.length });
    if (!(await confirmPluginInstall(t, `${label}?`, label))) return;
    setUpdatingAll(true);
    void updateDeckyPlugins(batchUpdates)
      .catch((error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }))
      .finally(() => setUpdatingAll(false));
    Navigation.NavigateBack();
  };
  const renderCard = (app: App, cardLayout?: "row") => (
    <AppCard
      app={app}
      layout={cardLayout}
      preference={repoPreferences[app.repo] ?? { channel: "stable" }}
      downloadDisabled={downloading}
      hiddenButtons={hiddenButtons}
      onDownload={(asset) => startDownload(asset, app.repo)}
      onChannelChange={changeAppChannel}
      onUninstalled={() => void load()}
    />
  );
  const renderGrid = (items: App[]) => (
    <FocusableGrid items={items} columns={fullPage ? columnsPerRow : 1} keyFor={(app) => app.id}>
      {(app) => renderCard(app)}
    </FocusableGrid>
  );

  const page = (
      <>
      {view === "discover" && <Welcome />}
      {loading && (
        <PanelSection>
          <PanelSectionRow>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: "50vh" }}>
              <Spinner style={{ width: "1.1em" }} /> {t("content.loading")}
              {apps.length > 0 && ` ${checked}/${apps.length}`}
            </div>
          </PanelSectionRow>
        </PanelSection>
      )}
      {loadError && (
        <Card accent="#ff6b6b">
          <PanelSection title={t("content.loadErrorTitle")}>
            <PanelSectionRow>{loadError}</PanelSectionRow>
            <PanelSectionRow>
              <Button style={compactButtonStyle} onClick={() => void load(true)}>
                <FaSync /> {t("content.tryAgain")}
              </Button>
            </PanelSectionRow>
          </PanelSection>
        </Card>
      )}
      {!loading && !loadError && (
        <>
          <ContentHeader
            view={view}
            title={browsing ? activeCategory || t("discover.allPlugins") : info.title}
            badge={view === "updates" ? updateCount > 0 && <span className="deckyhub-update-count" title={t("toast.updatesAvailable", { count: updateCount })} style={countBadgeStyle}>{updateCount}</span>
              : totalDownloads > 0 && <span className="deckyhub-total-downloads" title={t("view.totalDownloads", { count: totalDownloads.toLocaleString() })} style={{ color: "#8b9aa7", fontSize: "max(12px, 0.7em)", fontWeight: 400 }}>{t("view.totalDownloads", { count: compactNumber(totalDownloads) })}</span>}
            description={browsing ? t("discover.pluginCount", { count: visibleApps.length }) : info.description}
            onBack={browsing ? () => setBrowsing(false) : undefined}
            layout={layout}
            onLayout={setLayout}
            onRefresh={() => void load(true)}
            updateAllCount={batchUpdates.length}
            updatingAll={updatingAll}
            onUpdateAll={() => void updateAll()}
          />
          <div ref={swapRef}>
          {home ? (
            <DiscoverHome total={apps.length} categories={categoryCounts} shelf={shelf} onBrowse={openBrowse} renderGrid={(items) => layout === "list" ? <AppList apps={items} layout="list" columns={1} renderCard={renderCard} /> : renderGrid(items)} />
          ) : (
            // B goes back to the shelves while browsing; elsewhere it leaves the page as usual.
            <Focusable flow-children="down" onCancelButton={browsing ? () => setBrowsing(false) : undefined} onCancelActionDescription={browsing ? t("nav.discover") : undefined}>
              {discoverFilters}
              <AppList apps={visibleApps} layout={layout} columns={columnsPerRow} renderCard={renderCard} />
            </Focusable>
          )}
          </div>
          {!home && !visibleApps.length && (
            <EmptyState
              title={info.empty}
              toDiscover={view === "updates"}
              onClear={view === "discover" && (query || installedFilter !== "All" || activeCategory) ? () => { setQuery(""); setInstalledFilter("All"); setCategoryFilter(""); } : undefined}
            />
          )}
        </>
      )}
      </>
  );


  return fullPage ? (
    <div ref={pageRef}>
      <RateLimitBanner />
      {page}
    </div>
  ) : (
    <div ref={quickAccessRef}>
      <RateLimitBanner stacked />
      {/* Loads installed apps the same way the Updates page does, for its Updates count. */}
      <QuickAccessNav updateCount={updateCount} listedCount={listedCount} />
    </div>
  );
}
