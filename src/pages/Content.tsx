import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Dropdown, Focusable, GamepadButton, Navigation, PanelSection, PanelSectionRow, Spinner, TextField } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaArrowCircleUp, FaArrowLeft, FaCog, FaCompass, FaFileExport, FaList, FaSearch, FaSync, FaTh, FaTimes, FaArrowUp } from "react-icons/fa";
import { downloadAsset, exportLogs, getApps, getSettings, REGISTRY_UPDATED } from "../api";
import { useT } from "../i18n";
import type { App, Asset, HideableButton, PluginStats, RepoPreference, UpdateChannel, View } from "../types";
import { compactButtonStyle, DEFAULT_COLUMNS_PER_ROW, compactNumber, disclaimerStyle, fetchPluginStats, getDeckyBackend, hydrate, installAction, log, needsFreshInstall, notifyUpdates, PLUGIN_INSTALL_TYPE, surfaceStyle, updateDeckyPlugins } from "../utils";
import { AppCard, RootBadge } from "../components/AppCard";
import { confirmPluginInstall } from "../components/AppDetailsModal";
import { CleanupSection } from "../components/CleanupSection";
import { showDownloadModal } from "../components/DownloadProgress";
import { FocusableGrid } from "../components/FocusableGrid";
import { Card, PageHeader } from "../components/Card";
import { KeepInView, keepInView } from "../components/KeepInView";
import { Pager } from "../components/Pager";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { DeckyHubUpdate } from "../components/DeckyHubUpdate";

// ponytail: fixed pool of 8 GitHub requests in flight; lower it if the registry grows
// big enough to trip GitHub's secondary (burst) rate limit.
const RELEASE_CONCURRENCY = 8;

const NAV_LINKS = [["updates", FaArrowCircleUp], ["discover", FaCompass], ["search", FaSearch], ["settings", FaCog]] as const;


const countBadgeStyle = { minWidth: "1.5em", padding: "0 6px", borderRadius: 999, background: "#f0c33c", color: "#1a1a1a", fontSize: "0.8em", fontWeight: 700, lineHeight: "1.5em", textAlign: "center" as const };

const SORT_ORDERS = ["az", "za", "downloads", "stars", "updated", "added"] as const;
type SortOrder = (typeof SORT_ORDERS)[number];

// Discover's home shelves, each the top of the list in one order, with See all for the rest.
const SHELVES = [["popular", "downloads"], ["recent", "updated"], ["new", "added"]] as const;
// List pages hold this many rows; grid pages three rows of cards.
const LIST_PAGE_SIZE = 10;

const chipStyle = { ...compactButtonStyle, width: "auto", marginBottom: 0, padding: "4px 16px", borderRadius: 999 };
const bumperStyle = { padding: "1px 7px", borderRadius: 5, background: "rgba(255, 255, 255, 0.12)", fontSize: "0.75em", fontWeight: 700 };

export function Content({ fullPage }: { fullPage?: View }) {
  const t = useT();
  const [apps, setApps] = useState<App[]>([]);
  const view: View = fullPage ?? "updates";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [pageIndex, setPage] = useState(0);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [columnsPerRow, setColumnsPerRow] = useState(DEFAULT_COLUMNS_PER_ROW);
  const [repoPreferences, setRepoPreferences] = useState<Record<string, RepoPreference>>({});
  const [hiddenButtons, setHiddenButtons] = useState<HideableButton[]>([]);
  const [updatingAll, setUpdatingAll] = useState(false);
  // Release checks finished out of the current load, shown while Updates waits on them.
  const [checked, setChecked] = useState(0);
  // Every listed plugin, for the Quick Access menu's Discover button (its own list is installed ones only).
  const [listedCount, setListedCount] = useState(0);
  const quickAccessRef = useRef<HTMLDivElement>(null);

  const info = view === "updates"
    ? { title: t("nav.updates"), description: t("view.updatesDescription"), empty: t("view.updatesEmpty") }
    : { title: t("nav.discover"), description: t("view.discoverDescription"), empty: t("view.discoverEmpty") };

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
  const withCount = (label: string, count: number) => `${label} (${count})`;

  const discoverFilters = view === "discover" && browsing && (
    <Card>
    <PanelSection>
      <PanelSectionRow>
        <Focusable flow-children="right" style={{ display: "flex", gap: 12 }}>
          {/* Twice a dropdown's width: on a Deck the dropdowns' own minimum width otherwise left it no wider than one. */}
          <div style={{ flex: "2 1 0", minWidth: 0 }}>
            {/* Own label instead of TextField's, which Steam renders uppercase and padded, out of line with the dropdowns. */}
            <div style={{ fontSize: "0.85em" }}>
              <div style={{ marginBottom: 4 }}>{t("filter.search")}</div>
              <TextField
                {...({ "aria-label": t("filter.search") } as any)}
                value={query}
                bShowClearAction
                onChange={(event) => { setQuery(event.currentTarget.value); setPage(0); }}
              />
            </div>
          </div>
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontSize: "0.85em" }}>
              <div style={{ marginBottom: 4 }}>{t("filter.status")}</div>
              <Dropdown
                {...({ "aria-label": t("filter.status"), style: { width: "100%" } } as any)}
                menuLabel={t("filter.status")}
              rgOptions={[
                { label: withCount(t("filter.all"), countWith("All", activeCategory)), data: "All" },
                { label: withCount(t("filter.installed"), countWith("Installed", activeCategory)), data: "Installed" },
                { label: withCount(t("filter.notInstalled"), countWith("Not Installed", activeCategory)), data: "Not Installed" },
              ]}
              selectedOption={installedFilter}
              onChange={({ data }) => { setInstalledFilter(data); setPage(0); }}
              />
            </div>
          </div>
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontSize: "0.85em" }}>
              <div style={{ marginBottom: 4 }}>{t("filter.category")}</div>
              <Dropdown
                {...({ "aria-label": t("filter.category"), style: { width: "100%" } } as any)}
                menuLabel={t("filter.category")}
                rgOptions={[{ label: withCount(t("filter.all"), countWith(installedFilter, "")), data: "" }, ...categories.map((category) => ({ label: withCount(category, countWith(installedFilter, category)), data: category }))]}
                selectedOption={activeCategory}
                onChange={({ data }) => { setCategoryFilter(data); setPage(0); }}
              />
            </div>
          </div>
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontSize: "0.85em" }}>
              <div style={{ marginBottom: 4 }}>{t("filter.sort")}</div>
              <Dropdown
                {...({ "aria-label": t("filter.sort"), style: { width: "100%" } } as any)}
                menuLabel={t("filter.sort")}
                rgOptions={SORT_ORDERS.map((order) => ({ label: t(`sort.${order}`), data: order }))}
                selectedOption={sortOrder}
                onChange={({ data }) => { setSortOrder(data); setPage(0); }}
              />
            </div>
          </div>
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontSize: "0.85em" }}>
              <div style={{ marginBottom: 4 }}>{t("filter.thenBy")}</div>
              <Dropdown
                {...({ "aria-label": t("filter.thenBy"), style: { width: "100%" } } as any)}
                menuLabel={t("filter.thenBy")}
                rgOptions={SORT_ORDERS.map((order) => ({ label: t(`sort.${order}`), data: order }))}
                selectedOption={thenBy}
                onChange={({ data }) => { setThenBy(data); setPage(0); }}
              />
            </div>
          </div>
        </Focusable>
      </PanelSectionRow>
    </PanelSection>
    </Card>
  );

  const releasedAt = (app: App) => Date.parse(app.stats?.updated || app.publishedAt || "") || 0;
  const totalDownloads = apps.reduce((sum, app) => sum + (app.stats?.downloads ?? 0), 0);

  // One Sort option's order; 0 for a tie.
  const compareBy = (order: SortOrder, a: App, b: App) =>
    order === "downloads" ? (b.stats?.downloads ?? -1) - (a.stats?.downloads ?? -1)
    : order === "stars" ? (b.stats?.stars ?? -1) - (a.stats?.stars ?? -1)
    : order === "updated" ? releasedAt(b) - releasedAt(a)
    : order === "added" ? apps.indexOf(b) - apps.indexOf(a)
    : order === "za" ? b.name.localeCompare(a.name)
    : a.name.localeCompare(b.name);

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
        : compareBy(sortOrder, a, b) || compareBy(thenBy, a, b) || compareBy("az", a, b)));
  const home = view === "discover" && !browsing;
  const pageSize = layout === "list" ? LIST_PAGE_SIZE : columnsPerRow * 3;
  const pageCount = Math.max(1, Math.ceil(visibleApps.length / pageSize));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const shownApps = view === "discover" ? visibleApps.slice(currentPage * pageSize, (currentPage + 1) * pageSize) : visibleApps;
  const turnPage = (step: number) => setPage(Math.min(Math.max(currentPage + step, 0), pageCount - 1));
  const openBrowse = (category: string, sort?: SortOrder) => {
    setCategoryFilter(category);
    if (sort) setSortOrder(sort);
    setPage(0);
    setBrowsing(true);
  };
  // Biggest categories first, as chips on the home.
  const categoryCounts = categories.map((category) => [category, apps.filter((app) => app.category === category).length] as const).sort((a, b) => b[1] - a[1]);
  const shelf = (order: SortOrder) => [...apps].sort((a, b) => compareBy(order, a, b) || compareBy("az", a, b)).slice(0, columnsPerRow);
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
          <KeepInView>
            <PageHeader
              icon={view === "updates" ? <FaArrowCircleUp /> : <FaCompass />}
              title={browsing ? activeCategory || t("discover.allPlugins") : info.title}
              badge={view === "updates" ? updateCount > 0 && <span className="deckyhub-update-count" title={t("toast.updatesAvailable", { count: updateCount })} style={countBadgeStyle}>{updateCount}</span>
                : totalDownloads > 0 && <span className="deckyhub-total-downloads" title={t("view.totalDownloads", { count: totalDownloads.toLocaleString() })} style={{ color: "#8b9aa7", fontSize: "0.7em", fontWeight: 400 }}>{t("view.totalDownloads", { count: compactNumber(totalDownloads) })}</span>}
              description={browsing ? t("discover.pluginCount", { count: visibleApps.length }) : info.description}
              actions={
                <>
                  {browsing && (
                    <>
                      <div style={{ flex: "0 0 150px" }}>
                        <Button style={{ ...compactButtonStyle, marginBottom: 0 }} onClick={() => setBrowsing(false)}>
                          <FaArrowLeft /> {t("nav.discover")}
                        </Button>
                      </div>
                      <div style={{ flex: "0 0 120px" }}>
                        <Button style={{ ...compactButtonStyle, marginBottom: 0 }} onClick={() => { setLayout(layout === "grid" ? "list" : "grid"); setPage(0); }}>
                          {layout === "grid" ? <><FaList /> {t("discover.list")}</> : <><FaTh /> {t("discover.grid")}</>}
                        </Button>
                      </div>
                    </>
                  )}
                  <div style={{ flex: "0 0 180px" }}>
                    <Button style={{ ...compactButtonStyle, marginBottom: 0 }} onClick={() => void load(true)}>
                      <FaSync /> {t("content.refresh")}
                    </Button>
                  </div>
                  {batchUpdates.length > 1 && (
                    <div style={{ flex: "0 0 220px" }}>
                      <Button style={{ ...compactButtonStyle, marginBottom: 0 }} disabled={updatingAll} onClick={() => void updateAll()}>
                        <FaArrowUp /> {t("content.updateAll", { count: batchUpdates.length })}
                      </Button>
                    </div>
                  )}
                </>
              }
            />
            <div className="deckyhub-disclaimer" style={disclaimerStyle}>{t("install.disclaimer")}</div>
            {/* The badge's tooltip never shows on a Deck (no hover), so Discover spells it out once. */}
            {view === "discover" && (
              <div className="deckyhub-root-legend" style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: "var(--dh-card-gap, 14px)", color: "#d6f5ff", fontSize: "0.85em" }}>
                <RootBadge t={t} />
                <span>{t("appcard.runsAsRootHint")}</span>
              </div>
            )}
          </KeepInView>
          {home ? (
            <>
              <Focusable className="deckyhub-category-chips" flow-children="right" onFocus={keepInView} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "var(--dh-card-gap, 14px)" }}>
                {[["", apps.length] as const, ...categoryCounts].map(([category, count]) => (
                  <Button key={category} style={chipStyle} onClick={() => openBrowse(category)}>
                    {category || t("discover.allPlugins")} <span style={{ opacity: 0.7 }}>{count}</span>
                  </Button>
                ))}
              </Focusable>
              {SHELVES.map(([name, order]) => (
                <section key={name} className={`deckyhub-shelf-${name}`}>
                  <Focusable flow-children="right" onFocus={keepInView} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <h3 style={{ margin: 0, flex: 1, color: "#fff", fontSize: "1.2em" }}>{t(`discover.${name}`)}</h3>
                    <div style={{ flex: "0 0 150px" }}>
                      <Button style={{ ...compactButtonStyle, marginBottom: 0 }} onClick={() => openBrowse("", order)}>
                        {t("discover.seeAll")} ›
                      </Button>
                    </div>
                  </Focusable>
                  {renderGrid(shelf(order))}
                </section>
              ))}
            </>
          ) : (
            // L1 / R1 turn the page wherever focus is in the list.
            <Focusable flow-children="down" onButtonDown={(event: { detail: { button: number } }) => {
              if (view !== "discover") return;
              if (event.detail.button === GamepadButton.BUMPER_LEFT) turnPage(-1);
              if (event.detail.button === GamepadButton.BUMPER_RIGHT) turnPage(1);
            }}>
              {discoverFilters}
              {view === "discover" && layout === "list" ? (
                <Focusable flow-children="down" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {shownApps.map((app) => (
                    <Focusable key={app.id} flow-children="right" onFocus={keepInView}>
                      {renderCard(app, "row")}
                    </Focusable>
                  ))}
                </Focusable>
              ) : (
                renderGrid(shownApps)
              )}
              {view === "discover" && pageCount > 1 && (
                <div className="deckyhub-pager" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={bumperStyle}>L1</span>
                  <div style={{ flex: 1 }}><Pager page={currentPage} total={pageCount} onChange={setPage} /></div>
                  <span style={bumperStyle}>R1</span>
                </div>
              )}
            </Focusable>
          )}
          {!home && !visibleApps.length && (
            <div className="deckyhub-empty" onFocus={keepInView} style={{ ...surfaceStyle, padding: "16px 14px", textAlign: "center" }}>
              {/* Decky's section title is a left-aligned flex row; center it too. */}
              <style>{".deckyhub-empty div { text-align: center; justify-content: center; }"}</style>
              <PanelSection title={info.empty}>
                {view === "updates" ? (
                  <PanelSectionRow>
                    <Button style={compactButtonStyle} onClick={() => Navigation.Navigate("/deckyhub/discover")}>
                      <FaCompass /> {t("nav.discover")}
                    </Button>
                  </PanelSectionRow>
                ) : (query || installedFilter !== "All" || activeCategory) && (
                  <PanelSectionRow>
                    <Button style={compactButtonStyle} onClick={() => { setQuery(""); setInstalledFilter("All"); setCategoryFilter(""); }}>
                      <FaTimes /> {t("repos.clear")}
                    </Button>
                  </PanelSectionRow>
                )}
              </PanelSection>
            </div>
          )}
        </>
      )}
      </>
  );

  // The Quick Access view loads installed apps the same way the Updates page does,
  // and lists Updates only while there is one.
  const navigation = (
    <>
      {/* The only untitled card here: Steam pads a PanelSection's bottom but leaves
          its top to the title, so add the same space above the buttons (seen on a Deck). */}
      <Card>
      <div style={{ paddingTop: 26 }}>
      <PanelSection>
        {NAV_LINKS.filter(([page]) => page !== "updates" || updateCount > 0).map(([page, Icon]) => (
          <PanelSectionRow key={page}>
            <Button style={compactButtonStyle} onClick={() => Navigation.Navigate(`/deckyhub/${page}`)}>
              <Icon /> {t(`nav.${page}`)}
              {page === "updates" && updateCount > 0 && <span style={countBadgeStyle}>{updateCount}</span>}
              {page === "discover" && listedCount > 0 && <span aria-hidden className="deckyhub-discover-count" style={{ ...countBadgeStyle, background: "rgba(255, 255, 255, 0.16)", color: "#fff" }}>{listedCount}</span>}
            </Button>
          </PanelSectionRow>
        ))}
      </PanelSection>
      </div>
      </Card>
      <DeckyHubUpdate />
      <CleanupSection />
      <Card>
        <PanelSection title={t("settings.troubleshooting")}>
          <PanelSectionRow>
            <Button style={compactButtonStyle} onClick={() => void exportLogs().then(({ path }) => toaster.toast({ title: "DeckyHub", body: t("repos.exportedTo", { path }) }), (error) => toaster.toast({ title: "DeckyHub", body: String(error) }))}>
              <FaFileExport /> {t("settings.exportLogs")}
            </Button>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={{ color: "#8fcef4", fontSize: "0.85em" }}>{t("settings.exportLogsNote")}</div>
          </PanelSectionRow>
        </PanelSection>
      </Card>
    </>
  );

  return fullPage ? (
    <>
      <RateLimitBanner />
      {page}
    </>
  ) : (
    <div ref={quickAccessRef}>
      <RateLimitBanner stacked />
      {navigation}
    </div>
  );
}
