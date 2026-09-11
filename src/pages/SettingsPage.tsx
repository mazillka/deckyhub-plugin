import { FileSelectionType, fetchNoCors, openFilePicker, toaster } from "@decky/api";
import { ButtonItem, DropdownItem, Navigation, PanelSection, PanelSectionRow, TextField, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import {
  addCustomRepo,
  cancelDownload,
  exportCustomRepos,
  getCustomRepos,
  getDeckyHubInfo,
  getDownload,
  getSettings,
  importCustomRepos,
  installDeckyHubUpdate,
  REGISTRY_UPDATED,
  removeCustomRepo,
  saveSettings,
} from "../api";
import type { Asset, DeckyHubInfo, DeckyHubRelease, Download, ManagedRepo, SearchRepo, Settings } from "../types";
import { latestDeckyHubRelease } from "../utils";
import { showDownloadComplete } from "../components/DownloadProgress";

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ verifySha256: true, overwriteExisting: true, downloadLocation: "plugins", updateChannel: "stable" });
  const [deckyHubInfo, setDeckyHubInfo] = useState<DeckyHubInfo>({ version: "unknown" });
  const [deckyHubRelease, setDeckyHubRelease] = useState<DeckyHubRelease>({});
  const [updateJob, setUpdateJob] = useState<{ id: string; state: Download } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRepo[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [customRepos, setCustomRepos] = useState<ManagedRepo[]>([]);

  const refreshRepos = () => void getCustomRepos().then((result) => setCustomRepos(result.repos));

  useEffect(() => {
    void getSettings().then(setSettings);
    void getDeckyHubInfo().then(setDeckyHubInfo);
    refreshRepos();
  }, []);

  useEffect(() => {
    if (!updateJob || !["queued", "downloading"].includes(updateJob.state.state)) return;
    const timer = window.setInterval(() => void getDownload(updateJob.id).then((state) => setUpdateJob({ id: updateJob.id, state })), 500);
    return () => window.clearInterval(timer);
  }, [updateJob]);

  useEffect(() => {
    if (updateJob?.state.state !== "complete") return;
    showDownloadComplete("DeckyHub update downloaded", updateJob.state.path);
  }, [updateJob?.id, updateJob?.state.state]);

  const search = async () => {
    try {
      setSearchError(null);
      const response = await fetchNoCors(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
      setResults((await response.json()).items || []);
    } catch (error) {
      setSearchError(String(error));
    }
  };

  const add = async (repo: string) => {
    const result = await addCustomRepo(repo);
    if (result.added) {
      refreshRepos();
      window.dispatchEvent(new Event(REGISTRY_UPDATED));
    }
    toaster.toast({ title: "DeckyHub", body: result.added ? `${repo} added to Discover.` : `${repo} is already in DeckyHub.` });
  };

  const remove = async (repo: string) => {
    await removeCustomRepo(repo);
    refreshRepos();
    window.dispatchEvent(new Event(REGISTRY_UPDATED));
  };

  const exportList = async () => {
    const result = await exportCustomRepos();
    toaster.toast({ title: "DeckyHub", body: `Exported to ${result.path}` });
  };

  const importList = async () => {
    const file = await openFilePicker(FileSelectionType.FILE, "/home/deck/Downloads", true, false, undefined, ["json"]);
    const result = await importCustomRepos(file.realpath);
    refreshRepos();
    if (result.added.length) window.dispatchEvent(new Event(REGISTRY_UPDATED));
    toaster.toast({ title: "DeckyHub", body: result.added.length ? `Imported: ${result.added.join(", ")}` : "No new repositories to import." });
  };

  const installUpdate = async (asset: Asset) => {
    const result = await installDeckyHubUpdate(asset);
    if (result.jobId) setUpdateJob({ id: result.jobId, state: { state: "queued", filename: asset.name, total: asset.size } });
  };

  return (
    <>
      <PanelSection title="DeckyHub update">
        <PanelSectionRow>
          Installed: {deckyHubInfo.version}
          {deckyHubRelease.version && ` · Latest: ${deckyHubRelease.version}`}
          {deckyHubRelease.error && (
            <>
              <br />
              <small>{deckyHubRelease.error}</small>
            </>
          )}
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Update channel"
            rgOptions={[
              { label: "Stable releases", data: "stable" },
              { label: "Pre-releases", data: "prerelease" },
            ]}
            selectedOption={settings.updateChannel}
            onChange={({ data }) => setSettings({ ...settings, updateChannel: data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void latestDeckyHubRelease(settings.updateChannel).then(setDeckyHubRelease)}>
            Check DeckyHub update
          </ButtonItem>
        </PanelSectionRow>
        {deckyHubRelease.asset && (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => void installUpdate(deckyHubRelease.asset!)}>
              Download {deckyHubRelease.version} update
            </ButtonItem>
          </PanelSectionRow>
        )}
        {updateJob && (
          <PanelSectionRow>
            {updateJob.state.filename}: {updateJob.state.state}{" "}
            {updateJob.state.total ? `(${Math.round((100 * (updateJob.state.received ?? 0)) / updateJob.state.total)}%)` : ""}
            {updateJob.state.state === "complete" && (
              <>
                <br />
                <small>Downloaded to {updateJob.state.path || "the selected folder"}. Install it from Decky → Developer → Install Plugin from ZIP.</small>
              </>
            )}
            {updateJob.state.error && (
              <>
                <br />
                <small>{updateJob.state.error}</small>
              </>
            )}
            {["queued", "downloading"].includes(updateJob.state.state) && (
              <ButtonItem layout="below" onClick={() => void cancelDownload(updateJob.id)}>
                Cancel update
              </ButtonItem>
            )}
          </PanelSectionRow>
        )}
        {deckyHubRelease.url && (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => Navigation.NavigateToExternalWeb(deckyHubRelease.url!)}>
              Open release page
            </ButtonItem>
          </PanelSectionRow>
        )}
      </PanelSection>

      <PanelSection title="Add GitHub repository">
        <PanelSectionRow>
          <TextField label="Search GitHub" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void search()} disabled={!query.trim()}>
            Search repositories
          </ButtonItem>
        </PanelSectionRow>
        {searchError && <PanelSectionRow>{searchError}</PanelSectionRow>}
        {results.map((repo) => (
          <PanelSectionRow key={repo.full_name}>
            <ButtonItem layout="below" onClick={() => void add(repo.full_name)}>
              {repo.full_name}
              <br />
              <small>
                {repo.description || "No description"} · ★ {repo.stargazers_count ?? 0}
              </small>
            </ButtonItem>
          </PanelSectionRow>
        ))}
      </PanelSection>

      <PanelSection title="Managed repositories">
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void exportList()}>
            Export repository list
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void importList()}>
            Import repository list
          </ButtonItem>
        </PanelSectionRow>
        {customRepos.map((item) => (
          <PanelSectionRow key={item.repo}>
            <ButtonItem layout="below" onClick={() => void remove(item.repo)}>
              Remove {item.repo}
            </ButtonItem>
          </PanelSectionRow>
        ))}
        {!customRepos.length && <PanelSectionRow>No custom repositories yet.</PanelSectionRow>}
      </PanelSection>

      <PanelSection title="Download settings">
        <PanelSectionRow>Choose where release ZIP files are saved.</PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Download folder"
            rgOptions={[
              { label: "/home/deck/Downloads/plugins (default)", data: "plugins" },
              { label: "/home/deck/Downloads", data: "downloads" },
            ]}
            selectedOption={settings.downloadLocation}
            onChange={({ data }) => setSettings({ ...settings, downloadLocation: data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label="Verify SHA256 when available" checked={settings.verifySha256} onChange={(checked) => setSettings({ ...settings, verifySha256: checked })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label="Overwrite existing files" checked={settings.overwriteExisting} onChange={(checked) => setSettings({ ...settings, overwriteExisting: checked })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={async () => {
              setSettings(await saveSettings(settings));
              toaster.toast({ title: "DeckyHub", body: "Settings saved." });
            }}
          >
            Save settings
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}
