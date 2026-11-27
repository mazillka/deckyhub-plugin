// Version parsing and comparison, kept free of imports so `pnpm run
// test:frontend` can run it under plain Node.

export const normalizeVersion = (value: string) => value.trim().replace(/^v/i, "");

// One display format for every version: "v" + the version number, keeping a
// pre-release suffix — "plugin-v3.3.0" → v3.3.0, "Release-0.7.5" → v0.7.5,
// "1.0.3-rc.2" → v1.0.3-rc.2. Anything without a version number is shown as is.
export function displayVersion(value: string) {
  const match = value.match(/(\d+(?:\.\d+)+)(-[0-9A-Za-z.-]+)?/);
  return match ? `v${match[1]}${match[2] ?? ""}` : value;
}

// displayVersion() without its "v", for sentences that add their own ("Update to v1.2.3").
export const plainVersion = (value?: string | null) => displayVersion(value ?? "").replace(/^v/, "");

// The version number and pre-release suffix inside a tag or version string —
// the same part displayVersion() shows: "plugin-v3.3.0" → 3.3.0,
// "1.0.3-rc.2" → 1.0.3 + "rc.2". Null when there's no dotted version number.
function parseVersion(value: string) {
  const match = value.match(/(\d+(?:\.\d+)+)(?:-([0-9A-Za-z.-]+))?/);
  return match ? { release: match[1].split(".").map(Number), prerelease: match[2] ?? null } : null;
}

// A version with no pre-release suffix outranks the same release number with
// one ("1.0.3" > "1.0.3-rc.9"). Suffixes compare piece by piece, splitting
// letters from digits so "rc9" < "rc10" as well as "rc.9" < "rc.10": numbers
// numerically, words alphabetically ("alpha" < "beta" < "rc"), a number below
// a word, and a shorter suffix below a longer one it starts ("rc" < "rc.1").
function comparePrerelease(target: string | null, current: string | null): number {
  if (target === current) return 0;
  if (target === null) return 1;
  if (current === null) return -1;
  const a = target.toLowerCase().match(/\d+|[a-z]+/g) ?? [];
  const b = current.toLowerCase().match(/\d+|[a-z]+/g) ?? [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const aNumber = /^\d/.test(a[i]),
      bNumber = /^\d/.test(b[i]);
    const diff =
      aNumber && bNumber
        ? Number(a[i]) - Number(b[i])
        : aNumber !== bNumber
          ? aNumber
            ? -1
            : 1
          : a[i].localeCompare(b[i]);
    if (diff) return Math.sign(diff);
  }
  return Math.sign(a.length - b.length);
}

// 1 / -1 / 0 as target is newer / older / the same as current, or null when
// either has no version number. Used for DeckyHub itself and every tracked
// app, so pre-release suffixes count everywhere (rc.1 → rc.2 → final).
export function compareVersions(target: string, current: string): number | null {
  const a = parseVersion(target),
    b = parseVersion(current);
  if (!a || !b) return null;
  for (let i = 0; i < Math.max(a.release.length, b.release.length); i++) {
    const diff = (a.release[i] || 0) - (b.release[i] || 0);
    if (diff) return Math.sign(diff);
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

// The version a release installs as: the registry's release index reads it from the
// release's ZIP (pluginVersion) for each channel's newest release, because some plugins
// tag v0.45 while calling themselves 0.4.5, which would look like an update forever.
// Everywhere else (older releases, repos the index lacks) the tag is all there is.
export const releaseVersion = (release: { tag: string; pluginVersion?: string }) =>
  release.pluginVersion || release.tag;

// The release (newest first) the installed version came from, and which audit in the
// registry's stats.json covers it: "stable" for the newest stable release (warnings),
// "prerelease" for a newer pre-release (prereleaseWarnings), none for anything older.
export function installedRelease<T extends { tag: string; pluginVersion?: string; prerelease: boolean }>(
  items: T[],
  installedVersion: string | null | undefined,
): { release: T; audit?: "stable" | "prerelease" } | undefined {
  if (!installedVersion) return undefined;
  const release = items.find(
    (item) =>
      compareVersions(releaseVersion(item), installedVersion) === 0 ||
      normalizeVersion(releaseVersion(item)) === normalizeVersion(installedVersion),
  );
  if (!release) return undefined;
  const audit =
    release === items.find((item) => !item.prerelease)
      ? "stable"
      : release === items[0] && release.prerelease
        ? "prerelease"
        : undefined;
  return { release, audit };
}

// The stable channel sees only stable releases; the pre-release channel sees
// everything, so a stable release newer than the last pre-release still
// reaches people on pre-releases.
export const inChannel = (release: { prerelease: boolean }, channel: "stable" | "prerelease") =>
  channel === "prerelease" || !release.prerelease;

// The Decky store is a plugin's home when the installed version is one the stable store lists (versions: stats.json's
// store.versions): only a newer store version is then an update. githubNewer: a GitHub release above the store's
// newest, to be told, never offered as an update.
export function storeHome(
  versions: unknown,
  installed: string | null | undefined,
  releases: { tag: string; pluginVersion?: string; prerelease: boolean }[],
): { storeLatest: string; githubNewer?: { version: string; prerelease: boolean } } | undefined {
  if (!installed || !Array.isArray(versions)) return undefined;
  const listed = versions.filter((version): version is string => typeof version === "string");
  if (!listed.some((version) => sameVersion(version, installed))) return undefined;
  const newest = (a: string, b: string) => (compareVersions(b, a) === 1 ? b : a);
  const storeLatest = listed.reduce(newest, installed);
  const above = releases.filter((release) => compareVersions(releaseVersion(release), storeLatest) === 1);
  if (!above.length) return { storeLatest };
  const top = above.reduce((a, b) => (compareVersions(releaseVersion(b), releaseVersion(a)) === 1 ? b : a));
  return { storeLatest, githubNewer: { version: releaseVersion(top), prerelease: top.prerelease } };
}

// What restoring a plugin pack would do with each plugin in it (RestorePackModal.tsx).
type ReleaseLike = { tag: string; pluginVersion?: string; prerelease: boolean };

export type RestoreStatus =
  // Not installed: it can be installed.
  | "missing"
  // Installed in another version than the pack's: it can be changed to the saved or the latest one.
  | "different"
  // Installed in the pack's version, or the pack saved none: nothing to do.
  | "installed"
  // Installed, but DeckyHub can't confirm it's this repository's plugin: never changed from here.
  | "unverified";

const sameVersion = (a: string, b: string) =>
  compareVersions(a, b) === 0 || normalizeVersion(a) === normalizeVersion(b);

export function restoreStatus(
  saved: string | null,
  installed: string | null | undefined,
  unverified: boolean | undefined,
): RestoreStatus {
  if (!installed) return "missing";
  if (unverified) return "unverified";
  return !saved || sameVersion(saved, installed) ? "installed" : "different";
}

// The releases a row offers, the pack's saved one first: it is the default. The version already installed is never
// offered. savedUnavailable: the pack names a version that isn't among the releases DeckyHub can see.
export function restoreChoices<T extends ReleaseLike>(
  releases: T[],
  latestTag: string | null | undefined,
  saved: string | null,
  installed: string | null | undefined,
): { choices: { release: T; saved: boolean; latest: boolean }[]; savedUnavailable: boolean } {
  const savedRelease = saved ? installedRelease(releases, saved)?.release : undefined;
  const latestRelease = releases.find((release) => release.tag === latestTag);
  const choices = [savedRelease, latestRelease]
    .filter((release, index, all): release is T => release !== undefined && all.indexOf(release) === index)
    .filter((release) => !installed || !sameVersion(releaseVersion(release), installed))
    .map((release) => ({ release, saved: release === savedRelease, latest: release === latestRelease }));
  return { choices, savedUnavailable: Boolean(saved) && !savedRelease };
}
