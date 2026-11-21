import { fetchNoCors } from "@decky/api";
import { getSettings } from "./api";
import { log } from "./log";
import { createRawCache } from "./rawCache";
import type { Asset, PluginStats, UpdateChannel, VirusScan } from "./types";

// GitHub's unauthenticated core API allows 60 requests/hour per IP, easy to
// burn through when Discover/Updates check every tracked app. Release lists
// are cached for 30 minutes (one shared entry per repo, see fetchReleases);
// every cache read is bypassed by force=true wherever the user explicitly asks
// to check (Refresh, Check for Updates).
export const CACHE_TTL = 30 * 60 * 1000;
// A transient outage should not hide registry data for the full successful-cache TTL.
const FAILED_RAW_JSON_TTL = 30_000;

// mazillka/deckyhub-registry publishes every listed repo's recent releases (and
// DeckyHub's own) as one file every hour (scripts/build_release_index.py there).
// It's read from raw.githubusercontent.com, outside the API's 60-an-hour limit
// that one call per listed repo would use up, so the API is asked only for repos
// the file lacks (added repos and registries). Header-less, so no CORS preflight.
const REGISTRY_RAW = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/";
export const RELEASE_INDEX_URL = `${REGISTRY_RAW}release-index/releases.json`;

// Settings' Registry channel: Pre-release reads the index the registry builds from its
// develop branch (release-index-develop), with main's as the fallback. Module state like
// the GitHub token, primed from settings by every I18nProvider and by Settings on save.
export let registryChannel: UpdateChannel = "stable";
let registryChannelLoaded: Promise<void> | null = null;

export function setRegistryChannel(channel: UpdateChannel | undefined) {
  registryChannel = channel === "prerelease" ? "prerelease" : "stable";
  registryChannelLoaded = Promise.resolve();
}

const indexUrls = (file: string) => [
  ...(registryChannel === "prerelease" ? [`${REGISTRY_RAW}release-index-develop/${file}`] : []),
  `${REGISTRY_RAW}release-index/${file}`,
];

// An index this old means its job stopped publishing; ask GitHub instead. Generous on
// purpose: GitHub skips scheduled runs for hours at a time, and a list of 300+ plugins
// can't be asked of the API at 60 requests an hour, so a day-old index beats none.
const RELEASE_INDEX_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// One of the release index's files, downloaded once and shared by every caller for
// CACHE_TTL. A forced refresh downloads it again, unless one started in the last
// minute (every card of one Refresh shares it); switching the Registry channel
// downloads the other branch's. `pick` turns the file into what callers get, and its
// fallback stands in for a missing or broken file, which moves on to the next URL.
// `urlsOf` picks where the file lives: the channel's release index by default.
function cachedRawJson<T>(
  file: string,
  pick: (data: any) => T,
  fallback: T,
  urlsOf: (file: string) => string[] = indexUrls,
) {
  const cached = createRawCache((urls) => firstRawJson(urls, pick, fallback), CACHE_TTL, FAILED_RAW_JSON_TTL);
  return async (force = false) => {
    // A failed settings read is retried on the next call rather than kept.
    registryChannelLoaded ??= getSettings().then(
      (settings) => setRegistryChannel(settings.registryChannel),
      () => {
        registryChannelLoaded = null;
      },
    );
    await registryChannelLoaded;
    return cached(urlsOf(file), force);
  };
}

async function firstRawJson<T>(
  urls: string[],
  pick: (data: any) => T,
  fallback: T,
): Promise<{ value: T; failed: boolean }> {
  for (const url of urls) {
    try {
      const response = await fetchNoCors(url, { signal: AbortSignal.timeout(15_000) });
      const picked = response.ok ? pick(await response.json()) : fallback;
      if (picked !== fallback) return { value: picked, failed: false };
    } catch (error: unknown) {
      log(`${url} unavailable: ${error}`);
    }
  }
  return { value: fallback, failed: true };
}

export const fetchReleaseIndex = cachedRawJson<Record<string, unknown[]> | null>(
  "releases.json",
  (index) => (Date.now() - Date.parse(index.generatedAt) < RELEASE_INDEX_MAX_AGE ? index.releases : null),
  null,
);

// Each listed plugin's stats (see PluginStats), published next to the release
// index by the same job. Only Discover uses it, so a missing file just leaves them out.
export const fetchPluginStats = cachedRawJson<Record<string, PluginStats>>(
  "stats.json",
  (stats) => stats.plugins ?? {},
  {},
);

// ClamAV's report for every plugin ZIP in both release indexes (DeckyHub's own too),
// keyed by download URL: the registry's virus-scan workflow (scripts/virus_scan.py
// there) publishes it on its own branch, the same for both Registry channels.
const fetchVirusScansResult = cachedRawJson<Record<string, VirusScan> | null>(
  "scans.json",
  (scans) => (scans.files && typeof scans.files === "object" && !Array.isArray(scans.files) ? scans.files : null),
  null,
  (file) => [`${REGISTRY_RAW}virus-scans/${file}`],
);
export async function fetchVirusScans(force = false): Promise<Record<string, VirusScan>> {
  return (await fetchVirusScansResult(force)) ?? {};
}

// The report for this exact file: one for a ZIP since replaced under the same name
// (a different SHA-256) doesn't count.
export function scanFor(scans: Record<string, VirusScan>, asset: Asset | undefined): VirusScan | null {
  const scan = asset && scans[asset.url];
  if (!asset || !scan) return null;
  const validHash = (hash?: string) => /^[0-9a-f]{64}$/i.test(hash ?? "");
  if (!validHash(asset.sha256) || !validHash(scan.sha256)) return { ...scan, unverifiedMatch: true };
  return scan.sha256!.toLowerCase() === asset.sha256!.toLowerCase() ? scan : null;
}

export async function virusScanOf(asset: Asset, force = false): Promise<VirusScan | null> {
  const scans = await fetchVirusScansResult(force);
  if (scans === null) throw new Error("Scan reports unavailable");
  return scanFor(scans, asset);
}

const fetchVirusTotalReports = cachedRawJson<Record<string, unknown> | null>(
  "reports.json",
  (index) =>
    index.reports && typeof index.reports === "object" && !Array.isArray(index.reports) ? index.reports : null,
  null,
  (file) => [`${REGISTRY_RAW}virustotal-reports/${file}`],
);

export async function virusTotalReportOf(asset: Asset) {
  const hash = asset.sha256?.toLowerCase();
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const reports = await fetchVirusTotalReports();
  if (reports === null) return { state: "unavailable" as const };
  const report = reports[hash] as { state?: string; stats?: Record<string, unknown>; scannedAt?: unknown } | undefined;
  // The registry scans only each listed plugin's newest ZIPs: an older version or an
  // added repository's ZIP has no entry, and may never get one.
  if (!report) return { state: "none" as const };
  if (report.state === "pending" || report.state === "waiting") return { state: "pending" as const };
  if (report.state === "error") return { state: "error" as const };
  if (report.state === "unsupported") return { state: "unsupported" as const };
  if (report.state !== "complete" || !report.stats) return null;
  const { malicious, suspicious, harmless, undetected } = report.stats;
  const count = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (!count(malicious) || !count(suspicious) || !count(harmless) || !count(undetected)) return null;
  const total = malicious + suspicious + harmless + undetected;
  if (!total) return null;
  return {
    state: "complete" as const,
    flagged: malicious + suspicious,
    total,
    scannedAt: count(report.scannedAt) ? report.scannedAt : undefined,
  };
}

const fetchMetaDefenderReports = cachedRawJson<Record<string, unknown> | null>(
  "reports.json",
  (index) =>
    index.reports && typeof index.reports === "object" && !Array.isArray(index.reports) ? index.reports : null,
  null,
  (file) => [`${REGISTRY_RAW}metadefender-reports/${file}`],
);

export async function metaDefenderReportOf(asset: Asset) {
  const hash = asset.sha256?.toLowerCase();
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const reports = await fetchMetaDefenderReports();
  if (!reports) return { state: "unavailable" as const };
  const report = reports[hash] as { state?: string; flagged?: unknown; total?: unknown; dataId?: unknown } | undefined;
  if (!report) return { state: "none" as const };
  if (report.state === "pending" || report.state === "waiting") return { state: "pending" as const };
  if (report.state === "error") return { state: "error" as const };
  if (report.state !== "complete") return null;
  const { flagged, total, dataId } = report;
  if (
    typeof flagged !== "number" ||
    !Number.isSafeInteger(flagged) ||
    flagged < 0 ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    flagged > total
  )
    return null;
  return {
    state: "complete" as const,
    flagged,
    total,
    dataId: typeof dataId === "string" && /^[A-Za-z0-9_-]+$/.test(dataId) ? dataId : undefined,
  };
}
