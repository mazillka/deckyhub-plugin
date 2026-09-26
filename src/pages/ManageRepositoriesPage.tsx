import { FileSelectionType, openFilePicker, toaster } from "@decky/api";
import { DialogButtonPrimary as Button, ConfirmModal, Focusable, PanelSection, PanelSectionRow, showModal, TextField } from "@decky/ui";
import { FocusableGrid } from "../components/FocusableGrid";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { useEffect, useState } from "react";
import { addCustomRepo, exportCustomRepos, getApps, getCustomRepos, importCustomRepos, REGISTRY_UPDATED, removeCustomRepo } from "../api";
import { useT } from "../i18n";
import type { ManagedRepo, SearchRepo } from "../types";
import { compactButtonStyle, githubFetch, githubResponseError, sectionDividerStyle } from "../utils";

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

  const refreshRepos = () => {
    void getCustomRepos().then((result) => setCustomRepos(result.repos));
    void getApps().then((result) => setExistingRepos(new Set(result.apps.map((app) => app.repo.toLowerCase()))));
  };

  useEffect(() => {
    refreshRepos();
  }, []);

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      setSearchError(null);
      const response = await githubFetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=25`);
      if (!response.ok) throw await githubResponseError(response);
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

  return (
    <>
      <RateLimitBanner />
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
      {results.length > 0 && (
        <>
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
        </>
      )}

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
}
