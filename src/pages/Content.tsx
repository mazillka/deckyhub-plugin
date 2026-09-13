import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Dropdown, Focusable, Navigation, PanelSection, PanelSectionRow, Spinner, TextField } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaSync } from "react-icons/fa";
import { cancelDownload, downloadAsset, getApps, getDownload, getSettings, queueDownloads, REGISTRY_UPDATED } from "../api";
import { useT } from "../i18n";
import type { App, Asset, Download, RepoPreference, Settings, View } from "../types";
import { compactButtonStyle, hydrate, notifyUpdates } from "../utils";
import { AppCard } from "../components/AppCard";
import { DownloadProgress, showDownloadComplete } from "../components/DownloadProgress";
import { FocusableGrid } from "../components/FocusableGrid";

export function Content({ fullPage }: { fullPage?: View }) {
  const t = useT();
  const [apps, setApps] = useState<App[]>([]);
  const [view] = useState<View>(fullPage ?? "updates");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [job, setJob] = useState<{ id: string; state: Download } | null>(null);
  const [query, setQuery] = useState("");
  const [installedFilter, setInstalledFilter] = useState("All");
  const downloading = Boolean(job && ["queued", "downloading"].includes(job.state.state));

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
      setApps(local);
      setLoadError(null);
      const hydrated = await Promise.all(local.map((app) => hydrate(app, force, preferences[app.repo])));
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
    if (!job || !["queued", "downloading"].includes(job.state.state)) return;
    const timer = window.setInterval(() => void getDownload(job.id).then((state) => setJob({ id: job.id, state })), 500);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (job?.state.state !== "complete") return;
    showDownloadComplete(t, t("appcard.downloadComplete"), job.state.path);
  }, [job?.id, job?.state.state]);

  const startDownload = async (asset: Asset, repo?: string) => {
    const result = await downloadAsset(asset, repo);
    if (result.jobId) setJob({ id: result.jobId, state: { state: "queued", filename: asset.name, total: asset.size } });
  };

  const discoverFilters = view === "discover" && (
    <PanelSection>
      <PanelSectionRow>
        <Focusable flow-children="right" style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextField label={t("filter.search")} value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
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
              onChange={({ data }) => setInstalledFilter(data)}
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
    return (
      <>
      {discoverFilters}
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
                <div style={{ flex: 1, minWidth: 0 }}>{info.description}</div>
                <div style={{ flex: "0 0 180px" }}>
                  <Button style={compactButtonStyle} onClick={() => void load(true)}>
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
                      const asset = updates[updates.length - 1].assets[0];
                      const jobId = result.jobIds[result.jobIds.length - 1];
                      if (jobId) setJob({ id: jobId, state: { state: "queued", filename: asset.name, total: asset.size } });
                      toaster.toast({ title: "DeckyHub", body: `${result.jobIds.length} updates queued.` });
                    })
                  }
                >
                  {t("content.updateAll")}
                </Button>
              </PanelSectionRow>
            )}
            {job && (
              <PanelSectionRow>
                <div>
                  <strong>{job.state.filename ?? t("content.download")}</strong>
                  <br />
                  <small>
                    {job.state.state} {job.state.total ? `· ${Math.round((100 * (job.state.received ?? 0)) / job.state.total)}%` : ""}
                  </small>
                  <DownloadProgress download={job.state} />
                  {job.state.state === "downloading" && (
                    <Button style={compactButtonStyle} onClick={() => void cancelDownload(job.id)}>
                      {t("content.cancel")}
                    </Button>
                  )}
                </div>
              </PanelSectionRow>
            )}
          </PanelSection>
          <FocusableGrid
            items={visibleApps}
            columns={2}
            keyFor={(app) => app.id}
          >
            {(app) => <AppCard app={app} job={job} downloadDisabled={downloading} onDownload={(asset) => void startDownload(asset, app.repo)} onCancel={(jobId) => void cancelDownload(jobId)} />}
          </FocusableGrid>
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
    </>
  );

  const page = view === "updates" ? list((app) => app.updateAvailable === true, viewInfo.updates) : list(() => true, viewInfo.discover);
  return fullPage ? page : navigation;
}
