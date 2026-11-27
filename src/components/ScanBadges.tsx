import { FaShieldAlt } from "react-icons/fa";
import type { TFunc } from "../i18n/en";
import { colors, tint } from "../styles";
import { scanSummary, type ScanBadgeKind } from "../findings";
import { pillStyle } from "./badgeStyles";

// The virus scans' verdict on the release the card installs (the registry's scans.json):
// the worse of ClamAV's and YARA's, also shown in Discover's legend. Nothing until the ZIP
// has a report; Manage has the full report.
export { scanSummary };
export type { ScanBadgeKind };
export const SCAN_BADGES: ScanBadgeKind[] = ["clean", "infected", "partial"];
export const SCAN_COLORS: Record<ScanBadgeKind, string> = {
  clean: colors.success,
  infected: colors.dangerSoft,
  partial: colors.caution,
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
