export type Asset = { name: string; url: string; size: number; sha256?: string };

export type App = {
  id: string;
  name: string;
  repo: string;
  category: string;
  source: "releases" | "tags";
  versionStrategy: "semver" | "release-date" | "custom";
  versionPattern?: string;
  releaseTagInclude?: string;
  asset: { include: string[]; exclude: string[] };
  installedVersion?: string | null;
  latestVersion?: string | null;
  publishedAt?: string | null;
  releaseUrl?: string | null;
  assets: Asset[];
  updateAvailable?: boolean | null;
  error?: string | null;
};

export type UpdateChannel = "stable" | "prerelease";

export type Settings = { verifySha256: boolean; overwriteExisting: boolean; downloadLocation: "plugins" | "downloads"; updateChannel: UpdateChannel; language: string };

export type Download = { state: string; filename?: string; received?: number; total?: number; path?: string; error?: string };

export type DeckyHubInfo = { version: string };

export type DeckyHubRelease = { version?: string; asset?: Asset; url?: string; error?: string };

export type View = "updates" | "discover";

export type SearchRepo = { full_name: string; description?: string; stargazers_count?: number };

export type ManagedRepo = { repo: string };

export type RepoPreference = { channel: "stable" | "prerelease"; downloadLocation: "default" | "plugins" | "downloads"; assetFilter: string[] };

export type Job = { id: string; state: Download } | null;
