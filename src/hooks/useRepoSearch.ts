import { useState } from "react";
import { addCustomRepo, getApps, REGISTRY_UPDATED } from "../api";
import type { App, SearchRepo } from "../types";
import { githubFetch, githubResponseError, log, manifestName } from "../utils";

const lower = (names: Iterable<string>) => new Set([...names].map((name) => name.toLowerCase()));

// GitHub repository search for Decky plugins, and what DeckyHub already knows about each result
// (listed, installed, in the official registry, in Decky's store).
export function useRepoSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRepo[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [existingRepos, setExistingRepos] = useState<Set<string>>(new Set());
  // The official registry's plugins: the ones that have audit and scan data.
  const [registryRepos, setRegistryRepos] = useState<Set<string>>(new Set());
  // Plugins Decky has installed, so a result says so before Install is pressed.
  const [installedRepos, setInstalledRepos] = useState<Set<string>>(new Set());
  const [storeApps, setStoreApps] = useState<Map<string, App>>(new Map());

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      setSearchError(null);
      // Read fresh each search, so a repo added or removed elsewhere shows right.
      const listedApps = (await getApps()).apps;
      const existing = lower(listedApps.map((app) => app.repo));
      setStoreApps(new Map(listedApps.filter((app) => app.store).map((app) => [app.repo.toLowerCase(), app])));
      setExistingRepos(existing);
      setInstalledRepos(lower(listedApps.filter((app) => app.installedVersion).map((app) => app.repo)));
      setRegistryRepos(lower(listedApps.filter((app) => app.official).map((app) => app.repo)));
      // "decky" in the name, description, topics or README narrows GitHub's results;
      // the plugin.json check below drops the lists and guides that still match.
      const response = await githubFetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(`${query} decky in:name,description,topics,readme`)}&sort=stars&order=desc&per_page=25`,
      );
      if (!response.ok) throw await githubResponseError(response);
      const items: SearchRepo[] = (await response.json()).items || [];
      const plugins = await Promise.all(
        items.map((repo) => existing.has(repo.full_name.toLowerCase()) || manifestName(repo.full_name).then(Boolean)),
      );
      setResults(items.filter((_, index) => plugins[index]));
    } catch (error) {
      log(`Repository search failed: ${error}`);
      setSearchError(String(error));
    } finally {
      setSearching(false);
    }
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

  return {
    query,
    setQuery,
    results,
    searching,
    searchError,
    existingRepos,
    registryRepos,
    installedRepos,
    storeApps,
    search,
    track,
  };
}
