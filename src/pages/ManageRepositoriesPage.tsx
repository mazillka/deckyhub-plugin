import { FileSelectionType, fetchNoCors, openFilePicker, toaster } from "@decky/api";
import { ButtonItem, ConfirmModal, DropdownItem, PanelSection, PanelSectionRow, showModal, Tabs, TextField } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaSync } from "react-icons/fa";
import { addCustomRepo, exportCustomRepos, getApps, getCustomRepos, getSettings, importCustomRepos, REGISTRY_UPDATED, refreshRegistry, removeCustomRepo, saveRepoSettings } from "../api";
import type { App, ManagedRepo, RepoPreference, SearchRepo, Settings } from "../types";

const RESULTS_PER_PAGE = 5;

export function ManageRepositoriesPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRepo[]>([]);
  const [page, setPage] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [customRepos, setCustomRepos] = useState<ManagedRepo[]>([]);
  const [existingRepos, setExistingRepos] = useState<Set<string>>(new Set());
  const [apps, setApps] = useState<App[]>([]);
  const [prefs, setPrefs] = useState<Record<string, RepoPreference>>({});
  const [activeTab, setActiveTab] = useState("manage");

  const refreshRepos = () => {
    void getCustomRepos().then((result) => setCustomRepos(result.repos));
    void getApps().then((result) => {
      setApps(result.apps);
      setExistingRepos(new Set(result.apps.map((app) => app.repo.toLowerCase())));
    });
    void getSettings().then((settings) => setPrefs((settings as Settings & { repoSettings?: Record<string, RepoPreference> }).repoSettings || {}));
  };

  useEffect(() => {
    refreshRepos();
  }, []);

  const preference = (repo: string) => prefs[repo] || { channel: "stable", downloadLocation: "default", assetFilter: [] };

  const search = async () => {
    setSearching(true);
    try {
      setSearchError(null);
      const response = await fetchNoCors(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=25`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
      setResults((await response.json()).items || []);
      setPage(0);
    } catch (error) {
      setSearchError(String(error));
    } finally {
      setSearching(false);
    }
  };

  const add = async (repo: string) => {
    const result = await addCustomRepo(repo);
    if (result.added) {
      setExistingRepos((current) => new Set(current).add(repo.toLowerCase()));
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

  const confirmRemove = (repo: string) =>
    showModal(
      <ConfirmModal
        strTitle="Remove Repository"
        strDescription={`Stop tracking ${repo}? You can add it again later from Discover.`}
        strOKButtonText="Remove"
        bDestructiveWarning
        onOK={() => void remove(repo)}
      />
    );

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

  const manageTab = (
    <>
      <PanelSection title="Add GitHub Repository">
        <PanelSectionRow>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <TextField label="Search GitHub" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
            </div>
            <ButtonItem layout="inline" onClick={() => void search()} disabled={!query.trim() || searching}>
              {searching ? "Searching…" : "Search"}
            </ButtonItem>
            {(query || results.length > 0 || searchError) && (
              <ButtonItem
                layout="inline"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setSearchError(null);
                  setPage(0);
                }}
              >
                Clear
              </ButtonItem>
            )}
          </div>
        </PanelSectionRow>
        {searchError && <PanelSectionRow>{searchError}</PanelSectionRow>}
        {results.length > RESULTS_PER_PAGE && (
          <PanelSectionRow>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <ButtonItem layout="inline" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                Previous
              </ButtonItem>
              <small>
                Page {page + 1} of {Math.ceil(results.length / RESULTS_PER_PAGE)}
              </small>
              <ButtonItem layout="inline" disabled={(page + 1) * RESULTS_PER_PAGE >= results.length} onClick={() => setPage((current) => current + 1)}>
                Next
              </ButtonItem>
            </div>
          </PanelSectionRow>
        )}
      </PanelSection>

      {results.slice(page * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE + RESULTS_PER_PAGE).map((repo) => {
        const added = existingRepos.has(repo.full_name.toLowerCase());
        return (
          <PanelSection key={repo.full_name} title={repo.full_name}>
            <PanelSectionRow>
              <small>
                {repo.description || "No description"} · ★ {repo.stargazers_count ?? 0}
              </small>
            </PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem layout="below" disabled={added} onClick={() => void add(repo.full_name)}>
                {added ? "Already Added" : "Add"}
              </ButtonItem>
            </PanelSectionRow>
          </PanelSection>
        );
      })}

      <PanelSection title="Managed Repositories">
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void exportList()}>
            Export Repository List
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void importList()}>
            Import Repository List
          </ButtonItem>
        </PanelSectionRow>
        {customRepos.map((item) => (
          <PanelSectionRow key={item.repo}>
            <ButtonItem layout="below" onClick={() => confirmRemove(item.repo)}>
              Remove {item.repo}
            </ButtonItem>
          </PanelSectionRow>
        ))}
        {!customRepos.length && <PanelSectionRow>No custom repositories yet.</PanelSectionRow>}
      </PanelSection>
    </>
  );

  const settingsTab = (
    <>
      <PanelSection title="Repository Settings">
        <PanelSectionRow>Choose a release channel, asset keywords, and download folder for each repository.</PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() =>
              void refreshRegistry().then((result) => {
                toaster.toast({ title: "DeckyHub", body: `Registry refreshed: ${result.count} repositories.` });
                refreshRepos();
                window.dispatchEvent(new Event(REGISTRY_UPDATED));
              })
            }
          >
            <FaSync /> Refresh Registry From GitHub
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
      {apps.map((app) => {
        const value = preference(app.repo);
        const update = (next: Partial<RepoPreference>) => setPrefs({ ...prefs, [app.repo]: { ...value, ...next } });
        return (
          <PanelSection key={app.repo} title={app.name}>
            <PanelSectionRow>
              <DropdownItem
                label="Release Channel"
                rgOptions={[
                  { label: "Stable", data: "stable" },
                  { label: "Pre-release", data: "prerelease" },
                ]}
                selectedOption={value.channel}
                onChange={({ data }) => update({ channel: data })}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <DropdownItem
                label="Download Folder"
                rgOptions={[
                  { label: "Use global setting", data: "default" },
                  { label: "/home/deck/Downloads/plugins", data: "plugins" },
                  { label: "/home/deck/Downloads", data: "downloads" },
                ]}
                selectedOption={value.downloadLocation}
                onChange={({ data }) => update({ downloadLocation: data })}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <TextField
                label="Asset Filter (Comma-Separated)"
                value={value.assetFilter.join(", ")}
                onChange={(event) => update({ assetFilter: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) })}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem
                layout="below"
                onClick={() =>
                  void saveRepoSettings(app.repo, preference(app.repo)).then((saved) => {
                    setPrefs({ ...prefs, [app.repo]: saved });
                    toaster.toast({ title: "DeckyHub", body: `${app.name} settings saved.` });
                  })
                }
              >
                Save {app.name} Settings
              </ButtonItem>
            </PanelSectionRow>
          </PanelSection>
        );
      })}
    </>
  );

  return (
    <Tabs
      activeTab={activeTab}
      onShowTab={(tab: string) => {
        setActiveTab(tab);
        requestAnimationFrame(() => window.scrollTo(0, 0));
      }}
      tabs={[
        { id: "manage", title: "Add & Manage", content: manageTab },
        { id: "settings", title: "Repository Settings", content: settingsTab },
      ]}
    />
  );
}
