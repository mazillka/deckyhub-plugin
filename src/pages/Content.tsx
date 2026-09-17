import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Dropdown, Focusable, Navigation, PanelSection, PanelSectionRow, Spinner, TextField } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaSync } from "react-icons/fa";
import { cancelDownload, downloadAsset, getApps, getDownload, getSettings, queueDownloads, REGISTRY_UPDATED } from "../api";
import { useT } from "../i18n";
import type { App, Asset, Download, RepoPreference, Settings, View } from "../types";
import { compactButtonStyle, hydrate, notifyUpdates, sectionDividerStyle } from "../utils";
import { AppCard } from "../components/AppCard";
import { DownloadProgress, showDownloadComplete } from "../components/DownloadProgress";
import { FocusableGrid } from "../components/FocusableGrid";
import { DeckyHubUpdate } from "../components/DeckyHubUpdate";

const RELEASE_CONCURRENCY = 4;
const CARDS_PER_PAGE = 20;

export function Content({ fullPage }: { fullPage?: View }) {
  const t = useT();
  const [apps, setApps] = useState<App[]>([]);
  const [view] = useState<View>(fullPage ?? "updates");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, Download>>({});
  const completedJobs = useRef(new Set<string>());
  const reportedErrors = useRef(new Set<string>());
  const [query, setQuery] = useState("");
  const [installedFilter, setInstalledFilter] = useState("All");
  const [cardPage, setCardPage] = useState(0);
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const activeJobs = Object.entries(jobs).filter(([, job]) => ["queued", "downloading"].includes(job.state));
  const downloading = activeJobs.length > 0;

  const viewInfo: Record<View, { title: string; description: string; empty: string }> = {
    updates: { title: t("nav.updates"), description: t("view.updatesDescription"), empty: t("view.updatesEmpty") },
    discover: { title: t("nav.discover"), description: t("view.discoverDescription"), empty: t("view.discoverEmpty") },
  };

  const load = async (force = false) => {
    setLoading(true);
    try {
      const [appData, settings] = await Promise.all([getApps(), getSettings()]);
      const local = appData.apps;
      const preferences = (settings as Settings & { repoSettings?: Record<string, RepoPreference> }).repoSettings || {};
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

  useEffect(() => {
    if (!fullPage) requestAnimationFrame(() => quickAccessRef.current?.scrollIntoView({ block: "start" }));
  }, [fullPage]);

  useEffect(() => {
    if (!activeJobs.length) return;
    const updateJobs = () =>
      void Promise.all(activeJobs.map(async ([id]) => [id, await getDownload(id)] as const)).then(
        (states) => setJobs((current) => ({ ...current, ...Object.fromEntries(states) })),
        (error) => setJobs((current) => ({
          ...current,
          ...Object.fromEntries(activeJobs.map(([id, job]) => [id, { ...job, state: "error", error: String(error) }])),
        })),
      );
    const timer = window.setInterval(updateJobs, 500);
    return () => window.clearInterval(timer);
  }, [activeJobs.map(([id]) => id).join(",")]);

  useEffect(() => {
    Object.entries(jobs).forEach(([id, job]) => {
      if (job.state === "complete" && !completedJobs.current.has(id)) {
        completedJobs.current.add(id);
        showDownloadComplete(t, t("appcard.downloadComplete"), job.path);
      }
      if (job.state === "error" && !reportedErrors.current.has(id)) {
        reportedErrors.current.add(id);
        toaster.toast({ title: "DeckyHub download failed", body: job.error || "The download failed without a reported reason." });
      }
    });
  }, [jobs]);

  const startDownload = async (asset: Asset, repo?: string) => {
    try {
      const result = await downloadAsset(asset, repo);
      if (result.error) throw new Error(result.error);
      if (result.jobId) setJobs((current) => ({ ...current, [result.jobId!]: { state: "queued", filename: asset.name, total: asset.size, repo } }));
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  const cancel = (jobId: string) =>
    void cancelDownload(jobId).catch((error) => toaster.toast({ title: "DeckyHub", body: String(error) }));

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
    const updates = apps.filter((app) => app.updateAvailable && app.assets[0]);
    const pageCount = Math.max(1, Math.ceil(visibleApps.length / CARDS_PER_PAGE));
    const currentPage = Math.min(cardPage, pageCount - 1);
    const displayedApps = visibleApps.slice(currentPage * CARDS_PER_PAGE, (currentPage + 1) * CARDS_PER_PAGE);
    return (
      <>
      {discoverFilters}
      {discoverFilters && <div aria-hidden style={sectionDividerStyle} />}
      {loading && (
        <PanelSection title={t("content.loadingTitle")}>
          <PanelSectionRow>
            <Spinner style={{ width: "1.1em", margin: "0 8px 0 0" }} /> {t("content.loading")}
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
                  <Button style={{ ...compactButtonStyle, textAlign: "center" }} onClick={() => void load(true)}>
                    <FaSync /> {t("content.refresh")}
                  </Button>
                </div>
              </Focusable>
            </PanelSectionRow>
            {view === "updates" && updates.length > 0 && (
              <PanelSectionRow>
                <Button
                  style={compactButtonStyle}
                  disabled={downloading}
                  onClick={() =>
                    void queueDownloads(updates.map((app) => ({ asset: app.assets[0], repo: app.repo }))).then((result) => {
                      if (result.error) throw new Error(result.error);
                      setJobs((current) => ({
                        ...current,
                        ...Object.fromEntries(result.jobIds!.map((id, index) => [id, { state: "queued", filename: updates[index].assets[0].name, total: updates[index].assets[0].size, repo: updates[index].repo }])),
                      }));
                      toaster.toast({ title: "DeckyHub", body: `${result.jobIds!.length} updates queued.` });
                    }).catch((error) => toaster.toast({ title: "DeckyHub", body: String(error) }))
                  }
                >
                  {t("content.updateAll")}
                </Button>
              </PanelSectionRow>
            )}
            {activeJobs.map(([id, job]) => (
              <PanelSectionRow key={id}>
                <div>
                  <strong>{job.filename ?? t("content.download")}</strong>
                  <br />
                  <small>{job.state} {job.total ? `· ${Math.round((100 * (job.received ?? 0)) / job.total)}%` : ""}</small>
                  <DownloadProgress download={job} />
                  {job.state === "downloading" && <Button style={compactButtonStyle} onClick={() => cancel(id)}>{t("content.cancel")}</Button>}
                </div>
              </PanelSectionRow>
            ))}
          </PanelSection>
          <div aria-hidden style={sectionDividerStyle} />
          <FocusableGrid
            items={displayedApps}
            columns={fullPage ? 2 : 1}
            keyFor={(app) => app.id}
          >
            {(app) => {
              const match = Object.entries(jobs).find(([, job]) => job.repo === app.repo && app.assets.some((asset) => asset.name === job.filename));
              return <AppCard app={app} job={match && { id: match[0], state: match[1] }} downloadDisabled={downloading} onDownload={(asset) => void startDownload(asset, app.repo)} onCancel={cancel} />;
            }}
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
    </>
  );

  const page = view === "updates" ? list((app) => app.updateAvailable === true, viewInfo.updates) : list(() => true, viewInfo.discover);
  return fullPage ? page : <div ref={quickAccessRef}>{navigation}</div>;
}
