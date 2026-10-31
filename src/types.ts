export type Asset = { name: string; url: string; size: number; sha256?: string };

export type UpdateChannel = "stable" | "prerelease";

export type App = {
  id: string;
  name: string;
  description?: string;
  repo: string;
  category: string;
  releaseTagInclude?: string;
  asset: { include: string[]; exclude: string[] };
  installedVersion?: string | null;
  detect?: { type: string; names?: string[] };
  // Installed Decky plugin's own manifest name (decky-plugin detection only).
  pluginName?: string | null;
  latestVersion?: string | null;
  publishedAt?: string | null;
  releaseUrl?: string | null;
  releaseNotes?: string;
  assets: Asset[];
  updateAvailable?: boolean | null;
  // From the registry's stats.json (fetchPluginStats); absent for repos it doesn't list.
  stats?: PluginStats;
  error?: string | null;
  channel?: UpdateChannel;
};

// A plugin's line in the registry's stats.json: all-time downloads, GitHub stars,
// when the release Discover shows came out, whether its plugin.json asks for root, and
// what Decky Extended Plugins' audit warns about in it (and in a newer pre-release, if any).
export type PluginStats = { downloads?: number; stars?: number | null; updated?: string | null; root?: boolean | null; warnings?: string[]; prereleaseWarnings?: string[] };

// Manage-window buttons that Display Settings can hide.
export type HideableButton = "downloadZip" | "install" | "update" | "releasePage";

export type Settings = { overwriteExisting: boolean; updateChannel: UpdateChannel; registryChannel: UpdateChannel; language: string; columnsPerRow: 1 | 2 | 3 | 4; githubToken: string; density: "default" | "compact"; haptics: boolean; hiddenButtons: HideableButton[]; repoSettings?: Record<string, RepoPreference>; customRepos?: string[]; customRegistries?: string[] };

export type Download = { state: string; filename?: string; repo?: string; received?: number; total?: number; path?: string; error?: string };

export type DeckyHubInfo = { version: string };

export type DeckyHubRelease = { version?: string; asset?: Asset; publishedAt?: string | null; notes?: string; error?: string };

export type DeckyHubReleaseOption = { tag: string; prerelease: boolean; publishedAt: string | null; asset?: Asset; url: string; notes?: string };

export type AppReleaseOption = { tag: string; prerelease: boolean; publishedAt: string | null; url: string; notes?: string; assets: Asset[] };

export type View = "updates" | "discover";

export type SearchRepo = { full_name: string; description?: string; stargazers_count?: number };


export type RepoPreference = { channel: "stable" | "prerelease" };
