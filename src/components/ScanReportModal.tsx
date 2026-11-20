import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import { FaExternalLinkAlt, FaShieldAlt } from "react-icons/fa";
import { openExternalWeb } from "../external";
import { independentAuditOf } from "../independentAudit";
import type { TFunc } from "../i18n/en";
import type { Asset, VirusScan } from "../types";
import {
  COLORS,
  line,
  MetaDefenderPending,
  MUTED,
  scannersOf,
  Stop,
  VirusTotalResult,
  type MetaDefenderReport,
  type Scanner,
  type VirusTotalReport,
} from "./ScanParts";
import { colors } from "../styles";
import { AuditStops } from "./ScanAuditStops";
import { WideConfirmModal } from "./WideModal";

// VirusTotal's page for a file, found by its SHA-256. The app uploads nothing; the registry sends
// VirusTotal the ZIPs it hasn't seen, so until it has, the page says the file is unknown.
const virusTotalUrl = (sha256: string) => `https://www.virustotal.com/gui/file/${sha256.toLowerCase()}`;

// One scanner's verdict and the details behind it.
function ScannerStops({ t, scanner }: { t: TFunc; scanner: Scanner }) {
  const { name, verdict } = scanner;
  return (
    <Focusable flow-children="down" style={{ display: "grid", gap: 4 }}>
      <Stop>
        <strong style={{ color: verdict ? COLORS[verdict.result] : colors.danger }}>
          <FaShieldAlt /> {line(t, scanner)}
        </strong>
      </Stop>
      {verdict?.result === "incomplete" && verdict.found?.length ? (
        <Stop>{t("scan.found", { names: verdict.found.join(", ") })}</Stop>
      ) : null}
      {verdict?.reason && <Stop>{t("scan.reason", { reason: verdict.reason })}</Stop>}
      {verdict?.engine && (
        <Stop>
          {name === "YARA"
            ? t("scan.rules", { engine: verdict.engine, rules: verdict.signatures || "—" })
            : t("scan.engine", { engine: verdict.engine, signatures: verdict.signatures || "—" })}
        </Stop>
      )}
      {verdict?.scannedAt && <Stop>{t("scan.scannedAt", { date: new Date(verdict.scannedAt).toLocaleString() })}</Stop>}
    </Focusable>
  );
}

// VirusTotal's and MetaDefender's results for the ZIP.
function ExternalStops({
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
      {virusTotal && (
        <Stop>
          <VirusTotalResult t={t} report={virusTotal} />
        </Stop>
      )}
      {metaDefender && (
        <Stop>
          {metaDefender.state === "complete" ? (
            <strong style={{ color: metaDefender.flagged ? COLORS.infected : COLORS.clean }}>
              <FaShieldAlt />{" "}
              {t("scan.metaDefenderResult", { flagged: metaDefender.flagged, total: metaDefender.total })}
            </strong>
          ) : (
            <MetaDefenderPending t={t} state={metaDefender.state} />
          )}
        </Stop>
      )}
    </>
  );
}

// The full report for one ZIP, in its own window over the Manage window.
export function ScanReportModal({
  t,
  asset,
  scan,
  virusTotal,
  metaDefender,
  showExternalGuidance,
  showExternalActions,
  closeParent,
  closeModal,
}: {
  t: TFunc;
  asset: Asset;
  scan: VirusScan | null;
  virusTotal: VirusTotalReport | null;
  metaDefender: MetaDefenderReport;
  showExternalGuidance: boolean;
  showExternalActions: boolean;
  closeParent?: () => void;
  closeModal?: () => void;
}) {
  const hash = [asset.sha256, scan?.unverifiedMatch ? undefined : scan?.sha256].find(
    (value) => value && /^[0-9a-f]{64}$/i.test(value),
  );
  return (
    <WideConfirmModal
      bAlertDialog
      closeModal={closeModal}
      strTitle={t("scan.reportTitle")}
      strDescription={
        <Focusable flow-children="down" style={{ display: "grid", gap: 6, overflowWrap: "anywhere" }}>
          {scan?.unverifiedMatch && (
            <Stop>
              <strong style={{ color: COLORS.incomplete }}>{t("scan.unverifiedDetail")}</strong>
            </Stop>
          )}
          {scan && scannersOf(scan).map((scanner) => <ScannerStops key={scanner.name} t={t} scanner={scanner} />)}
          <AuditStops t={t} audit={independentAuditOf(scan)} />
          <Stop>{t("scan.file", { file: asset.name })}</Stop>
          {hash && (
            <Stop>
              <small style={{ fontFamily: "monospace", color: MUTED }}>{t("scan.sha256", { hash })}</small>
            </Stop>
          )}
          <ExternalStops t={t} virusTotal={virusTotal} metaDefender={metaDefender} />
          {showExternalActions && hash && (
            <Button
              onClick={() => {
                closeModal?.();
                closeParent?.();
                openExternalWeb(virusTotalUrl(hash));
              }}
            >
              <FaExternalLinkAlt /> VirusTotal
            </Button>
          )}
          {scan && scannersOf(scan).some(({ verdict }) => verdict && verdict.result !== "clean") && (
            <Stop>{t("scan.yourChoice")}</Stop>
          )}
          <Stop>
            <small style={{ color: MUTED }}>{t("scan.hint")}</small>
          </Stop>
          <Stop>
            <strong style={{ color: COLORS.infected }}>{t("scan.safetyWarning")}</strong>
          </Stop>
          {showExternalGuidance && (
            <>
              <Stop>
                <small style={{ color: MUTED }}>{t("scan.virusTotalHint")}</small>
              </Stop>
              <Stop>
                <small style={{ color: MUTED }}>{t("scan.scanLinkHint")}</small>
              </Stop>
            </>
          )}
        </Focusable>
      }
    />
  );
}
