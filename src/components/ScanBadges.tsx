import { FaShieldAlt } from "react-icons/fa";
import type { TFunc } from "../i18n/en";
import { colors, tint } from "../styles";
import type { App, VirusScan } from "../types";
import { pillStyle } from "./badgeStyles";

// The virus scans' verdict on the release the card installs (the registry's scans.json):
// the worse of ClamAV's and YARA's, also shown in Discover's legend. Nothing until the ZIP
// has a report; Manage has the full report.
// ClamAV, YARA, VirusTotal and MetaDefender.
const SCANNERS = 4;
export type ScanBadgeKind = "clean" | "infected" | "partial";
export const SCAN_BADGES: ScanBadgeKind[] = ["clean", "infected", "partial"];
export const SCAN_COLORS: Record<ScanBadgeKind, string> = {
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
export const NotScannedBadge = ({ t }: { t: TFunc }) => (
  <span title={t("scan.notScanned")} style={{ ...pillStyle, whiteSpace: "nowrap", ...tint(colors.muted) }}>
    <FaShieldAlt /> {t("scan.pending")}
  </span>
);
