import { FileSelectionType, fetchNoCors, openFilePicker, toaster } from "@decky/api";
import { DialogButtonPrimary as Button, ConfirmModal, DropdownItem, Focusable, PanelSection, PanelSectionRow, showModal, Tabs, TextField } from "@decky/ui";
import { FocusableGrid } from "../components/FocusableGrid";
import { useEffect, useState } from "react";
import { addCustomRepo, exportCustomRepos, getApps, getCustomRepos, getSettings, importCustomRepos, REGISTRY_UPDATED, removeCustomRepo, saveRepoSettings } from "../api";
import { useT } from "../i18n";
import type { App, ManagedRepo, RepoPreference, SearchRepo, Settings } from "../types";
import { compactButtonStyle, sectionDividerStyle } from "../utils";

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

  const preference = (repo: string) => prefs[repo] || { channel: "stable", assetFilter: [] };

  const search = async () => {
    if (!query.trim() || searching) return;
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
          <Focusable flow-children="right" style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextField label={t("repos.searchGithub")} value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
            </div>
            <div style={{ flex: "0 0 160px", paddingTop: 24 }}>
              <Button style={compactButtonStyle} onClick={() => void search()} disabled={searching}>
                {searching ? t("repos.searching") : t("filter.search")}
              </Button>
            </div>
            <div style={{ flex: "0 0 120px", paddingTop: 24 }}>
              <Button
                style={compactButtonStyle}
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setSearchError(null);
                  setPage(0);
                }}
              >
                {t("repos.clear")}
              </Button>
            </div>
          </Focusable>
        </PanelSectionRow>
        {searchError && <PanelSectionRow>{searchError}</PanelSectionRow>}
        {results.length > RESULTS_PER_PAGE && (
          <PanelSectionRow>
            <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
              <Button style={compactButtonStyle} disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                {t("repos.previous")}
              </Button>
              </div>
              <span style={{ whiteSpace: "nowrap" }}>{t("repos.pageOf", { page: page + 1, total: Math.ceil(results.length / RESULTS_PER_PAGE) })}</span>
              <div style={{ flex: 1 }}>
              <Button style={compactButtonStyle} disabled={(page + 1) * RESULTS_PER_PAGE >= results.length} onClick={() => setPage((current) => current + 1)}>
                {t("repos.next")}
              </Button>
              </div>
            </Focusable>
          </PanelSectionRow>
        )}
      </PanelSection>
      <div aria-hidden style={sectionDividerStyle} />

      <FocusableGrid items={results.slice(page * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE + RESULTS_PER_PAGE)} columns={2} keyFor={(repo) => repo.full_name}>
        {(repo) => {
          const added = existingRepos.has(repo.full_name.toLowerCase());
          return (
            <PanelSection title={repo.full_name}>
              <PanelSectionRow>
                <small>
                  {repo.description || t("repos.noDescription")} · ★ {repo.stargazers_count ?? 0}
                </small>
              </PanelSectionRow>
              <PanelSectionRow>
                <Button style={compactButtonStyle} disabled={added} onClick={() => void add(repo.full_name)}>
                  {added ? t("repos.added") : t("repos.add")}
                </Button>
              </PanelSectionRow>
            </PanelSection>
          );
        }}
      </FocusableGrid>

      <div aria-hidden style={sectionDividerStyle} />

      <PanelSection title={t("repos.managedRepositories")}>
        <PanelSectionRow>
          <Focusable flow-children="right" style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Button style={compactButtonStyle} onClick={() => void exportList()}>
                {t("repos.export")}
              </Button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Button style={compactButtonStyle} onClick={() => void importList()}>
                {t("repos.import")}
              </Button>
            </div>
          </Focusable>
        </PanelSectionRow>
        {customRepos.map((item) => (
          <PanelSectionRow key={item.repo}>
            <Button style={compactButtonStyle} onClick={() => confirmRemove(item.repo)}>
              {t("repos.remove", { repo: item.repo })}
            </Button>
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
      </PanelSection>
      <FocusableGrid items={apps} columns={2} keyFor={(app) => app.repo}>
        {(app) => {
          const value = preference(app.repo);
          const update = (next: Partial<RepoPreference>) => {
            const saved = { ...value, ...next };
            setPrefs({ ...prefs, [app.repo]: saved });
            void saveRepoSettings(app.repo, saved);
          };
          return (
            <PanelSection title={app.name}>
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
                <TextField
                  label={t("repos.assetFilter")}
                  value={value.assetFilter.join(", ")}
                  onChange={(event) => update({ assetFilter: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) })}
                />
              </PanelSectionRow>
            </PanelSection>
          );
        }}
      </FocusableGrid>
    </>
  );

  return (
    <Tabs
      activeTab={activeTab}
      autoFocusContents
      onShowTab={(tab: string) => setActiveTab(tab)}
      tabs={[
        { id: "manage", title: t("repos.addManage"), content: manageTab },
        { id: "settings", title: t("repos.repositorySettings"), content: settingsTab },
      ]}
    />
  );
}
