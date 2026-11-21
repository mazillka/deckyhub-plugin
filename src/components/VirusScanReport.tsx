import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Focusable, showModal } from "@decky/ui";
import { FaCopy, FaExternalLinkAlt } from "react-icons/fa";
import { independentAuditOf } from "../independentAudit";
import { WarningBadge } from "./AppBadges";
import { openExternalWeb } from "../external";
import type { TFunc } from "../i18n/en";
import type { Asset, VirusScan } from "../types";
import { displayVersion } from "../version";
import { copyText, modalButtonStyle, timeAgo } from "../utils";
import { sectionTitleStyle } from "./DetailsParts";
import { keepInView } from "./KeepInView";
import { scanAccent } from "../findings";
import { colors } from "../styles";
import { ScanReportModal } from "./ScanReportModal";
import { useExpandOnAttention, useScanResults, type ScanState } from "../hooks/useScanResults";
import {
  COLORS,
  line,
  MetaDefenderPending,
  MUTED,
  Row,
  scannersOf,
  VirusTotalResult,
  type MetaDefenderReport,
  type VirusTotalReport,
} from "./ScanParts";

// VirusTotal's URL scan page. It can't be handed the link, so Scan Link copies it first
// and the user pastes it there.
const VIRUSTOTAL_URL_SCAN = "https://www.virustotal.com/gui/home/url";
// The document a button press came from (Steam's main window for a Manage window).
const pageOf = (event?: { currentTarget?: EventTarget | null }) =>
  (event?.currentTarget as Node | null | undefined)?.ownerDocument ?? document;

// What the scan box says about ClamAV and YARA: still checking, not available, never scanned, or each verdict.
function ScanVerdicts({ t, scan }: { t: TFunc; scan: ScanState }) {
  if (scan === undefined) return <small style={{ color: MUTED }}>{t("scan.checking")}</small>;
  if (scan === "unavailable") return <small style={{ color: MUTED }}>{t("scan.unavailable")}</small>;
  if (scan === null) return <small style={{ color: colors.danger }}>{t("scan.notScanned")}</small>;
  if (scan.unverifiedMatch) return <strong style={{ color: COLORS.incomplete }}>{t("scan.unverifiedDetail")}</strong>;
  const scanners = scannersOf(scan);
  return (
    <>
      {scanners.map((scanner) => (
        <div
          key={scanner.name}
          className={`deckyhub-scan-${scanner.name.toLowerCase()}`}
          style={{ display: "grid", gap: 2 }}
        >
          <Row
            color={scanner.verdict ? COLORS[scanner.verdict.result] : colors.danger}
            label={line(t, scanner)}
            when={scanner.verdict?.scannedAt ? timeAgo(Date.parse(scanner.verdict.scannedAt)) : undefined}
          />
          {scanner.verdict?.reason && (
            <small style={{ color: MUTED, overflowWrap: "anywhere" }}>{scanner.verdict.reason}</small>
          )}
        </div>
      ))}
      {scanners.some(({ verdict }) => verdict && verdict.result !== "clean") && (
        <small style={{ color: MUTED }}>{t("scan.yourChoice")}</small>
      )}
    </>
  );
}

// VirusTotal's and MetaDefender's lines in the box.
function ExternalRows({
  t,
  virusTotal,
  metaDefender,
}: {
  t: TFunc;
  virusTotal: VirusTotalReport | null;
  metaDefender: MetaDefenderReport;
}) {
  return (
    <>
      {virusTotal &&
        (virusTotal.state === "complete" ? (
          <Row
            color={virusTotal.flagged ? COLORS.infected : COLORS.clean}
            label={t("scan.virusTotalResult", { flagged: virusTotal.flagged, total: virusTotal.total })}
            when={virusTotal.scannedAt !== undefined ? timeAgo(virusTotal.scannedAt * 1000) : undefined}
          />
        ) : (
          <VirusTotalResult t={t} report={virusTotal} />
        ))}
      {metaDefender &&
        (metaDefender.state === "complete" ? (
          <Row
            color={metaDefender.flagged ? COLORS.infected : COLORS.clean}
            label={t("scan.metaDefenderResult", { flagged: metaDefender.flagged, total: metaDefender.total })}
          />
        ) : (
          <MetaDefenderPending t={t} state={metaDefender.state} />
        ))}
    </>
  );
}

// The box's accent: the worst thing any scanner said, grey while nothing has a verdict.
function accentOf(report: VirusScan | null, virusTotal: VirusTotalReport | null, metaDefender: MetaDefenderReport) {
  const verdicts = report && !report.unverifiedMatch ? scannersOf(report).map(({ verdict }) => verdict?.result) : [];
  const external = [virusTotal, metaDefender].flatMap((found) =>
    found?.state === "complete" ? [found.flagged > 0] : [],
  );
  const accents = { infected: COLORS.infected, clean: COLORS.clean, partial: COLORS.incomplete, none: MUTED };
  return accents[scanAccent({ verdicts, external, hasReport: report !== null })];
}

// The report and the ZIP's link buttons: View report, Copy Link and Scan Link.
function ScanButtons({
  t,
  asset,
  report,
  virusTotal,
  metaDefender,
  sha256,
  showExternalActions,
  showZipActions,
  closeModal,
}: {
  t: TFunc;
  asset: Asset;
  report: VirusScan | null;
  virusTotal: VirusTotalReport | null;
  metaDefender: MetaDefenderReport;
  sha256?: string;
  showExternalActions: boolean;
  showZipActions: boolean;
  closeModal?: () => void;
}) {
  const link = asset.url.startsWith("https://") ? asset.url : undefined;
  // The toast says what to do with the link, or gives it to type in when copying failed.
  const copyLink = async (page: Document, then?: string) => {
    if (!link) return;
    const copied = await copyText(link, page);
    toaster.toast({ title: copied ? t("scan.copied") : t("scan.copyFailed"), body: copied ? (then ?? link) : link });
  };
  const scanLink = async (page: Document) => {
    await copyLink(page, t("scan.pasteIntoVirusTotal"));
    closeModal?.();
    openExternalWeb(VIRUSTOTAL_URL_SCAN);
  };
  const half = { ...modalButtonStyle, width: "auto", flex: "1 1 auto" };
  const hasReport = report || virusTotal || metaDefender || (showExternalActions && sha256);
  if (!hasReport && !(showZipActions && link)) return null;
  return (
    <Focusable flow-children="right" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {hasReport && (
        <Button
          style={half}
          onClick={() =>
            showModal(
              <ScanReportModal
                t={t}
                asset={asset}
                scan={report}
                virusTotal={virusTotal}
                metaDefender={metaDefender}
                showExternalGuidance={showZipActions}
                showExternalActions={showExternalActions}
                closeParent={closeModal}
              />,
            )
          }
        >
          {t("scan.viewReport")}
        </Button>
      )}
      {showZipActions && link && (
        <Button style={half} onClick={(event) => void copyLink(pageOf(event))}>
          <FaCopy /> {t("scan.copyLink")}
        </Button>
      )}
      {showZipActions && link && (
        <Button style={half} onClick={(event) => void scanLink(pageOf(event))}>
          <FaExternalLinkAlt /> {t("scan.scanLink")}
        </Button>
      )}
    </Focusable>
  );
}

// The Manage window's virus scan box: what ClamAV and YARA made of the ZIP the window
// would install, from the registry's scans.json. A ZIP not scanned yet says so; it's never
// shown as clean. It informs, never blocks: whether to install stays the user's call.
// VirusTotal looks the ZIP up by its SHA-256 in Steam's browser (closeModal first, or the
// browser opens underneath the window). Copy Link puts the ZIP's download link on the
// clipboard, and Scan Link does that too, then opens VirusTotal's URL scan page to paste
// it into. `note` adds a line under it (DeckyHub's own
// release checks).
export function VirusScanReport({
  t,
  asset,
  version,
  note,
  closeModal,
  showExternalActions = true,
  showZipActions = showExternalActions,
}: {
  t: TFunc;
  asset?: Asset;
  // The release the scanned ZIP belongs to, shown beside the title.
  version?: string;
  note?: string;
  closeModal?: () => void;
  showExternalActions?: boolean;
  showZipActions?: boolean;
}) {
  const { scan, virusTotal, metaDefender } = useScanResults(asset);
  const report = typeof scan === "object" ? scan : null;
  const audit = independentAuditOf(report);
  useExpandOnAttention(scan, report, virusTotal, metaDefender);
  if (!asset) return null;
  const sha256 = [asset.sha256, report?.unverifiedMatch ? undefined : report?.sha256].find(
    (hash) => hash && /^[0-9a-f]{64}$/i.test(hash),
  );
  return (
    <div
      className="deckyhub-virus-scan"
      onFocus={keepInView}
      style={{
        display: "grid",
        gap: 6,
        padding: "8px 12px",
        background: "rgba(0, 0, 0, 0.2)",
        borderRadius: 10,
        borderLeft: `4px solid ${accentOf(report, virusTotal, metaDefender)}`,
      }}
    >
      <h3 style={sectionTitleStyle}>
        {t("scan.title")}
        {version && (
          <span style={{ marginLeft: 10, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
            {displayVersion(version)}
          </span>
        )}
      </h3>
      {audit?.source && audit.source.findings.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: 4,
            padding: "8px 10px",
            border: `1px solid ${colors.danger}`,
            borderRadius: 8,
          }}
        >
          <WarningBadge t={t} warning="not-in-source" />
          <strong style={{ color: colors.danger }}>{t("appcard.warning.not-in-source.hint")}</strong>
        </div>
      )}
      <ScanVerdicts t={t} scan={scan} />
      <small style={{ color: MUTED }}>
        {t("audit.title")}: {audit ? t(`audit.${audit.result}`) : t("scan.unavailable")}
      </small>
      <ExternalRows t={t} virusTotal={virusTotal} metaDefender={metaDefender} />
      {report && <small style={{ color: COLORS.incomplete }}>{t("scan.safetyWarning")}</small>}
      <ScanButtons
        {...{ t, asset, report, virusTotal, metaDefender, sha256, showExternalActions, showZipActions, closeModal }}
      />
      {note && <small style={{ color: MUTED }}>{note}</small>}
    </div>
  );
}
