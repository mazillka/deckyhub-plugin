import { DialogButtonPrimary as Button, ConfirmModal, Focusable, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaExternalLinkAlt, FaShieldAlt } from "react-icons/fa";
import { openExternalWeb } from "../external";
import type { TFunc } from "../i18n/en";
import type { Asset, ScanVerdict, VirusScan } from "../types";
import { modalButtonStyle, timeAgo, virusScanOf } from "../utils";
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

// The full report for one ZIP, in its own window over the Manage window.
const showScanReport = (t: TFunc, asset: Asset, scan: VirusScan) =>
  showModal(
    <ConfirmModal
      bAlertDialog
      strTitle={t("scan.reportTitle")}
      strDescription={
        <div style={{ display: "grid", gap: 6, overflowWrap: "anywhere" }}>
          {scannersOf(scan).map((scanner) => {
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
          {scan.sha256 && <span>{t("scan.sha256", { hash: scan.sha256 })}</span>}
          {scannersOf(scan).some(({ verdict }) => verdict && verdict.result !== "clean") && <span>{t("scan.yourChoice")}</span>}
          <small style={{ color: MUTED }}>{t("scan.hint")}</small>
          <small style={{ color: MUTED }}>{t("scan.virusTotalHint")}</small>
        </div>
      }
    />,
  );

// The Manage window's virus scan box: what ClamAV and YARA made of the ZIP the window
// would install, from the registry's scans.json. A ZIP not scanned yet says so; it's never
// shown as clean. It informs, never blocks: whether to install stays the user's call.
// VirusTotal looks the ZIP up by its SHA-256 in Steam's browser (closeModal first, or the
// browser opens underneath the window). `note` adds a line under it (DeckyHub's own
// release checks).
export function VirusScanReport({ t, asset, note, closeModal }: { t: TFunc; asset?: Asset; note?: string; closeModal?: () => void }) {
  const [scan, setScan] = useState<VirusScan | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    setScan(undefined);
    if (!asset) return;
    virusScanOf(asset).then(
      (found) => current && setScan(found),
      () => current && setScan(null),
    );
    return () => {
      current = false;
    };
  }, [asset?.url, asset?.sha256]);
  if (!asset) return null;
  const sha256 = [asset.sha256, scan?.sha256].find((hash) => hash && /^[0-9a-f]{64}$/i.test(hash));
  const openVirusTotal = () => {
    if (!sha256) return;
    closeModal?.();
    openExternalWeb(virusTotalUrl(sha256));
  };
  return (
    <div className="deckyhub-virus-scan" onFocus={keepInView} style={{ display: "grid", gap: 6, padding: "8px 12px", background: "rgba(0, 0, 0, 0.2)", borderRadius: 10 }}>
      <h3 style={sectionTitleStyle}>{t("scan.title")}</h3>
      {scan === undefined ? (
        <small style={{ color: MUTED }}>{t("scan.checking")}</small>
      ) : scan === null ? (
        <small style={{ color: MUTED }}>{t("scan.notScanned")}</small>
      ) : (
        <>
          {scannersOf(scan).map((scanner) => (
            <div key={scanner.name} className={`deckyhub-scan-${scanner.name.toLowerCase()}`} style={{ display: "grid", gap: 2 }}>
              <span style={{ color: scanner.verdict ? COLORS[scanner.verdict.result] : MUTED, fontWeight: 600, overflowWrap: "anywhere" }}>
                <FaShieldAlt /> {line(t, scanner)}
              </span>
              {scanner.verdict?.reason && <small style={{ color: MUTED, overflowWrap: "anywhere" }}>{scanner.verdict.reason}</small>}
              {scanner.verdict?.scannedAt && <small style={{ color: MUTED }}>{t("scan.scannedWhen", { when: timeAgo(Date.parse(scanner.verdict.scannedAt)) })}</small>}
            </div>
          ))}
          {scannersOf(scan).some(({ verdict }) => verdict && verdict.result !== "clean") && <small style={{ color: MUTED }}>{t("scan.yourChoice")}</small>}
        </>
      )}
      {(scan || sha256) && (
        <Focusable flow-children="right" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {scan && (
            <Button style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }} onClick={() => showScanReport(t, asset, scan)}>
              {t("scan.viewReport")}
            </Button>
          )}
          {sha256 && (
            <Button style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }} onClick={openVirusTotal}>
              <FaExternalLinkAlt /> VirusTotal
            </Button>
          )}
        </Focusable>
      )}
      {note && <small style={{ color: MUTED }}>{note}</small>}
    </div>
  );
}
