import { fetchNoCors, toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Focusable, Navigation, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { FocusableGrid } from "../components/FocusableGrid";
import { Card, PageHeader } from "../components/Card";
import { Pager } from "../components/Pager";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { startPluginInstall } from "../components/AppDetailsModal";
import { showReleaseInfo } from "../components/AppCard";
import { showDownloadModal } from "../components/DownloadProgress";
import { useEffect, useState } from "react";
import { FaCheck, FaDownload, FaPlus, FaSearch, FaTimes } from "react-icons/fa";
import { addCustomRepo, downloadAsset, getApps, getSettings, REGISTRY_UPDATED } from "../api";
import { useT } from "../i18n";
import type { HideableButton, SearchRepo } from "../types";
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

  const [hiddenButtons, setHiddenButtons] = useState<HideableButton[]>([]);

  useEffect(() => {
    void getApps().then((result) => setExistingRepos(new Set(result.apps.map((app) => app.repo.toLowerCase()))));
    void getSettings().then((settings) => setHiddenButtons(settings.hiddenButtons ?? []));
  }, []);

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

  // The repo's latest stable release, looked up the way a Discover card does. A repo
  // that isn't listed gets the entry the backend makes for an added one (_custom_apps).
  const latestRelease = async (repo: string) => {
    const listed = (await getApps()).apps.find((app) => app.repo.toLowerCase() === repo.toLowerCase());
    const app = await hydrate(listed ?? { id: `custom-${repo.replace("/", "-")}`, name: repo, repo, category: "Custom", detect: { type: "decky-plugin" }, asset: { include: [], exclude: ["source"] }, assets: [] }, false);
    if (!app.latestVersion || !app.assets[0]) throw new Error(app.error ?? t("release.noMatch"));
    return app as typeof app & { latestVersion: string };
  };

  // Y: that release's notes, without adding or installing anything.
  const releaseInfo = async (repo: string) => {
    const app = await latestRelease(repo);
    showReleaseInfo(t, `${app.name} ${displayVersion(app.latestVersion)}`, app.publishedAt, app.releaseNotes);
  };

  // X: that release's ZIP to the download folder instead of installing it.
  const downloadZip = async (repo: string) => {
    const asset = (await latestRelease(repo)).assets[0];
    const result = await downloadAsset(asset, repo);
    if (result.error) throw new Error(result.error);
    if (result.jobId) showDownloadModal(t, result.jobId, { state: "queued", filename: asset.name, total: asset.size }, () => {});
  };

  // Adds the repo, then installs its latest stable release the way a Discover card does.
  const install = async (repo: string) => {
    setInstalling(repo);
    try {
      await track(repo);
      const app = await latestRelease(repo);
      const action = installAction(app, { tag: app.latestVersion, assets: app.assets });
      if (!action) throw new Error(t("release.noMatch"));
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
      <PageHeader icon={<FaSearch />} title={t("view.searchTitle")} description={t("view.searchDescription")} />
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
                        <Button
                          style={compactButtonStyle}
                          disabled={installing !== null}
                          onSecondaryButton={() => void releaseInfo(repo.full_name).catch(showError)}
                          onSecondaryActionDescription={t("appcard.releaseInfo")}
                          onOptionsButton={hiddenButtons.includes("downloadZip") ? undefined : () => void downloadZip(repo.full_name).catch(showError)}
                          onOptionsActionDescription={t("settings.downloadUpdate")}
                          onClick={() => void install(repo.full_name).catch(showError)}
                        >
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
