import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Focusable, Navigation, PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaSync } from "react-icons/fa";
import { downloadAsset } from "../api";
import { useT } from "../i18n";
import type { App, Asset, RepoPreference, View } from "../types";
import { compactButtonStyle, compactNumber, hydrate, installAction, needsFreshInstall, PLUGIN_INSTALL_TYPE, updateDeckyPlugins } from "../utils";
import { AppCard, type CardLayout } from "../components/AppCard";
import { pillStyle } from "../components/AppBadges";
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
import { restoreBrowse, returned, saveBrowse } from "../browseState";
import { useApps } from "../hooks/useApps";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { offerPendingInstalls } from "../components/PendingInstalls";
import { Welcome } from "../components/Welcome";
import { UiStyleSection } from "../components/UiStyleSection";
import { ExpAppCard } from "../components/experimental/ExpAppCard";
import { ExpHeader } from "../components/experimental/ExpHeader";
import { ExpDiscoverHome } from "../components/experimental/ExpDiscoverHome";
import { ExpDiscoverFilters } from "../components/experimental/ExpDiscoverFilters";
import { ExpQuickAccess } from "../components/experimental/ExpQuickAccess";
import { useUiStyle } from "../uiStyle";



export function Content({ fullPage }: { fullPage?: View }) {
  const t = useT();
  const view: View = fullPage ?? "updates";
  const { apps, setApps, loading, loadError, checked, listedCount, installedCount, columnsPerRow, repoPreferences, setRepoPreferences, hiddenButtons, registryChannel, load } = useApps(view);
  const [downloading, setDownloading] = useState(false);
  // Quick Access' UI Style: Experimental swaps in its own header, cards and panel.
  const experimental = useUiStyle() === "experimental";
  const Header = experimental ? ExpHeader : ContentHeader;
  const Card_ = experimental ? ExpAppCard : AppCard;
  const Filters = experimental ? ExpDiscoverFilters : DiscoverFilters;
  // Opening DeckyHub's Quick Access tab offers the plugins picked in the Desktop Mode installer.
  useEffect(() => {
    if (!fullPage) void offerPendingInstalls(t);
  }, [fullPage]);
  // Back from Steam's browser the page is mounted again: pick up where it was.
  const [restored] = useState(() => (fullPage ? restoreBrowse(view) : undefined));
  useEffect(returned, []);
  const [query, setQuery] = useState(restored?.query ?? "");
  const [installedFilter, setInstalledFilter] = useState(restored?.installedFilter ?? "All");
  // "" means every category.
  const [categoryFilter, setCategoryFilter] = useState(restored?.categoryFilter ?? "");
  const [sortOrder, setSortOrder] = useState<SortOrder>((restored?.sortOrder as SortOrder) ?? "az");
  // Breaks Sort's ties (many plugins share 0 stars or downloads); A to Z breaks any left.
  const [thenBy, setThenBy] = useState<SortOrder>((restored?.thenBy as SortOrder) ?? "az");
  // Discover opens on its shelves; a category chip or See all browses the whole list, a page at a time.
  const [browsing, setBrowsing] = useState(restored?.browsing ?? false);
  const [layout, setLayout] = useLayout();
  const [updatingAll, setUpdatingAll] = useState(false);
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  // Slides the shelves, category, page, layout, filter or sort in when it changes.
  const swapRef = useSwapAnimation([browsing, layout, categoryFilter, installedFilter, sortOrder, thenBy]);

  const info = view === "updates"
    ? { title: t("nav.updates"), description: t("view.updatesDescription"), empty: t("view.updatesEmpty") }
    : view === "installed"
      ? { title: t("filter.installed"), description: undefined, empty: t("view.installedEmpty") }
      : { title: t("nav.discover"), description: t("view.discoverDescription"), empty: t("view.discoverEmpty") };


  // Opening a category, or going back, replaces what had focus: hand it to the
  // Back button or the first chip, so the D-pad doesn't start from nowhere.
  useEffect(() => {
    if (fullPage) saveBrowse(view, { browsing, query, installedFilter, categoryFilter, sortOrder, thenBy });
  }, [browsing, query, installedFilter, categoryFilter, sortOrder, thenBy]);
  // The page scrolls inside its own box: keep its position as it moves, put it back once the list is up.
  const scroller = () => {
    let box: HTMLElement | null = pageRef.current;
    while (box && getComputedStyle(box).overflowY !== "auto") box = box.parentElement;
    return box;
  };
  useEffect(() => {
    const box = fullPage && !loading ? scroller() : null;
    if (!box) return;
    if (restored?.scroll) requestAnimationFrame(() => box.scrollTo({ top: restored.scroll }));
    const onScroll = () => saveBrowse(view, { scroll: box.scrollTop });
    box.addEventListener("scroll", onScroll);
    return () => box.removeEventListener("scroll", onScroll);
  }, [loading]);

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
  // for the new channel or skipped version (from the release cache), so its status
  // and quick Update button follow without a full reload.
  const changeAppPreference = (repo: string, preference: RepoPreference) => {
    setRepoPreferences((current) => ({ ...current, [repo]: preference }));
    setApps((current) => current.map((app) => (app.repo === repo ? { ...app, channel: preference.channel } : app)));
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
    <Filters
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
        : view === "installed" ? Boolean(app.installedVersion) : matchesFilters(app),
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
  const shelf = (order: SortOrder, size = shelfSize) => [...apps].sort((a, b) => compareBy(order, a, b, apps) || compareBy("az", a, b, apps)).slice(0, size);
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
    // Every audit warning any of the batch's releases carries, once each.
    const repos = new Set(batchUpdates.map((update) => update.repo));
    const warnings = [...new Set(visibleApps.filter((app) => repos.has(app.repo)).flatMap((app) => [...(app.stats?.warnings ?? []), ...(app.channel === "prerelease" ? app.stats?.prereleaseWarnings ?? [] : [])]))];
    if (!(await confirmPluginInstall(t, `${label}?`, label, undefined, undefined, warnings))) return;
    setUpdatingAll(true);
    void updateDeckyPlugins(batchUpdates)
      .catch((error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }))
      .finally(() => setUpdatingAll(false));
    Navigation.NavigateBack();
  };
  const renderCard = (app: App, cardLayout?: CardLayout) => (
    <Card_
      app={app}
      layout={cardLayout}
      preference={repoPreferences[app.repo] ?? { channel: "stable" }}
      downloadDisabled={downloading}
      hiddenButtons={hiddenButtons}
      onDownload={(asset) => startDownload(asset, app.repo)}
      onPreferenceChange={changeAppPreference}
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
          <Header
            view={view}
            title={browsing ? activeCategory || t("discover.allPlugins") : info.title}
            badge={
              <>
                {view === "updates" ? updateCount > 0 && <span className="deckyhub-update-count" title={t("toast.updatesAvailable", { count: updateCount })} style={countBadgeStyle}>{updateCount}</span>
                  : view === "discover" && totalDownloads > 0 && <span className="deckyhub-total-downloads" title={t("view.totalDownloads", { count: totalDownloads.toLocaleString() })} style={{ color: "#8b9aa7", fontSize: "max(12px, 0.7em)", fontWeight: 400 }}>{t("view.totalDownloads", { count: compactNumber(totalDownloads) })}</span>}
                {/* Settings > Repositories chose the registry's develop list: say so, so a plugin
                    that's only being tested isn't a surprise. */}
                {registryChannel === "prerelease" && <span className="deckyhub-registry-channel" style={{ ...pillStyle, marginLeft: 8, whiteSpace: "nowrap", color: "#ffa94d", background: "#ffa94d22", borderColor: "#ffa94d66", verticalAlign: "middle" }}>{t("view.prereleaseRegistry")}</span>}
              </>
            }
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
          {home && experimental ? (
            <ExpDiscoverHome total={apps.length} categories={categoryCounts} shelf={shelf} onBrowse={openBrowse} renderCard={renderCard} />
          ) : home ? (
            <DiscoverHome total={apps.length} categories={categoryCounts} shelf={shelf} onBrowse={openBrowse} renderGrid={(items) => layout === "list" ? <AppList apps={items} layout="list" columns={1} renderCard={renderCard} /> : renderGrid(items)} />
          ) : (
            // B goes back to the shelves while browsing; elsewhere it leaves the page as usual.
            <Focusable flow-children="down" onCancelButton={browsing ? () => setBrowsing(false) : undefined} onCancelActionDescription={browsing ? t("nav.discover") : undefined}>
              {discoverFilters}
              <AppList apps={visibleApps} layout={layout} columns={columnsPerRow} renderCard={renderCard} initialCount={restored?.count} onCount={(count) => saveBrowse(view, { count })} />
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
    <div ref={quickAccessRef} className="deckyhub-qam">
      <RateLimitBanner stacked />
      {/* Loads installed apps the same way the Updates page does, for its Updates count. */}
      {experimental
        ? <ExpQuickAccess updates={apps.filter((app) => app.updateAvailable)} listedCount={listedCount} installedCount={installedCount} />
        : <QuickAccessNav updateCount={updateCount} listedCount={listedCount} installedCount={installedCount} />}
      <UiStyleSection />
    </div>
  );
}
