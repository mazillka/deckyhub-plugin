import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Dropdown, Focusable, Navigation, PanelSection, PanelSectionRow, Spinner, TextField } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaSync } from "react-icons/fa";
import { downloadAsset, getApps, getSettings, REGISTRY_UPDATED } from "../api";
import { useT } from "../i18n";
import type { App, Asset, HideableButton, RepoPreference, UpdateChannel, View } from "../types";
import { compactButtonStyle, DEFAULT_COLUMNS_PER_ROW, getDeckyBackend, hydrate, notifyUpdates, sectionDividerStyle } from "../utils";
import { AppCard } from "../components/AppCard";
import { CleanupSection } from "../components/CleanupSection";
import { showDownloadModal } from "../components/DownloadProgress";
import { FocusableGrid } from "../components/FocusableGrid";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { DeckyHubUpdate } from "../components/DeckyHubUpdate";

const RELEASE_CONCURRENCY = 4;
const CARDS_PER_PAGE = 20;

export function Content({ fullPage }: { fullPage?: View }) {
  const t = useT();
  const [apps, setApps] = useState<App[]>([]);
  const view: View = fullPage ?? "updates";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [query, setQuery] = useState("");
  const [installedFilter, setInstalledFilter] = useState("All");
  const [cardPage, setCardPage] = useState(0);
  const [columnsPerRow, setColumnsPerRow] = useState(DEFAULT_COLUMNS_PER_ROW);
  const [repoPreferences, setRepoPreferences] = useState<Record<string, RepoPreference>>({});
  const [hiddenButtons, setHiddenButtons] = useState<HideableButton[]>([]);
  const quickAccessRef = useRef<HTMLDivElement>(null);

  const viewInfo: Record<View, { title: string; description: string; empty: string }> = {
    updates: { title: t("nav.updates"), description: t("view.updatesDescription"), empty: t("view.updatesEmpty") },
    discover: { title: t("nav.discover"), description: t("view.discoverDescription"), empty: t("view.discoverEmpty") },
  };

  const load = async (force = false) => {
    setLoading(true);
    try {
      const [appData, settings] = await Promise.all([getApps(), getSettings()]);
      const local = appData.apps;
      const preferences = settings.repoSettings || {};
      setRepoPreferences(preferences);
      setColumnsPerRow(settings.columnsPerRow || DEFAULT_COLUMNS_PER_ROW);
      setHiddenButtons(settings.hiddenButtons ?? []);
      const tracked = view === "updates" ? local.filter((app) => app.installedVersion) : local;
      setCardPage(0);
      setApps(tracked);
      setLoadError(null);
      const hydrated: App[] = [];
      for (let index = 0; index < tracked.length; index += RELEASE_CONCURRENCY) {
        hydrated.push(...await Promise.all(tracked.slice(index, index + RELEASE_CONCURRENCY).map((app) => hydrate(app, force, preferences[app.repo]))));
      }
      setApps(hydrated);
      setLoading(false);
      notifyUpdates(hydrated);
    } catch (error) {
      setLoadError(String(error));
      setLoading(false);
    }
  };

  useEffect(() => {
    const refresh = () => void load(true);
    void load();
    const timer = window.setInterval(refresh, 15 * 60 * 1000);
    window.addEventListener(REGISTRY_UPDATED, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(REGISTRY_UPDATED, refresh);
    };
  }, []);

  // Decky Loader reports when an install it ran finishes; reload so the card
  // picks up the new installed version (release data stays cached).
  useEffect(() => {
    const backend = getDeckyBackend();
    if (!backend) return;
    const onFinish = () => void load();
    backend.addEventListener("loader/plugin_download_finish", onFinish);
    return () => backend.removeEventListener("loader/plugin_download_finish", onFinish);
  }, []);

  useEffect(() => {
    if (!fullPage) requestAnimationFrame(() => quickAccessRef.current?.scrollIntoView({ block: "start" }));
  }, [fullPage]);

  const startDownload = async (asset: Asset, repo?: string) => {
    try {
      const result = await downloadAsset(asset, repo);
      if (result.error) throw new Error(result.error);
      if (result.jobId) {
        setDownloading(true);
        showDownloadModal(t, result.jobId, { state: "queued", filename: asset.name, total: asset.size }, (state) => {
          setDownloading(false);
          if (state.state === "error") toaster.toast({ title: "DeckyHub download failed", body: state.error || "The download failed without a reported reason." });
        });
      }
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  // AppDetailsModal persists the change itself (saveRepoSettings); this just
  // keeps the card's "Channel: …" label and the cached preference in sync
  // without a full reload.
  const changeAppChannel = (repo: string, channel: UpdateChannel) => {
    setRepoPreferences((current) => ({ ...current, [repo]: { channel, assetFilter: current[repo]?.assetFilter ?? [] } }));
    setApps((current) => current.map((app) => (app.repo === repo ? { ...app, channel } : app)));
  };

  const discoverFilters = view === "discover" && (
    <PanelSection>
      <PanelSectionRow>
        <Focusable flow-children="right" style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextField label={t("filter.search")} value={query} onChange={(event) => { setQuery(event.currentTarget.value); setCardPage(0); }} />
          </div>
          <div style={{ flex: "0 0 220px" }}>
            <div style={{ fontSize: "0.85em" }}>
              <div style={{ marginBottom: 4 }}>{t("filter.status")}</div>
              <Dropdown
                {...({ "aria-label": t("filter.status"), style: { width: "100%" } } as any)}
                menuLabel={t("filter.status")}
              rgOptions={[
                { label: t("filter.all"), data: "All" },
                { label: t("filter.installed"), data: "Installed" },
                { label: t("filter.notInstalled"), data: "Not Installed" },
              ]}
              selectedOption={installedFilter}
              onChange={({ data }) => { setInstalledFilter(data); setCardPage(0); }}
              />
            </div>
          </div>
        </Focusable>
      </PanelSectionRow>
    </PanelSection>
  );

  const list = (filter: (app: App) => boolean, info: (typeof viewInfo)[View]) => {
    const visibleApps = apps.filter(
      (app) =>
        filter(app) &&
        (view !== "discover" ||
          ((!query || `${app.name} ${app.repo}`.toLowerCase().includes(query.toLowerCase())) &&
            (installedFilter === "All" || (installedFilter === "Installed") === Boolean(app.installedVersion))))
    );
    const pageCount = Math.max(1, Math.ceil(visibleApps.length / CARDS_PER_PAGE));
    const currentPage = Math.min(cardPage, pageCount - 1);
    const displayedApps = visibleApps.slice(currentPage * CARDS_PER_PAGE, (currentPage + 1) * CARDS_PER_PAGE);
    return (
      <>
      {discoverFilters}
      {discoverFilters && <div aria-hidden style={sectionDividerStyle} />}
      {loading && (
        <PanelSection>
          <PanelSectionRow>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: "50vh" }}>
              <Spinner style={{ width: "1.1em" }} /> {t("content.loading")}
            </div>
          </PanelSectionRow>
        </PanelSection>
      )}
      {loadError && (
        <PanelSection title={t("content.loadErrorTitle")}>
          <PanelSectionRow>{loadError}</PanelSectionRow>
          <PanelSectionRow>
            <Button style={compactButtonStyle} onClick={() => void load(true)}>
              {t("content.tryAgain")}
            </Button>
          </PanelSectionRow>
        </PanelSection>
      )}
      {!loading && !loadError && (
        <>
          <PanelSection title={info.title}>
            <PanelSectionRow>
              <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {info.description && <div style={{ flex: 1, minWidth: 0 }}>{info.description}</div>}
                <div style={{ flex: info.description ? "0 0 180px" : 1 }}>
                  <Button style={compactButtonStyle} onClick={() => void load(true)}>
                    <FaSync /> {t("content.refresh")}
                  </Button>
                </div>
              </Focusable>
            </PanelSectionRow>
          </PanelSection>
          <div aria-hidden style={sectionDividerStyle} />
          <FocusableGrid
            items={displayedApps}
            columns={fullPage ? columnsPerRow : 1}
            keyFor={(app) => app.id}
          >
            {(app) => (
              <AppCard
                app={app}
                preference={repoPreferences[app.repo] ?? { channel: "stable", assetFilter: [] }}
                downloadDisabled={downloading}
                hiddenButtons={hiddenButtons}
                onDownload={(asset) => void startDownload(asset, app.repo)}
                onChannelChange={changeAppChannel}
              />
            )}
          </FocusableGrid>
          {visibleApps.length > CARDS_PER_PAGE && (
            <PanelSection>
              <PanelSectionRow>
                <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <Button style={compactButtonStyle} disabled={currentPage === 0} onClick={() => setCardPage((current) => current - 1)}>
                      {t("repos.previous")}
                    </Button>
                  </div>
                  <span style={{ whiteSpace: "nowrap" }}>{t("repos.pageOf", { page: currentPage + 1, total: pageCount })}</span>
                  <div style={{ flex: 1 }}>
                    <Button style={compactButtonStyle} disabled={currentPage + 1 === pageCount} onClick={() => setCardPage((current) => current + 1)}>
                      {t("repos.next")}
                    </Button>
                  </div>
                </Focusable>
              </PanelSectionRow>
            </PanelSection>
          )}
          {!visibleApps.length && (
            <PanelSection title={info.empty}>
              <PanelSectionRow>{t("content.useDiscover")}</PanelSectionRow>
            </PanelSection>
          )}
        </>
      )}
      </>
    );
  };

  const navigation = (
    <>
      <PanelSection title={t("nav.browse")}>
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={() => Navigation.Navigate("/deckyhub/updates")}>
            {t("nav.updates")}
          </Button>
        </PanelSectionRow>
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={() => Navigation.Navigate("/deckyhub/discover")}>
            {t("nav.discover")}
          </Button>
        </PanelSectionRow>
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={() => Navigation.Navigate("/deckyhub/repositories")}>
            {t("nav.repositories")}
          </Button>
        </PanelSectionRow>
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={() => Navigation.Navigate("/deckyhub/settings")}>
            {t("nav.settings")}
          </Button>
        </PanelSectionRow>
      </PanelSection>
      <div aria-hidden style={sectionDividerStyle} />
      <DeckyHubUpdate />
      <div aria-hidden style={sectionDividerStyle} />
      <CleanupSection />
    </>
  );

  const page = view === "updates" ? list((app) => app.updateAvailable === true, viewInfo.updates) : list(() => true, viewInfo.discover);
  return fullPage ? (
    <>
      <RateLimitBanner />
      {page}
    </>
  ) : (
    <div ref={quickAccessRef}>
      <RateLimitBanner />
      {navigation}
    </div>
  );
}
