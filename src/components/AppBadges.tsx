import { Focusable } from "@decky/ui";
import type { CSSProperties } from "react";
import type { TFunc } from "../i18n/en";
import { FaShieldAlt } from "react-icons/fa";
import { collectFindings } from "../findings";
import { keepInView } from "./KeepInView";
import { AUDIT_WARNINGS, installWarnings, isAuditWarning, type App, type AuditWarning, type VirusScan } from "../types";
import { installedRiskReasons } from "../notify";
import { compactNumber, timeAgo } from "../utils";
import { storeActivityOf, storeCountOf, totalDownloads, validCount } from "../sorting";
import { independentAuditOf } from "../independentAudit";
import { colors, tint } from "../styles";

export const pillStyle = {
  display: "inline-block",
  marginRight: 6,
  padding: "1px 8px",
  border: "1px solid",
  borderRadius: 999,
  fontSize: "max(12px, 0.78em)",
  fontWeight: 600,
};
const monogramStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  borderRadius: 8,
  color: colors.text,
  fontWeight: 700,
  letterSpacing: "0.02em",
};

// The registry's date for the release it shows, else the card's own release check.
const releasedAt = (app: App) => Date.parse(app.stats?.updated || app.publishedAt || "");
const isStale = (released: number) => Date.now() - released > 365 * 24 * 60 * 60 * 1000;

// The Runs as root badge, also shown in Discover's legend that explains it.
export const RootBadge = ({ t }: { t: TFunc }) => (
  <span title={t("appcard.runsAsRootHint")} style={{ ...pillStyle, ...tint(colors.caution) }}>
    {t("appcard.runsAsRoot")}
  </span>
);

export { AUDIT_WARNINGS };

export const WarningBadge = ({ t, warning, prerelease }: { t: TFunc; warning: AuditWarning; prerelease?: boolean }) => {
  const color = warning === "blocked" || warning === "not-in-source" ? colors.dangerSoft : colors.caution;
  const label = t(`appcard.warning.${warning}`);
  // nowrap: beside the legend's text a long label squeezed onto three lines (seen on a Deck).
  return (
    <span
      title={t(`appcard.warning.${warning}.hint`)}
      style={{
        ...pillStyle,
        whiteSpace: warning === "not-in-source" ? "normal" : "nowrap",
        overflowWrap: warning === "not-in-source" ? "anywhere" : undefined,
        ...tint(color),
      }}
    >
      {prerelease ? `${t("appcard.channelPrerelease")}: ${label}` : label}
    </span>
  );
};

// Show warnings for the card asset when hydration identifies it; otherwise preserve both known sets.
function AuditWarnings({ app, t }: { app: App; t: TFunc }) {
  if (app.latestPrerelease === true) {
    return (
      <>
        {installWarnings(app)
          .filter(isAuditWarning)
          .map((key) => (
            <WarningBadge key={key} t={t} warning={key} prerelease />
          ))}
      </>
    );
  }
  if (app.latestPrerelease === false) {
    return (
      <>
        {installWarnings(app)
          .filter(isAuditWarning)
          .map((key) => (
            <WarningBadge key={key} t={t} warning={key} />
          ))}
      </>
    );
  }
  const stable = app.stats?.warnings ?? [];
  const prerelease =
    app.channel === "prerelease" ? (app.stats?.prereleaseWarnings ?? []).filter((key) => !stable.includes(key)) : [];
  return (
    <>
      {stable.filter(isAuditWarning).map((key) => (
        <WarningBadge key={key} t={t} warning={key} />
      ))}
      {prerelease.filter(isAuditWarning).map((key) => (
        <WarningBadge key={key} t={t} warning={key} prerelease />
      ))}
    </>
  );
}

// The Fork badge: a fork the registry lists because it carries a plugin on after its
// original stopped. Also shown in Discover's legend that explains it.
export const ForkBadge = ({ t, repo }: { t: TFunc; repo?: string }) => (
  <span
    title={repo ? t("appcard.forkOf", { repo }) : t("appcard.forkHint")}
    style={{ ...pillStyle, ...tint(colors.muted) }}
  >
    {t("appcard.fork")}
  </span>
);

// The Decky store lists a plugin with this name (the registry matches by name; the store names no repository).
export const StoreBadge = ({ t, downloads }: { t: TFunc; downloads: number }) => (
  <span
    title={t("appcard.inStoreHint", { count: downloads.toLocaleString() })}
    style={{ ...pillStyle, ...tint(colors.blue) }}
  >
    {t("appcard.inStore")}
  </span>
);

// The AI badge: the plugin's repository has files that set it up for AI coding assistants
// (the registry's stats.json lists them), so it's likely developed with AI help. Also shown
// in Discover's legend, which says what it does and doesn't mean.
const AI_COLOR = "#c49bff";
export const AiBadge = ({ t, files }: { t: TFunc; files?: string[] }) => (
  <span
    className="deckyhub-ai-badge"
    title={files?.length ? t("appcard.aiFiles", { files: files.join(", ") }) : t("appcard.aiHint")}
    style={{ ...pillStyle, ...tint(AI_COLOR) }}
  >
    {t("appcard.ai")}
  </span>
);

// The Rust badge: the plugin's repository has Rust code (the registry's stats.json says so).
// It says what the plugin is written in, nothing about its quality or safety.
const RUST_COLOR = "#ffb08a";
export const RustBadge = ({ t }: { t: TFunc }) => (
  <span title={t("appcard.rustHint")} style={{ ...pillStyle, ...tint(RUST_COLOR) }}>
    {t("appcard.rust")}
  </span>
);

// Pre-release only: no stable release, so the card offers pre-releases (hydrate). No description:
// its author hasn't said what it does. Both also shown in Discover's legend.
export const PrereleaseOnlyBadge = ({ t }: { t: TFunc }) => (
  <span title={t("appcard.prereleaseOnlyHint")} style={{ ...pillStyle, whiteSpace: "nowrap", ...tint(colors.caution) }}>
    {t("appcard.prereleaseOnly")}
  </span>
);
export const NoDescriptionBadge = ({ t }: { t: TFunc }) => (
  <span title={t("appcard.noDescriptionHint")} style={{ ...pillStyle, whiteSpace: "nowrap", ...tint(colors.caution) }}>
    {t("appcard.noDescription")}
  </span>
);

// The virus scans' verdict on the release the card installs (the registry's scans.json):
// the worse of ClamAV's and YARA's, also shown in Discover's legend. Nothing until the ZIP
// has a report; Manage has the full report.
// ClamAV, YARA, VirusTotal and MetaDefender.
const SCANNERS = 4;
type ScanBadgeKind = "clean" | "infected" | "partial";
export const SCAN_BADGES: ScanBadgeKind[] = ["clean", "infected", "partial"];
const SCAN_COLORS: Record<ScanBadgeKind, string> = {
  clean: colors.success,
  infected: colors.dangerSoft,
  partial: colors.caution,
};
export const scanSummary = (scan: VirusScan, virusTotal?: App["virusTotal"], metaDefender?: App["metaDefender"]) => {
  const results = [scan.result, scan.yara?.result].filter(
    (result): result is NonNullable<typeof result> => result != null,
  );
  if (virusTotal?.state === "complete" && virusTotal.flagged !== undefined) {
    results.push(virusTotal.flagged ? "infected" : "clean");
  }
  if (metaDefender?.state === "complete" && metaDefender.flagged !== undefined) {
    results.push(metaDefender.flagged ? "infected" : "clean");
  }
  const passed = results.filter((result) => result === "clean").length;
  // Nothing flagged only once all four scanners have reported and none flagged it: ClamAV and YARA alone say less than
  // "Nothing flagged" sounds like, so a release still waiting on VirusTotal or MetaDefender is Not fully scanned.
  const kind: ScanBadgeKind = results.includes("infected")
    ? "infected"
    : results.length >= SCANNERS && passed === results.length
      ? "clean"
      : "partial";
  return { kind, count: `${passed}/${SCANNERS}` };
};

export const ScanBadge = ({ t, kind, count }: { t: TFunc; kind: ScanBadgeKind; count?: string }) => {
  const color = SCAN_COLORS[kind];
  return (
    <span
      className={`deckyhub-scan-badge deckyhub-scan-${kind}`}
      title={t(`appcard.scan.${kind}.hint`)}
      style={{ ...pillStyle, whiteSpace: "nowrap", ...tint(color) }}
    >
      <FaShieldAlt /> {t(`appcard.scan.${kind}`)}
      {count && ` · ${count}`}
    </span>
  );
};

// Discover looks the ZIP's scan up and leaves null when there is none: say so, since no badge would
// read as nothing to report.
const NotScannedBadge = ({ t }: { t: TFunc }) => (
  <span title={t("scan.notScanned")} style={{ ...pillStyle, whiteSpace: "nowrap", ...tint(colors.muted) }}>
    <FaShieldAlt /> {t("scan.pending")}
  </span>
);

// What an update changes in the audit's warnings, against the installed version's.
function UpdateWarningChanges({ app, t }: { app: App; t: TFunc }) {
  if (!app.updateAvailable || !app.installedAssets?.[0]) return null;
  const before = app.installedRisk?.warnings ?? [];
  const after = auditKeys(app);
  const label = (keys: string[]) => keys.map((key) => t(`appcard.warning.${key}` as Parameters<TFunc>[0])).join(", ");
  const added = after.filter((key) => !before.includes(key));
  const dropped = before.filter((key) => isAuditWarning(key) && !after.includes(key));
  return (
    <>
      {added.length > 0 && (
        <small style={{ color: colors.caution }}>{t("updates.newWarnings", { warnings: label(added) })}</small>
      )}
      {dropped.length > 0 && (
        <small style={{ color: colors.muted }}>{t("updates.droppedWarnings", { warnings: label(dropped) })}</small>
      )}
    </>
  );
}

// The other badges describe the release the card would install; this one, first, the installed version when that's another one.
const InstalledRiskBadge = ({ t, risk }: { t: TFunc; risk: NonNullable<App["installedRisk"]> }) => {
  const reasons = installedRiskReasons(t, risk);
  return reasons ? (
    <span
      title={t("appcard.installedFlagged.hint", { reasons })}
      style={{ ...pillStyle, whiteSpace: "nowrap", ...tint(colors.dangerSoft) }}
    >
      <FaShieldAlt /> {t("appcard.installedFlagged")}
    </span>
  ) : null;
};

// The audit warnings the card shows, for the release it would install (see AuditWarnings).
const auditKeys = (app: App) =>
  [
    ...new Set(
      app.latestPrerelease === undefined
        ? [
            ...(app.stats?.warnings ?? []),
            ...(app.channel === "prerelease" ? (app.stats?.prereleaseWarnings ?? []) : []),
          ]
        : installWarnings(app),
    ),
  ].filter(isAuditWarning);

export const findingsOf = (app: App) =>
  collectFindings({
    warnings: auditKeys(app),
    sourceMismatch: Boolean(app.scan && (independentAuditOf(app.scan)?.source?.findings.length ?? 0) > 0),
    scan: app.scan && !app.scan.unverifiedMatch ? scanSummary(app.scan, app.virusTotal, app.metaDefender).kind : null,
    root: app.stats?.root === true,
    prereleaseOnly: app.prereleaseOnly === true,
    stale: isStale(releasedAt(app)),
  });

// Everything the audit, the scans and the registry say about the release, each fact with its
// explanation (src/findings.ts). No verdict and no score: the user decides. One focus target, so
// the D-pad scrolls to it like the scan report below it.
export function FindingsSummary({ app, t }: { app: App; t: TFunc }) {
  const { findings, scanned } = findingsOf(app);
  return (
    <Focusable
      onActivate={() => {}}
      onFocus={keepInView}
      className="deckyhub-findings"
      style={{ display: "grid", gap: 8, padding: "12px 14px", borderRadius: 10, border: `1px solid ${colors.muted}55` }}
    >
      <strong>{t("risk.title")}</strong>
      <small>{t("risk.intro")}</small>
      {findings.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          {findings.map((finding) => (
            <li key={finding.label} style={{ fontSize: "max(12px, 0.85em)" }}>
              <strong style={{ color: finding.tone === "danger" ? colors.dangerSoft : colors.caution }}>
                {t(finding.label as Parameters<TFunc>[0])}
              </strong>
              {finding.hint && <> — {t(finding.hint as Parameters<TFunc>[0])}</>}
            </li>
          ))}
        </ul>
      ) : (
        scanned && <small>{t("risk.none")}</small>
      )}
      {!scanned && (
        <small style={{ color: colors.caution }}>
          {t(app.scan?.unverifiedMatch ? "scan.unverifiedMatch" : "scan.notScanned")}
        </small>
      )}
    </Focusable>
  );
}

// Installed version flagged / Runs as root / Fork / AI / Pre-release only / No description / audit warnings / virus scan / No release in a year, shared by the card and its Manage window.
export function AppBadges({ app, t }: { app: App; t: TFunc }) {
  const released = releasedAt(app);
  // Installed from the Decky store, not GitHub: the other badges describe a GitHub release it doesn't offer.
  if (app.store) return <>{app.stats?.store && <StoreBadge t={t} downloads={app.stats.store.downloads} />}</>;
  return (
    <>
      {/* Installed the card's own release: its badges already describe it. */}
      {app.installedRisk && app.installedAssets?.[0]?.url !== app.assets[0]?.url && (
        <InstalledRiskBadge t={t} risk={app.installedRisk} />
      )}
      {app.stats?.root && <RootBadge t={t} />}
      {app.stats?.fork && <ForkBadge t={t} repo={app.stats.fork} />}
      {app.stats?.store && <StoreBadge t={t} downloads={app.stats.store.downloads} />}
      {app.stats?.ai?.length ? <AiBadge t={t} files={app.stats.ai} /> : null}
      {app.stats?.rust && <RustBadge t={t} />}
      {app.prereleaseOnly && <PrereleaseOnlyBadge t={t} />}
      {!app.description?.trim() && <NoDescriptionBadge t={t} />}
      <AuditWarnings app={app} t={t} />
      {app.scan &&
        (independentAuditOf(app.scan)?.source?.findings.length ?? 0) > 0 &&
        !installWarnings(app).includes("not-in-source") && <WarningBadge t={t} warning="not-in-source" />}
      {app.scan &&
        (app.scan.unverifiedMatch ? (
          <small style={{ color: SCAN_COLORS.partial }}>{t("scan.unverifiedMatch")}</small>
        ) : (
          <ScanBadge t={t} {...scanSummary(app.scan, app.virusTotal, app.metaDefender)} />
        ))}
      {app.scan === null && <NotScannedBadge t={t} />}
      <UpdateWarningChanges app={app} t={t} />
      {isStale(released) && (
        <span title={new Date(released).toLocaleDateString()} style={{ ...pillStyle, ...tint(colors.dangerSoft) }}>
          {t("appcard.noReleaseInYear")}
        </span>
      )}
    </>
  );
}

// Updated / downloads / stars, shared by the card and its Manage window. A list row
// leaves out Updated (noUpdated): beside the latest version it cut the counts short.
// `detailed` (the details window, where a tooltip can't be read with a controller) says where the downloads
// came from: GitHub and the Decky store.
export function AppStats({
  app,
  t,
  noUpdated,
  detailed,
}: {
  app: App;
  t: TFunc;
  noUpdated?: boolean;
  detailed?: boolean;
}) {
  const released = releasedAt(app);
  const { stars } = app.stats ?? {};
  const downloads = totalDownloads(app.stats);
  const githubCount = app.stats?.downloads;
  const github = validCount(githubCount) ? githubCount : undefined;
  const storeActivity = storeActivityOf(app.stats);
  const store = storeCountOf(app.stats);
  return (
    <>
      {!noUpdated && released > 0 && !isStale(released) && (
        <span title={new Date(released).toLocaleDateString()}>{t("appcard.updated", { when: timeAgo(released) })}</span>
      )}
      {downloads !== undefined && (
        <span
          title={[
            downloads !== undefined && t("appcard.downloads", { count: compactNumber(downloads) }),
            github !== undefined && t("appcard.githubDownloads", { count: github.toLocaleString() }),
            storeActivity !== undefined
              ? t("appcard.storeActivity", { count: storeActivity.toLocaleString() })
              : store !== undefined && t("appcard.storeDownloads", { count: store.toLocaleString() }),
          ]
            .filter(Boolean)
            .join("\n")}
        >
          ↓ {compactNumber(downloads)}
        </span>
      )}
      {detailed && store !== undefined && (
        <span>
          {t("appcard.downloadsBreakdown", {
            github: compactNumber(github ?? 0),
            store: compactNumber(store),
          })}
          {storeActivity !== undefined && (
            <>
              <br />
              {t("appcard.storeActivity", { count: compactNumber(storeActivity) })}
            </>
          )}
          {downloads !== undefined && (
            <>
              <br />
              {t("appcard.downloads", { count: compactNumber(downloads) })}
            </>
          )}
        </span>
      )}
      {stars != null && (
        <span title={t("appcard.stars", { count: stars.toLocaleString() })}>★ {compactNumber(stars)}</span>
      )}
    </>
  );
}

// Up to two initials, e.g. "Decky LSFG-VK" -> "DL".
const monogram = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
// A stable hue per category, so every card in a category shares its color.
export const categoryHue = (category: string) =>
  [...category].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 7);

// The app's initials on its category's color, on its card and in its Manage window.
export function AppMonogram({ app, style }: { app: App; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={{ ...monogramStyle, flexShrink: 0, background: `hsl(${categoryHue(app.category)} 45% 32%)`, ...style }}
    >
      {monogram(app.name)}
    </div>
  );
}
