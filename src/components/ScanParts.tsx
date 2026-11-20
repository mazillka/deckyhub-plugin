import { Focusable } from "@decky/ui";
import type { ReactNode } from "react";
import { FaShieldAlt } from "react-icons/fa";
import type { TFunc } from "../i18n/en";
import type { metaDefenderReportOf, virusTotalReportOf } from "../releases";
import { colors } from "../styles";
import type { ScanVerdict, VirusScan } from "../types";
import { keepInView } from "./KeepInView";

export const COLORS: Record<ScanVerdict["result"], string> = {
  clean: colors.success,
  infected: colors.danger,
  incomplete: colors.caution,
  error: colors.caution,
};
export const MUTED = colors.dim;

export type VirusTotalReport = NonNullable<Awaited<ReturnType<typeof virusTotalReportOf>>>;
export type MetaDefenderReport = Awaited<ReturnType<typeof metaDefenderReportOf>>;

// The two scanners in scans.json: ClamAV at the top of a ZIP's line, YARA under yara.
export type Scanner = { name: string; verdict?: ScanVerdict };
export const scannersOf = (scan: VirusScan): Scanner[] => [
  { name: "ClamAV", verdict: scan },
  { name: "YARA", verdict: scan.yara },
];

// ClamAV's incomplete means a size limit; YARA's says which files it couldn't open (reason).
const summary = (t: TFunc, name: string, verdict: ScanVerdict) => {
  if (verdict.result === "infected") return t("scan.infected", { names: (verdict.found ?? []).join(", ") });
  if (verdict.result === "incomplete" && name === "YARA") return t("scan.partly");
  return t(`scan.${verdict.result}`);
};

export const line = (t: TFunc, { name, verdict }: Scanner) =>
  t("scan.verdict", { scanner: name, verdict: verdict ? summary(t, name, verdict) : t("scan.pending") });

// One D-pad stop in a scan report: Steam only scrolls to follow focus, so each line is its own.
export const Stop = ({ children }: { children: ReactNode }) => (
  <Focusable onActivate={() => {}} onFocus={keepInView}>
    {children}
  </Focusable>
);

// One scanner's line in the Manage window's box: shield and verdict on the left, when it
// ran on the right, wrapping under it on a narrow window.
export function Row({
  color,
  label,
  when,
  className,
}: {
  color: string;
  label: string;
  when?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "baseline",
        columnGap: 12,
      }}
    >
      <span style={{ color, fontWeight: 600, overflowWrap: "anywhere" }}>
        <FaShieldAlt /> {label}
      </span>
      {when && <small style={{ color: MUTED, whiteSpace: "nowrap" }}>{when}</small>}
    </div>
  );
}

const VIRUSTOTAL_STATES = {
  none: "scan.pending",
  pending: "scan.waiting",
  unsupported: "scan.unsupported",
  unavailable: "scan.unavailable",
  error: "scan.error",
} as const;

export function VirusTotalResult({ t, report }: { t: TFunc; report: VirusTotalReport }) {
  if (report.state !== "complete") {
    const color = report.state === "pending" || report.state === "none" ? colors.danger : MUTED;
    return (
      <small style={{ color }}>
        {t("scan.verdict", { scanner: "VirusTotal", verdict: t(VIRUSTOTAL_STATES[report.state]) })}
      </small>
    );
  }
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <strong style={{ color: report.flagged ? COLORS.infected : COLORS.clean }}>
        <FaShieldAlt /> {t("scan.virusTotalResult", { flagged: report.flagged, total: report.total })}
      </strong>
      {report.scannedAt !== undefined && (
        <small style={{ color: MUTED }}>
          {t("scan.scannedAt", { date: new Date(report.scannedAt * 1000).toLocaleString() })}
        </small>
      )}
    </div>
  );
}

const METADEFENDER_STATES = {
  none: "scan.pending",
  pending: "scan.waiting",
  error: "scan.error",
  unavailable: "scan.unavailable",
} as const;

export const MetaDefenderPending = ({ t, state }: { t: TFunc; state: keyof typeof METADEFENDER_STATES }) => (
  <small style={{ color: state === "pending" || state === "none" ? colors.danger : MUTED }}>
    {t("scan.verdict", { scanner: "MetaDefender", verdict: t(METADEFENDER_STATES[state]) })}
  </small>
);
