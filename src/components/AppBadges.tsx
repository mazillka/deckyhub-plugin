import type { CSSProperties } from "react";
import type { TFunc } from "../i18n/en";
import { FaShieldAlt } from "react-icons/fa";
import { AUDIT_WARNINGS, isAuditWarning, type App, type AuditWarning, type VirusScan } from "../types";
import { installedRiskReasons } from "../notify";
import { compactNumber, timeAgo } from "../utils";
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
  const color = warning === "blocked" ? colors.dangerSoft : colors.caution;
  const label = t(`appcard.warning.${warning}`);
  // nowrap: beside the legend's text a long label squeezed onto three lines (seen on a Deck).
  return (
    <span title={t(`appcard.warning.${warning}.hint`)} style={{ ...pillStyle, whiteSpace: "nowrap", ...tint(color) }}>
      {prerelease ? `${t("appcard.channelPrerelease")}: ${label}` : label}
    </span>
  );
};

// The release this card installs: a pre-release's warnings only on the pre-release channel.
function AuditWarnings({ app, t }: { app: App; t: TFunc }) {
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

// The virus scans' verdict on the release the card installs (the registry's scans.json):
// the worse of ClamAV's and YARA's, also shown in Discover's legend. Nothing until the ZIP
// has a report; Manage has the full report.
type ScanBadgeKind = "clean" | "infected" | "partial";
export const SCAN_BADGES: ScanBadgeKind[] = ["clean", "infected", "partial"];
const SCAN_COLORS: Record<ScanBadgeKind, string> = {
  clean: colors.success,
  infected: colors.dangerSoft,
  partial: colors.caution,
};
const scanSummary = (scan: VirusScan, virusTotal?: App["virusTotal"], metaDefender?: App["metaDefender"]) => {
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
  const kind: ScanBadgeKind = results.includes("infected")
    ? "infected"
    : scan.yara && passed === results.length
      ? "clean"
      : "partial";
  return { kind, count: `${passed}/${results.length}` };
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

// Installed version flagged / Runs as root / Fork / AI / audit warnings / virus scan / No release in a year, shared by the card and its Manage window.
export function AppBadges({ app, t }: { app: App; t: TFunc }) {
  const released = releasedAt(app);
  return (
    <>
      {/* Installed the card's own release: its badges already describe it. */}
      {app.installedRisk && app.installedAssets?.[0]?.url !== app.assets[0]?.url && (
        <InstalledRiskBadge t={t} risk={app.installedRisk} />
      )}
      {app.stats?.root && <RootBadge t={t} />}
      {app.stats?.fork && <ForkBadge t={t} repo={app.stats.fork} />}
      {app.stats?.ai?.length ? <AiBadge t={t} files={app.stats.ai} /> : null}
      <AuditWarnings app={app} t={t} />
      {app.scan &&
        (app.scan.unverifiedMatch ? (
          <small style={{ color: SCAN_COLORS.partial }}>{t("scan.unverifiedMatch")}</small>
        ) : (
          <ScanBadge t={t} {...scanSummary(app.scan, app.virusTotal, app.metaDefender)} />
        ))}
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
export function AppStats({ app, t, noUpdated }: { app: App; t: TFunc; noUpdated?: boolean }) {
  const released = releasedAt(app);
  const { downloads, stars } = app.stats ?? {};
  return (
    <>
      {!noUpdated && released > 0 && !isStale(released) && (
        <span title={new Date(released).toLocaleDateString()}>{t("appcard.updated", { when: timeAgo(released) })}</span>
      )}
      {downloads !== undefined && (
        <span title={t("appcard.downloads", { count: downloads.toLocaleString() })}>↓ {compactNumber(downloads)}</span>
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
