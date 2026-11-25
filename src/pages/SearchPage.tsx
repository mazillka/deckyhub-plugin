import { showModal } from "@decky/ui";
import { AppDetailsModal } from "../components/AppDetailsModal";
import { SearchResults } from "../components/SearchResults";
import { ExpSearchBar } from "../components/experimental/ExpSearchBar";
import { ExpSearchResults } from "../components/experimental/ExpSearchResults";
import { useUiStyle } from "../uiStyle";
import { PageHeader, useSwapAnimation } from "../components/Card";
import { useLayout } from "../components/LayoutToggle";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { SearchBox } from "../components/SearchBox";
import { useEffect, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { getSettings } from "../api";
import { useT } from "../i18n";
import { Notice } from "../components/Notice";
import type { App, HideableButton } from "../types";
import { rememberOpener } from "../external";
import { useRepoSearch } from "../hooks/useRepoSearch";
import { useSearchActions } from "../hooks/useSearchActions";

// Searches GitHub for Decky plugins; each result can be added, installed, downloaded or read about.
export function SearchPage() {
  const t = useT();
  // Experimental: its own search banner and result tiles.
  const style = useUiStyle();
  const experimental = style === "experimental";
  // Both Experimental styles list results; only the Default style offers the grid.
  const listOnly = style !== "default";
  const Results = experimental ? ExpSearchResults : SearchResults;
  const found = useRepoSearch();
  const actions = useSearchActions(t, found.track);
  const [hiddenButtons, setHiddenButtons] = useState<HideableButton[]>([]);
  // Shared with Discover and Updates; both show every result.
  const [chosenLayout, setLayout] = useLayout();
  // The Experimental style has no grid: its results are always rows.
  const layout = listOnly ? "list" : chosenLayout;
  // Slides new results, pages and layouts in.
  const resultsRef = useSwapAnimation([found.results, layout]);

  useEffect(() => {
    void getSettings().then((settings) => setHiddenButtons(settings.hiddenButtons ?? []));
  }, []);

  const showStoreDetails = (app: App, opener: EventTarget | null) => {
    rememberOpener(opener);
    showModal(
      <AppDetailsModal
        t={t}
        app={app}
        loadStoreStats
        preference={{ channel: "stable" }}
        hiddenButtons={hiddenButtons}
        onDownload={async () => {}}
        onPreferenceChange={() => {}}
        onUninstalled={() => void found.search()}
      />,
    );
  };

  return (
    <>
      <RateLimitBanner />
      {experimental ? (
        <ExpSearchBar
          query={found.query}
          onQuery={found.setQuery}
          searching={found.searching}
          onSearch={() => void found.search()}
          error={found.searchError}
        />
      ) : (
        <PageHeader icon={<FaSearch />} title={t("view.searchTitle")} description={t("view.searchDescription")} />
      )}
      <Notice className="deckyhub-search-warning" text={t("search.warning")} />
      {!experimental && (
        <SearchBox
          query={found.query}
          onQuery={found.setQuery}
          searching={found.searching}
          onSearch={() => void found.search()}
          error={found.searchError}
          layout={listOnly ? undefined : layout}
          onLayout={setLayout}
        />
      )}
      <div ref={resultsRef}>
        <Results
          results={found.results}
          layout={layout}
          isAdded={(repo) => found.existingRepos.has(repo.toLowerCase())}
          isInstalled={(repo) => found.installedRepos.has(repo.toLowerCase())}
          inRegistry={(repo) => found.registryRepos.has(repo.toLowerCase())}
          storeApps={found.storeApps}
          installing={actions.installing}
          canDownload={!hiddenButtons.includes("downloadZip")}
          onInstall={actions.onInstall}
          onStoreInstall={showStoreDetails}
          onAdd={actions.onAdd}
          onReleaseInfo={actions.onReleaseInfo}
          onDownloadZip={actions.onDownloadZip}
        />
      </div>
    </>
  );
}
