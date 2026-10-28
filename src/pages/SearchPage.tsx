import { fetchNoCors, toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Focusable, Navigation, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { FocusableGrid } from "../components/FocusableGrid";
import { Card, PageHeader } from "../components/Card";
import { Pager } from "../components/Pager";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { startPluginInstall } from "../components/AppDetailsModal";
import { useEffect, useState } from "react";
import { FaCheck, FaDownload, FaPlus, FaSearch, FaTimes } from "react-icons/fa";
import { addCustomRepo, getApps, REGISTRY_UPDATED } from "../api";
import { useT } from "../i18n";
import type { SearchRepo } from "../types";
import { displayVersion } from "../version";
import { compactButtonStyle, disclaimerStyle, githubFetch, githubResponseError, hydrate, installAction, installTypeLabel, log, surfaceStyle } from "../utils";

const RESULTS_PER_PAGE = 5;

// A Decky plugin has a plugin.json with a name at its root. Read from
// raw.githubusercontent.com, which doesn't count against the GitHub API limit;
// header-less, so no CORS preflight (see githubHeaders() in utils.ts).
// ponytail: root only, so a monorepo plugin (MAKO keeps it in a subfolder) shows only once it's in a list.
const isDeckyPlugin = (repo: string) =>
  fetchNoCors(`https://raw.githubusercontent.com/${repo}/HEAD/plugin.json`, { signal: AbortSignal.timeout(10_000) })
    .then((response) => (response.ok ? response.json() : null))
    .then((manifest) => typeof manifest?.name === "string", () => false);

export function SearchPage() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRepo[]>([]);
  const [page, setPage] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [existingRepos, setExistingRepos] = useState<Set<string>>(new Set());
  // The repo whose install is being prepared, so a second tap can't start another.
  const [installing, setInstalling] = useState<string | null>(null);

  const refreshRepos = () => void getApps().then((result) => setExistingRepos(new Set(result.apps.map((app) => app.repo.toLowerCase()))));

  useEffect(refreshRepos, []);

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      setSearchError(null);
      // "decky" in the name, description, topics or README narrows GitHub's results;
      // the plugin.json check below drops the lists and guides that still match.
      const response = await githubFetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(`${query} decky in:name,description,topics,readme`)}&sort=stars&order=desc&per_page=25`);
      if (!response.ok) throw await githubResponseError(response);
      const items: SearchRepo[] = (await response.json()).items || [];
      const plugins = await Promise.all(items.map((repo) => existingRepos.has(repo.full_name.toLowerCase()) || isDeckyPlugin(repo.full_name)));
      setResults(items.filter((_, index) => plugins[index]));
      setPage(0);
    } catch (error) {
      log(`Repository search failed: ${error}`);
      setSearchError(String(error));
    } finally {
      setSearching(false);
    }
  };

  const showError = (error: unknown) => {
    log(`Search action failed: ${error}`);
    toaster.toast({ title: "DeckyHub", body: String(error) });
  };

  // Tracks the repo (a no-op for one already listed) so its updates show up later.
  const track = async (repo: string) => {
    const result = await addCustomRepo(repo);
    if (result.added) {
      setExistingRepos((current) => new Set(current).add(repo.toLowerCase()));
      window.dispatchEvent(new Event(REGISTRY_UPDATED));
    }
    return result.added;
  };

  const add = async (repo: string) => {
    const added = await track(repo);
    toaster.toast({ title: "DeckyHub", body: t(added ? "repos.addedToast" : "repos.alreadyAdded", { repo }) });
  };

  // Adds the repo, then installs its latest stable release the way a Discover card does.
  const install = async (repo: string) => {
    setInstalling(repo);
    try {
      await track(repo);
      const listed = (await getApps()).apps.find((app) => app.repo.toLowerCase() === repo.toLowerCase());
      if (!listed) throw new Error(t("release.noMatch"));
      const app = await hydrate(listed, false);
      const action = app.latestVersion ? installAction(app, { tag: app.latestVersion, assets: app.assets }) : null;
      if (!action || !app.latestVersion) throw new Error(app.error ?? t("release.noMatch"));
      const label = installTypeLabel(t, action.type, displayVersion(app.latestVersion).replace(/^v/, ""));
      // Decky's own dialog takes over, so leave the page like a card's Install does.
      await startPluginInstall(t, app.name, app.repo, app.assets[0], app.latestVersion, action, label, () => Navigation.NavigateBack());
    } finally {
      setInstalling(null);
    }
  };

  return (
    <>
      <RateLimitBanner />
      <PageHeader icon={<FaSearch />} title={t("nav.search")} description={t("view.searchDescription")} />
      <div className="deckyhub-search-warning" style={disclaimerStyle}>{t("search.warning")}</div>
      <Card>
        <PanelSection>
          <PanelSectionRow>
            <Focusable flow-children="right" style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextField label={t("repos.searchGithub")} value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
              </div>
              <div style={{ flex: "0 0 160px", paddingTop: 24 }}>
                <Button style={compactButtonStyle} onClick={() => void search()} disabled={searching}>
                  <FaSearch /> {searching ? t("repos.searching") : t("filter.search")}
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
                  <FaTimes /> {t("repos.clear")}
                </Button>
              </div>
            </Focusable>
          </PanelSectionRow>
          {searchError && <PanelSectionRow>{searchError}</PanelSectionRow>}
          {results.length > RESULTS_PER_PAGE && (
            <PanelSectionRow>
              <Pager page={page} total={Math.ceil(results.length / RESULTS_PER_PAGE)} onChange={setPage} />
            </PanelSectionRow>
          )}
        </PanelSection>
      </Card>
      {results.length > 0 && (
        <FocusableGrid items={results.slice(page * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE + RESULTS_PER_PAGE)} columns={2} keyFor={(repo) => repo.full_name}>
          {(repo) => {
            const added = existingRepos.has(repo.full_name.toLowerCase());
            return (
              <div style={{ ...surfaceStyle, height: "100%", padding: "var(--dh-card-padding, 4px 14px)" }}>
                <PanelSection title={repo.full_name}>
                  <PanelSectionRow>
                    <small>
                      {repo.description || t("repos.noDescription")} · ★ {repo.stargazers_count ?? 0}
                    </small>
                  </PanelSectionRow>
                  <PanelSectionRow>
                    <Focusable flow-children="right" style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Button style={compactButtonStyle} disabled={installing !== null} onClick={() => void install(repo.full_name).catch(showError)}>
                          <FaDownload /> {t("appcard.install")}
                        </Button>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Button style={compactButtonStyle} disabled={added} onClick={() => void add(repo.full_name).catch(showError)}>
                          {added ? <FaCheck /> : <FaPlus />} {added ? t("repos.added") : t("repos.add")}
                        </Button>
                      </div>
                    </Focusable>
                  </PanelSectionRow>
                </PanelSection>
              </div>
            );
          }}
        </FocusableGrid>
      )}
    </>
  );
}
