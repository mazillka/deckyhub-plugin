export type Asset = { name: string; url: string; size: number; sha256?: string };

export type UpdateChannel = "stable" | "prerelease";

export type App = {
  id: string;
  name: string;
  description?: string;
  repo: string;
  category: string;
  // From the official registry (not a custom repository or registry): it has a page on deckyhub.com.
  official?: boolean;
  releaseTagInclude?: string;
  // From the registry: known problems with this plugin itself, each with a link to its report.
  knownIssues?: { title: string; url: string }[];
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
  // The virus scan report for the ZIP the card installs (Discover only; null: not scanned yet).
  scan?: VirusScan | null;
  virusTotal?: { state: string; flagged?: number; total?: number } | null;
  metaDefender?: { state: string; flagged?: number; total?: number } | null;
  error?: string | null;
  channel?: UpdateChannel;
  // No stable release at all: the card follows its pre-releases whatever the saved channel (hydrate).
  prereleaseOnly?: boolean;
  // The installed version's release, when it's among the recent ones (hydrate), and the
  // stats.json audit that covers it (see installedRelease).
  installedAssets?: Asset[];
  installedAudit?: "stable" | "prerelease";
  // What flagged the installed version itself (installedRisk): any virus scan, audit warnings.
  installedRisk?: { threat: boolean; warnings: string[] };
};

// A plugin's line in the registry's stats.json: all-time downloads, GitHub stars,
// when the release Discover shows came out, whether its plugin.json asks for root, and
// what Decky Extended Plugins' audit warns about in it (and in a newer pre-release, if any),
// for a fork, the owner/name of the repo it was forked from, and the AI coding assistant
// files (CLAUDE.md, AGENTS.md, .cursorrules...) in its repository, if any.
export type PluginStats = {
  downloads?: number;
  stars?: number | null;
  updated?: string | null;
  root?: boolean | null;
  fork?: string;
  ai?: string[];
  warnings?: string[];
  prereleaseWarnings?: string[];
};

// Warnings from Decky Extended Plugins' audit (the registry's build_release_index.py picks
// them), explained in Discover's legend. Blocked is red; the rest look like Runs as root.
export const AUDIT_WARNINGS = [
  "blocked",
  "private-data",
  "persistence",
  "not-in-source",
  "obfuscated",
  "no-tls-check",
  "runs-downloads",
  "vulnerable",
] as const;
export type AuditWarning = (typeof AUDIT_WARNINGS)[number];
export const isAuditWarning = (key: string): key is AuditWarning => (AUDIT_WARNINGS as readonly string[]).includes(key);
// Audit warnings for the release an install would use: a pre-release's only on the pre-release channel.
export const installWarnings = (app: App): string[] => [
  ...(app.stats?.warnings ?? []),
  ...(app.channel === "prerelease" ? (app.stats?.prereleaseWarnings ?? []) : []),
];

// One scanner's verdict on a plugin ZIP. found lists what it matched (infected), or for
// ClamAV the size limit it hit (incomplete); reason says why a scan failed (error) or,
// for YARA, which files it couldn't look at (incomplete), in English from the registry.
export type ScanVerdict = {
  result: "clean" | "infected" | "incomplete" | "error";
  found?: string[];
  reason?: string;
  engine?: string;
  signatures?: string;
  scannedAt?: string;
};

// One plugin ZIP's line in the registry's scans.json (fetchVirusScans): ClamAV's verdict
// at the top (all DeckyHub releases read it), YARA's under yara (absent until YARA has
// scanned the ZIP, and in reports from before the registry ran YARA).
export type VirusScan = ScanVerdict & { sha256?: string; yara?: ScanVerdict; unverifiedMatch?: boolean };

// Manage-window buttons that Display Settings can hide.
export type HideableButton = "downloadZip" | "install" | "update" | "releasePage";

// Quick Access' UI Style: the classic look, or the Experimental redesign.
export type UiStyle = "default" | "experimental";

export type Settings = {
  overwriteExisting: boolean;
  updateChannel: UpdateChannel;
  registryChannel: UpdateChannel;
  language: string;
  columnsPerRow: 1 | 2 | 3 | 4;
  githubToken: string;
  density: "default" | "compact";
  oled: boolean;
  haptics: boolean;
  quickAccessTab: boolean;
  uiStyle: UiStyle;
  hiddenButtons: HideableButton[];
  repoSettings?: Record<string, RepoPreference>;
  customRepos?: string[];
  customRegistries?: string[];
};

export type Download = {
  state: string;
  filename?: string;
  repo?: string;
  received?: number;
  total?: number;
  path?: string;
  error?: string;
};

export type DeckyHubInfo = { version: string; downloadDir: string };

export type DeckyHubRelease = {
  version?: string;
  asset?: Asset;
  publishedAt?: string | null;
  notes?: string;
  error?: string;
};

export type DeckyHubReleaseOption = {
  tag: string;
  prerelease: boolean;
  publishedAt: string | null;
  asset?: Asset;
  url: string;
  notes?: string;
};

export type AppReleaseOption = {
  tag: string;
  pluginVersion?: string;
  prerelease: boolean;
  publishedAt: string | null;
  url: string;
  notes?: string;
  assets: Asset[];
};

export type View = "updates" | "discover" | "installed";

export type SearchRepo = { full_name: string; description?: string; stargazers_count?: number };

// skipVersion: a release tag the user chose to skip; that release stops counting as an update.
export type RepoPreference = { channel: "stable" | "prerelease"; skipVersion?: string };
