import { DialogButtonPrimary as Button, ConfirmModal, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaShieldAlt } from "react-icons/fa";
import type { TFunc } from "../i18n/en";
import type { Asset, VirusScan } from "../types";
import { modalButtonStyle, timeAgo, virusScanOf } from "../utils";
import { sectionTitleStyle } from "./DetailsWindow";
import { keepInView } from "./KeepInView";

const COLORS: Record<VirusScan["result"], string> = { clean: "#6bcb6b", infected: "#ff6b6b", incomplete: "#ffb35c", error: "#ffb35c" };

const summary = (t: TFunc, scan: VirusScan) =>
  scan.result === "infected" ? t("scan.infected", { names: (scan.found ?? []).join(", ") }) : t(`scan.${scan.result}`);

// The full report for one ZIP, in its own window over the Manage window.
const showScanReport = (t: TFunc, asset: Asset, scan: VirusScan) =>
  showModal(
    <ConfirmModal
      bAlertDialog
      strTitle={t("scan.reportTitle")}
      strDescription={
        <div style={{ display: "grid", gap: 6, overflowWrap: "anywhere" }}>
          <strong style={{ color: COLORS[scan.result] }}>{summary(t, scan)}</strong>
          {scan.result === "incomplete" && scan.found?.length ? <span>{t("scan.found", { names: scan.found.join(", ") })}</span> : null}
          <span>{t("scan.file", { file: asset.name })}</span>
          {scan.sha256 && <span>{t("scan.sha256", { hash: scan.sha256 })}</span>}
          {scan.engine && <span>{t("scan.engine", { engine: scan.engine, signatures: scan.signatures || "—" })}</span>}
          {scan.scannedAt && <span>{t("scan.scannedAt", { date: new Date(scan.scannedAt).toLocaleString() })}</span>}
          <small style={{ color: "#9fb0bf" }}>{t("scan.hint")}</small>
        </div>
      }
    />,
  );

// The Manage window's virus scan box: what ClamAV made of the ZIP the window would
// install, from the registry's scans.json. A ZIP it hasn't scanned says so; it's never
// shown as clean. `note` adds a line under it (DeckyHub's own release checks).
export function VirusScanReport({ t, asset, note }: { t: TFunc; asset?: Asset; note?: string }) {
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
  return (
    <div className="deckyhub-virus-scan" onFocus={keepInView} style={{ display: "grid", gap: 6, padding: "8px 12px", background: "rgba(0, 0, 0, 0.2)", borderRadius: 10 }}>
      <h3 style={sectionTitleStyle}>{t("scan.title")}</h3>
      {scan === undefined ? (
        <small style={{ color: "#9fb0bf" }}>{t("scan.checking")}</small>
      ) : scan === null ? (
        <small style={{ color: "#9fb0bf" }}>{t("scan.notScanned")}</small>
      ) : (
        <>
          <span style={{ color: COLORS[scan.result], fontWeight: 600, overflowWrap: "anywhere" }}>
            <FaShieldAlt /> {summary(t, scan)}
          </span>
          {scan.scannedAt && <small style={{ color: "#9fb0bf" }}>{t("scan.byClamAV", { when: timeAgo(Date.parse(scan.scannedAt)) })}</small>}
          <Button style={modalButtonStyle} onClick={() => showScanReport(t, asset, scan)}>
            {t("scan.viewReport")}
          </Button>
        </>
      )}
      {note && <small style={{ color: "#9fb0bf" }}>{note}</small>}
    </div>
  );
}
