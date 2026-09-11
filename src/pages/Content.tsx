import { toaster } from "@decky/api";
import { ButtonItem, DropdownItem, Navigation, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaSync } from "react-icons/fa";
import { cancelDownload, downloadAsset, getApps, getDownload, getSettings, queueDownloads, REGISTRY_UPDATED } from "../api";
import type { App, Asset, Download, RepoPreference, Settings, View } from "../types";
import { hydrate, notifyUpdates } from "../utils";
import { AppCard } from "../components/AppCard";
import { showDownloadComplete } from "../components/DownloadProgress";

const viewInfo: Record<View, { title: string; description: string; empty: string }> = {
  updates: { title: "Updates", description: "Updates available for your installed tools.", empty: "Everything installed is up to date." },
  discover: { title: "Discover", description: "Browse supported GitHub projects and their ZIP releases.", empty: "No repositories are available." },
};

export function Content({ fullPage }: { fullPage?: View }) {
  const [apps, setApps] = useState<App[]>([]);
  const [view] = useState<View>(fullPage ?? "updates");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [job, setJob] = useState<{ id: string; state: Download } | null>(null);
  const [query, setQuery] = useState("");
  const [installedFilter, setInstalledFilter] = useState("All");

  const load = async (force = false) => {
    setLoading(true);
    try {
      const [appData, settings] = await Promise.all([getApps(), getSettings()]);
      const local = appData.apps;
      const preferences = (settings as Settings & { repoSettings?: Record<string, RepoPreference> }).repoSettings || {};
      setApps(local);
      setLoadError(null);
      setLoading(false);
      const hydrated = await Promise.all(local.map((app) => hydrate(app, force, preferences[app.repo])));
      setApps(hydrated);
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
    showDownloadComplete("Download Complete", job.state.path);
  }, [job?.id, job?.state.state]);

  const startDownload = async (asset: Asset, repo?: string) => {
    const result = await downloadAsset(asset, repo);
    if (result.jobId) setJob({ id: result.jobId, state: { state: "queued" } });
  };

  const discoverFilters = view === "discover" && (
    <PanelSection title="Filter Repositories">
      <PanelSectionRow>
        <TextField label="Search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label="Status"
          rgOptions={[
            { label: "All", data: "All" },
            { label: "Installed", data: "Installed" },
            { label: "Not Installed", data: "Not Installed" },
          ]}
          selectedOption={installedFilter}
          onChange={({ data }) => setInstalledFilter(data)}
        />
      </PanelSectionRow>
    </PanelSection>
  );

  const list = (filter: (app: App) => boolean, info: (typeof viewInfo)[View]) => (
    <>
      {discoverFilters}
      {loading && (
        <PanelSection title="Loading DeckyHub…">
          <PanelSectionRow>Loading…</PanelSectionRow>
        </PanelSection>
      )}
      {loadError && (
        <PanelSection title="Could Not Load DeckyHub">
          <PanelSectionRow>{loadError}</PanelSectionRow>
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => void load(true)}>
              Try Again
            </ButtonItem>
          </PanelSectionRow>
        </PanelSection>
      )}
      {!loading && !loadError && (
        <>
          <PanelSection title={info.title}>
            <PanelSectionRow>{info.description}</PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem layout="below" onClick={() => void load(true)}>
                <FaSync /> Refresh
              </ButtonItem>
            </PanelSectionRow>
            {view === "updates" && apps.some((app) => app.updateAvailable && app.assets[0]) && (
              <PanelSectionRow>
                <ButtonItem
                  layout="below"
                  onClick={() =>
                    void queueDownloads(apps.filter((app) => app.updateAvailable && app.assets[0]).map((app) => ({ asset: app.assets[0], repo: app.repo }))).then((result) =>
                      toaster.toast({ title: "DeckyHub", body: `${result.jobIds.length} updates queued.` })
                    )
                  }
                >
                  Update All
                </ButtonItem>
              </PanelSectionRow>
            )}
            {job && (
              <PanelSectionRow>
                <div>
                  <strong>{job.state.filename ?? "Download"}</strong>
                  <br />
                  <small>
                    {job.state.state} {job.state.total ? `· ${Math.round((100 * (job.state.received ?? 0)) / job.state.total)}%` : ""}
                  </small>
                  {job.state.state === "downloading" && (
                    <ButtonItem layout="below" onClick={() => void cancelDownload(job.id)}>
                      Cancel
                    </ButtonItem>
                  )}
                </div>
              </PanelSectionRow>
            )}
          </PanelSection>
          {apps
            .filter(
              (app) =>
                filter(app) &&
                (view !== "discover" ||
                  ((!query || `${app.name} ${app.repo}`.toLowerCase().includes(query.toLowerCase())) &&
                    (installedFilter === "All" || (installedFilter === "Installed") === Boolean(app.installedVersion))))
            )
            .map((app) => (
              <AppCard key={app.id} app={app} job={job} onDownload={(asset) => void startDownload(asset, app.repo)} onCancel={(jobId) => void cancelDownload(jobId)} />
            ))}
          {!apps.filter(filter).length && (
            <PanelSection title={info.empty}>
              <PanelSectionRow>Use Discover to browse the registry.</PanelSectionRow>
            </PanelSection>
          )}
        </>
      )}
    </>
  );

  const navigation = (
    <>
      <PanelSection title="Browse">
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => Navigation.Navigate("/deckyhub/updates")}>
            Updates
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => Navigation.Navigate("/deckyhub/discover")}>
            Discover
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => Navigation.Navigate("/deckyhub/repositories")}>
            Repositories
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => Navigation.Navigate("/deckyhub/settings")}>
            Settings
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );

  const page = view === "updates" ? list((app) => app.updateAvailable === true, viewInfo.updates) : list(() => true, viewInfo.discover);
  return fullPage ? page : navigation;
}
