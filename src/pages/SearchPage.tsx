import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Focusable, Navigation, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { FocusableGrid } from "../components/FocusableGrid";
import { keepInView } from "../components/KeepInView";
import { Card, PageHeader, useSwapAnimation } from "../components/Card";
import { Pager } from "../components/Pager";
import { LayoutToggle, useLayout } from "../components/LayoutToggle";
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
import { compactButtonStyle, disclaimerStyle, githubFetch, githubResponseError, hydrate, installAction, manifestName, installTypeLabel, log, surfaceStyle } from "../utils";

const RESULTS_PER_PAGE = 5;
// No bottom margin, so the buttons line up with the search field beside them.
const rowButtonStyle = { ...compactButtonStyle, marginBottom: 0 };

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
  // Shared with Discover and Updates; the list shows every result, the grid five a page.
  const [layout, setLayout] = useLayout();
  const shown = layout === "list" ? results : results.slice(page * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE + RESULTS_PER_PAGE);
  // Slides new results, pages and layouts in.
  const resultsRef = useSwapAnimation([results, page, layout]);

  useEffect(() => {
    void getSettings().then((settings) => setHiddenButtons(settings.hiddenButtons ?? []));
  }, []);

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      setSearchError(null);
      // Read fresh each search, so a repo added or removed elsewhere shows right.
      const existing = new Set((await getApps()).apps.map((app) => app.repo.toLowerCase()));
      setExistingRepos(existing);
      // "decky" in the name, description, topics or README narrows GitHub's results;
      // the plugin.json check below drops the lists and guides that still match.
      const response = await githubFetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(`${query} decky in:name,description,topics,readme`)}&sort=stars&order=desc&per_page=25`);
      if (!response.ok) throw await githubResponseError(response);
      const items: SearchRepo[] = (await response.json()).items || [];
      const plugins = await Promise.all(items.map((repo) => existing.has(repo.full_name.toLowerCase()) || manifestName(repo.full_name).then(Boolean)));
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

  // Installs its latest stable release the way a Discover card does, and tracks the
  // repo once Decky's dialog is accepted (a cancelled or failed one adds nothing).
  const install = async (repo: string) => {
    setInstalling(repo);
    try {
      const app = await latestRelease(repo);
      const action = installAction(app, { tag: app.latestVersion, assets: app.assets });
      if (!action) throw new Error(t("release.noMatch"));
      const label = installTypeLabel(t, action.type, displayVersion(app.latestVersion).replace(/^v/, ""));
      // Decky's own dialog takes over, so leave the page like a card's Install does.
      await startPluginInstall(t, app.name, app.repo, app.assets[0], app.latestVersion, action, label, () => {
        void track(repo).catch(showError);
        Navigation.NavigateBack();
      });
    } finally {
      setInstalling(null);
    }
  };

  // Install and Add, shared by the grid's cards and the list's rows.
  const resultActions = (repo: SearchRepo) => {
    const added = existingRepos.has(repo.full_name.toLowerCase());
    return (
      <Focusable flow-children="right" style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Button
            style={{ ...compactButtonStyle, marginBottom: 0 }}
            disabled={installing !== null}
            onSecondaryButton={() => void releaseInfo(repo.full_name).catch(showError)}
            onSecondaryActionDescription={t("appcard.releaseInfo")}
            onOptionsButton={hiddenButtons.includes("downloadZip") ? undefined : () => void downloadZip(repo.full_name).catch(showError)}
            onOptionsActionDescription={t("settings.downloadUpdate")}
            onMenuButton={() => Navigation.NavigateToExternalWeb(`https://github.com/${repo.full_name}`)}
            onMenuActionDescription={t("appcard.repository")}
            onClick={() => void install(repo.full_name).catch(showError)}
          >
            <FaDownload /> {t("appcard.install")}
          </Button>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Button style={{ ...compactButtonStyle, marginBottom: 0 }} disabled={added} onClick={() => void add(repo.full_name).catch(showError)}>
            {added ? <FaCheck /> : <FaPlus />} {added ? t("repos.added") : t("repos.add")}
          </Button>
        </div>
      </Focusable>
    );
  };

  return (
    <>
      <RateLimitBanner />
      <PageHeader icon={<FaSearch />} title={t("view.searchTitle")} description={t("view.searchDescription")} />
      <div className="deckyhub-search-warning" style={disclaimerStyle}>{t("search.warning")}</div>
      <Card>
        {/* The label is the section title rather than TextField's own, so the field and
            buttons share one centre line and the card is padded evenly top and bottom
            (Steam pads an untitled section's bottom only). */}
        <PanelSection title={t("repos.searchGithub")}>
          <PanelSectionRow>
            <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextField {...({ "aria-label": t("repos.searchGithub") } as any)} value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
              </div>
              <div style={{ flex: "0 0 160px" }}>
                <Button style={rowButtonStyle} onClick={() => void search()} disabled={searching}>
                  <FaSearch /> {searching ? t("repos.searching") : t("filter.search")}
                </Button>
              </div>
              <div style={{ flex: "0 0 120px" }}>
                <Button
                  style={rowButtonStyle}
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
              <div style={{ flex: "0 0 120px" }}>
                <LayoutToggle layout={layout} onChange={setLayout} />
              </div>
            </Focusable>
          </PanelSectionRow>
          {searchError && <PanelSectionRow>{searchError}</PanelSectionRow>}
          {layout === "grid" && results.length > RESULTS_PER_PAGE && (
            <PanelSectionRow>
              <Pager page={page} total={Math.ceil(results.length / RESULTS_PER_PAGE)} onChange={setPage} />
            </PanelSectionRow>
          )}
        </PanelSection>
      </Card>
      <div ref={resultsRef}>
      {results.length > 0 && layout === "list" && (
        <Focusable flow-children="down" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {shown.map((repo) => (
            // The name is a direct child, so a row's buttons are found from its heading.
            <Focusable key={repo.full_name} flow-children="right" onFocus={keepInView} className="deckyhub-search-row deckyhub-focus-ring" style={{ ...surfaceStyle, display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 2fr) 70px 260px", alignItems: "center", columnGap: 12, padding: "6px 12px" }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: "1em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{repo.full_name}</h3>
              <small style={{ color: "#b8c7d3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{repo.description || t("repos.noDescription")}</small>
              <small style={{ color: "#8b9aa7" }}>★ {repo.stargazers_count ?? 0}</small>
              {resultActions(repo)}
            </Focusable>
          ))}
        </Focusable>
      )}
      {results.length > 0 && layout === "grid" && (
        <FocusableGrid items={shown} columns={2} keyFor={(repo) => repo.full_name}>
          {(repo) => (
            <div className="deckyhub-focus-ring" style={{ ...surfaceStyle, height: "100%", padding: "var(--dh-card-padding, 4px 14px)" }}>
              <PanelSection title={repo.full_name}>
                <PanelSectionRow>
                  <small>
                    {repo.description || t("repos.noDescription")} · ★ {repo.stargazers_count ?? 0}
                  </small>
                </PanelSectionRow>
                <PanelSectionRow>{resultActions(repo)}</PanelSectionRow>
              </PanelSection>
            </div>
          )}
        </FocusableGrid>
      )}
      </div>
    </>
  );
}
