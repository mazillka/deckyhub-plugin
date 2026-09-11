import { FileSelectionType, fetchNoCors, openFilePicker, toaster } from "@decky/api";
import { ButtonItem, ConfirmModal, DropdownItem, PanelSection, PanelSectionRow, showModal, Tabs, TextField } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaSync } from "react-icons/fa";
import { addCustomRepo, exportCustomRepos, getApps, getCustomRepos, getSettings, importCustomRepos, REGISTRY_UPDATED, refreshRegistry, removeCustomRepo, saveRepoSettings } from "../api";
import { useT } from "../i18n";
import type { App, ManagedRepo, RepoPreference, SearchRepo, Settings } from "../types";

const RESULTS_PER_PAGE = 5;

export function ManageRepositoriesPage() {
  const t = useT();
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
        strTitle={t("repos.removeRepositoryTitle")}
        strDescription={t("repos.removeRepositoryDesc", { repo })}
        strOKButtonText={t("repos.removeConfirm")}
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
      <PanelSection title={t("repos.addGithubRepository")}>
        <PanelSectionRow>
          <TextField label={t("repos.searchGithub")} value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void search()} disabled={!query.trim() || searching}>
            {searching ? t("repos.searching") : t("filter.search")}
          </ButtonItem>
        </PanelSectionRow>
        {(query || results.length > 0 || searchError) && (
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={() => {
                setQuery("");
                setResults([]);
                setSearchError(null);
                setPage(0);
              }}
            >
              {t("repos.clear")}
            </ButtonItem>
          </PanelSectionRow>
        )}
        {searchError && <PanelSectionRow>{searchError}</PanelSectionRow>}
        {results.length > RESULTS_PER_PAGE && (
          <>
            <PanelSectionRow>
              <ButtonItem layout="below" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                {t("repos.previous")}
              </ButtonItem>
            </PanelSectionRow>
            <PanelSectionRow>{t("repos.pageOf", { page: page + 1, total: Math.ceil(results.length / RESULTS_PER_PAGE) })}</PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem layout="below" disabled={(page + 1) * RESULTS_PER_PAGE >= results.length} onClick={() => setPage((current) => current + 1)}>
                {t("repos.next")}
              </ButtonItem>
            </PanelSectionRow>
          </>
        )}
      </PanelSection>

      {results.slice(page * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE + RESULTS_PER_PAGE).map((repo) => {
        const added = existingRepos.has(repo.full_name.toLowerCase());
        return (
          <PanelSection key={repo.full_name} title={repo.full_name}>
            <PanelSectionRow>
              <small>
                {repo.description || t("repos.noDescription")} · ★ {repo.stargazers_count ?? 0}
              </small>
            </PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem layout="below" disabled={added} onClick={() => void add(repo.full_name)}>
                {added ? t("repos.added") : t("repos.add")}
              </ButtonItem>
            </PanelSectionRow>
          </PanelSection>
        );
      })}

      <PanelSection title={t("repos.managedRepositories")}>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void exportList()}>
            {t("repos.export")}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void importList()}>
            {t("repos.import")}
          </ButtonItem>
        </PanelSectionRow>
        {customRepos.map((item) => (
          <PanelSectionRow key={item.repo}>
            <ButtonItem layout="below" onClick={() => confirmRemove(item.repo)}>
              {t("repos.remove", { repo: item.repo })}
            </ButtonItem>
          </PanelSectionRow>
        ))}
        {!customRepos.length && <PanelSectionRow>{t("repos.noCustomRepos")}</PanelSectionRow>}
      </PanelSection>
    </>
  );

  const settingsTab = (
    <>
      <PanelSection title={t("repos.repositorySettings")}>
        <PanelSectionRow>{t("repos.perRepoOverrides")}</PanelSectionRow>
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
            <FaSync /> {t("repos.refreshRegistry")}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
      {apps.map((app) => {
        const value = preference(app.repo);
        const update = (next: Partial<RepoPreference>) => {
          const saved = { ...value, ...next };
          setPrefs({ ...prefs, [app.repo]: saved });
          void saveRepoSettings(app.repo, saved);
        };
        return (
          <PanelSection key={app.repo} title={app.name}>
            <PanelSectionRow>
              <DropdownItem
                label={t("repos.releaseChannel")}
                rgOptions={[
                  { label: t("repos.stable"), data: "stable" },
                  { label: t("repos.prerelease"), data: "prerelease" },
                ]}
                selectedOption={value.channel}
                onChange={({ data }) => update({ channel: data })}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <DropdownItem
                label={t("settings.downloadFolder")}
                rgOptions={[
                  { label: t("repos.useGlobalSetting"), data: "default" },
                  { label: "/home/deck/Downloads/plugins", data: "plugins" },
                  { label: "/home/deck/Downloads", data: "downloads" },
                ]}
                selectedOption={value.downloadLocation}
                onChange={({ data }) => update({ downloadLocation: data })}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <TextField
                label={t("repos.assetFilter")}
                value={value.assetFilter.join(", ")}
                onChange={(event) => update({ assetFilter: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) })}
              />
            </PanelSectionRow>
          </PanelSection>
        );
      })}
    </>
  );

  return (
    <Tabs
      activeTab={activeTab}
      autoFocusContents
      onShowTab={(tab: string) => {
        setActiveTab(tab);
        requestAnimationFrame(() => window.scrollTo(0, 0));
      }}
      tabs={[
        { id: "manage", title: t("repos.addManage"), content: manageTab },
        { id: "settings", title: t("repos.repositorySettings"), content: settingsTab },
      ]}
    />
  );
}
