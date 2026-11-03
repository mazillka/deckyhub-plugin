import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, ConfirmModal, Focusable, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaCopy, FaExternalLinkAlt, FaShieldAlt } from "react-icons/fa";
import { openExternalWeb } from "../external";
import type { TFunc } from "../i18n/en";
import { virusTotalReportOf } from "../releases";
import type { Asset, ScanVerdict, VirusScan } from "../types";
import { copyText, modalButtonStyle, timeAgo, virusScanOf } from "../utils";
import { sectionTitleStyle } from "./DetailsWindow";
import { keepInView } from "./KeepInView";

const COLORS: Record<ScanVerdict["result"], string> = { clean: "#6bcb6b", infected: "#ff6b6b", incomplete: "#ffb35c", error: "#ffb35c" };
const MUTED = "#9fb0bf";

// The two scanners in scans.json: ClamAV at the top of a ZIP's line, YARA under yara.
type Scanner = { name: string; verdict?: ScanVerdict };
const scannersOf = (scan: VirusScan): Scanner[] => [
  { name: "ClamAV", verdict: scan },
  { name: "YARA", verdict: scan.yara },
];

// ClamAV's incomplete means a size limit; YARA's says which files it couldn't open (reason).
const summary = (t: TFunc, name: string, verdict: ScanVerdict) =>
  verdict.result === "infected" ? t("scan.infected", { names: (verdict.found ?? []).join(", ") }) : verdict.result === "incomplete" && name === "YARA" ? t("scan.partly") : t(`scan.${verdict.result}`);

const line = (t: TFunc, { name, verdict }: Scanner) => t("scan.verdict", { scanner: name, verdict: verdict ? summary(t, name, verdict) : t("scan.pending") });

// VirusTotal's page for a file, found by its SHA-256. Nothing is uploaded: VirusTotal
// only has a result if someone sent it the same file before, else it says it's unknown.
const virusTotalUrl = (sha256: string) => `https://www.virustotal.com/gui/file/${sha256.toLowerCase()}`;
// VirusTotal's URL scan page. It can't be handed the link, so Scan Link copies it first
// and the user pastes it there.
const VIRUSTOTAL_URL_SCAN = "https://www.virustotal.com/gui/home/url";
// The document a button press came from (Steam's main window for a Manage window).
const pageOf = (event?: { currentTarget?: EventTarget | null }) => (event?.currentTarget as Node | null | undefined)?.ownerDocument ?? document;

// The full report for one ZIP, in its own window over the Manage window.
type VirusTotalReport = NonNullable<Awaited<ReturnType<typeof virusTotalReportOf>>>;

function VirusTotalResult({ t, report }: { t: TFunc; report: VirusTotalReport }) {
  if (report.state !== "complete") {
    const verdict = report.state === "pending" ? t("scan.waiting") : report.state === "unsupported" ? t("scan.unsupported") : report.state === "unavailable" ? t("scan.unavailable") : t("scan.error");
    return <small style={{ color: MUTED }}>{t("scan.verdict", { scanner: "VirusTotal", verdict })}</small>;
  }
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <strong style={{ color: report.flagged ? COLORS.infected : COLORS.clean }}>
        {t("scan.virusTotalResult", { flagged: report.flagged, total: report.total })}
      </strong>
      {report.scannedAt !== undefined && <small style={{ color: MUTED }}>
        {t("scan.scannedAt", { date: new Date(report.scannedAt * 1000).toLocaleString() })}
      </small>}
    </div>
  );
}

const showScanReport = (t: TFunc, asset: Asset, scan: VirusScan | null | undefined, virusTotal: VirusTotalReport | null, showExternalGuidance: boolean) => {
  const hash = virusTotal ? asset.sha256 : scan?.sha256;
  return showModal(
    <ConfirmModal
      bAlertDialog
      strTitle={t("scan.reportTitle")}
      strDescription={
        <div style={{ display: "grid", gap: 6, overflowWrap: "anywhere" }}>
          {scan?.unverifiedMatch && <strong style={{ color: COLORS.incomplete }}>{t("scan.unverifiedDetail")}</strong>}
          {scan && scannersOf(scan).map((scanner) => {
            const { name, verdict } = scanner;
            return (
              <div key={name} style={{ display: "grid", gap: 4 }}>
                <strong style={{ color: verdict ? COLORS[verdict.result] : MUTED }}>{line(t, scanner)}</strong>
                {verdict?.result === "incomplete" && verdict.found?.length ? <span>{t("scan.found", { names: verdict.found.join(", ") })}</span> : null}
                {verdict?.reason && <span>{t("scan.reason", { reason: verdict.reason })}</span>}
                {verdict?.engine && <span>{name === "YARA" ? t("scan.rules", { engine: verdict.engine, rules: verdict.signatures || "—" }) : t("scan.engine", { engine: verdict.engine, signatures: verdict.signatures || "—" })}</span>}
                {verdict?.scannedAt && <span>{t("scan.scannedAt", { date: new Date(verdict.scannedAt).toLocaleString() })}</span>}
              </div>
            );
          })}
          <span>{t("scan.file", { file: asset.name })}</span>
          {hash && <span>{t("scan.sha256", { hash })}</span>}
          {virusTotal && <VirusTotalResult t={t} report={virusTotal} />}
          {scan && scannersOf(scan).some(({ verdict }) => verdict && verdict.result !== "clean") && <span>{t("scan.yourChoice")}</span>}
          <small style={{ color: MUTED }}>{t("scan.hint")}</small>
          {showExternalGuidance && <small style={{ color: MUTED }}>{t("scan.virusTotalHint")}</small>}
          {showExternalGuidance && <small style={{ color: MUTED }}>{t("scan.scanLinkHint")}</small>}
        </div>
      }
    />,
  );
};

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
  note,
  closeModal,
  showExternalActions = true,
  showZipActions = showExternalActions,
}: {
  t: TFunc;
  asset?: Asset;
  note?: string;
  closeModal?: () => void;
  showExternalActions?: boolean;
  showZipActions?: boolean;
}) {
  const [scan, setScan] = useState<VirusScan | "unavailable" | null | undefined>(undefined);
  const [virusTotal, setVirusTotal] = useState<VirusTotalReport | null>(null);
  useEffect(() => {
    let current = true;
    setScan(undefined);
    setVirusTotal(null);
    if (!asset) return;
    virusScanOf(asset).then(
      (found) => current && setScan(found),
      () => current && setScan("unavailable"),
    );
    virusTotalReportOf(asset).then(
      (found) => current && setVirusTotal(found),
      () => current && setVirusTotal(null),
    );
    return () => {
      current = false;
    };
  }, [asset?.url, asset?.sha256]);
  if (!asset) return null;
  const report = typeof scan === "object" ? scan : null;
  const sha256 = [asset.sha256, report?.unverifiedMatch ? undefined : report?.sha256].find((hash) => hash && /^[0-9a-f]{64}$/i.test(hash));
  const openVirusTotal = () => {
    if (!sha256) return;
    closeModal?.();
    openExternalWeb(virusTotalUrl(sha256));
  };
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
  return (
    <div className="deckyhub-virus-scan" onFocus={keepInView} style={{ display: "grid", gap: 6, padding: "8px 12px", background: "rgba(0, 0, 0, 0.2)", borderRadius: 10 }}>
      <h3 style={sectionTitleStyle}>{t("scan.title")}</h3>
      {scan === undefined ? (
        <small style={{ color: MUTED }}>{t("scan.checking")}</small>
      ) : scan === "unavailable" ? (
        <small style={{ color: MUTED }}>{t("scan.unavailable")}</small>
      ) : scan === null ? (
        <small style={{ color: MUTED }}>{t("scan.notScanned")}</small>
      ) : (
        <>
          {scan.unverifiedMatch && <strong style={{ color: COLORS.incomplete }}>{t("scan.unverifiedDetail")}</strong>}
          {!scan.unverifiedMatch && scannersOf(scan).map((scanner) => (
            <div key={scanner.name} className={`deckyhub-scan-${scanner.name.toLowerCase()}`} style={{ display: "grid", gap: 2 }}>
              <span style={{ color: scanner.verdict ? COLORS[scanner.verdict.result] : MUTED, fontWeight: 600, overflowWrap: "anywhere" }}>
                <FaShieldAlt /> {line(t, scanner)}
              </span>
              {scanner.verdict?.reason && <small style={{ color: MUTED, overflowWrap: "anywhere" }}>{scanner.verdict.reason}</small>}
              {scanner.verdict?.scannedAt && <small style={{ color: MUTED }}>{t("scan.scannedWhen", { when: timeAgo(Date.parse(scanner.verdict.scannedAt)) })}</small>}
            </div>
          ))}
          {!scan.unverifiedMatch && scannersOf(scan).some(({ verdict }) => verdict && verdict.result !== "clean") && <small style={{ color: MUTED }}>{t("scan.yourChoice")}</small>}
        </>
      )}
      {virusTotal && <VirusTotalResult t={t} report={virusTotal} />}
      {(report || virusTotal || (showExternalActions && sha256) || (showZipActions && link)) && (
        <Focusable flow-children="right" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(report || virusTotal) && (
            <Button style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }} onClick={() => showScanReport(t, asset, report, virusTotal, showZipActions)}>
              {t("scan.viewReport")}
            </Button>
          )}
          {showExternalActions && sha256 && (
            <Button style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }} onClick={openVirusTotal}>
              <FaExternalLinkAlt /> VirusTotal
            </Button>
          )}
          {showZipActions && link && (
            <Button style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }} onClick={(event) => void copyLink(pageOf(event))}>
              <FaCopy /> {t("scan.copyLink")}
            </Button>
          )}
          {showZipActions && link && (
            <Button style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }} onClick={(event) => void scanLink(pageOf(event))}>
              <FaExternalLinkAlt /> {t("scan.scanLink")}
            </Button>
          )}
        </Focusable>
      )}
      {note && <small style={{ color: MUTED }}>{note}</small>}
    </div>
  );
}
