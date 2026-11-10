import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Focusable, showModal } from "@decky/ui";
import { WideConfirmModal } from "./WideModal";
import { useEffect, useState } from "react";
import { FaCopy, FaExternalLinkAlt, FaShieldAlt } from "react-icons/fa";
import { openExternalWeb } from "../external";
import type { TFunc } from "../i18n/en";
import { metaDefenderReportOf, virusTotalReportOf } from "../releases";
import type { Asset, ScanVerdict, VirusScan } from "../types";
import { displayVersion } from "../version";
import { copyText, modalButtonStyle, timeAgo, virusScanOf } from "../utils";
import { sectionTitleStyle } from "./DetailsWindow";
import { keepInView } from "./KeepInView";
import { colors } from "../styles";

const COLORS: Record<ScanVerdict["result"], string> = {
  clean: colors.success,
  infected: colors.danger,
  incomplete: colors.caution,
  error: colors.caution,
};
const MUTED = colors.dim;

// The two scanners in scans.json: ClamAV at the top of a ZIP's line, YARA under yara.
type Scanner = { name: string; verdict?: ScanVerdict };
const scannersOf = (scan: VirusScan): Scanner[] => [
  { name: "ClamAV", verdict: scan },
  { name: "YARA", verdict: scan.yara },
];

// ClamAV's incomplete means a size limit; YARA's says which files it couldn't open (reason).
const summary = (t: TFunc, name: string, verdict: ScanVerdict) =>
  verdict.result === "infected"
    ? t("scan.infected", { names: (verdict.found ?? []).join(", ") })
    : verdict.result === "incomplete" && name === "YARA"
      ? t("scan.partly")
      : t(`scan.${verdict.result}`);

const line = (t: TFunc, { name, verdict }: Scanner) =>
  t("scan.verdict", { scanner: name, verdict: verdict ? summary(t, name, verdict) : t("scan.pending") });

// VirusTotal's page for a file, found by its SHA-256. The app uploads nothing; the registry sends
// VirusTotal the ZIPs it hasn't seen, so until it has, the page says the file is unknown.
const virusTotalUrl = (sha256: string) => `https://www.virustotal.com/gui/file/${sha256.toLowerCase()}`;
// VirusTotal's URL scan page. It can't be handed the link, so Scan Link copies it first
// and the user pastes it there.
const VIRUSTOTAL_URL_SCAN = "https://www.virustotal.com/gui/home/url";
// The document a button press came from (Steam's main window for a Manage window).
const pageOf = (event?: { currentTarget?: EventTarget | null }) =>
  (event?.currentTarget as Node | null | undefined)?.ownerDocument ?? document;

// One scanner's line in the Manage window's box: shield and verdict on the left, when it
// ran on the right, wrapping under it on a narrow window.
function Row({ color, label, when, className }: { color: string; label: string; when?: string; className?: string }) {
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

// The full report for one ZIP, in its own window over the Manage window.
type VirusTotalReport = NonNullable<Awaited<ReturnType<typeof virusTotalReportOf>>>;

function VirusTotalResult({ t, report }: { t: TFunc; report: VirusTotalReport }) {
  if (report.state !== "complete") {
    const verdict =
      report.state === "none"
        ? t("scan.pending")
        : report.state === "pending"
          ? t("scan.waiting")
          : report.state === "unsupported"
            ? t("scan.unsupported")
            : report.state === "unavailable"
              ? t("scan.unavailable")
              : t("scan.error");
    const color = report.state === "pending" || report.state === "none" ? colors.danger : MUTED;
    return <small style={{ color }}>{t("scan.verdict", { scanner: "VirusTotal", verdict })}</small>;
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

const MetaDefenderPending = ({ t, state }: { t: TFunc; state: "none" | "pending" | "error" | "unavailable" }) => (
  <small style={{ color: state === "pending" || state === "none" ? colors.danger : MUTED }}>
    {t("scan.verdict", {
      scanner: "MetaDefender",
      verdict: t(
        (
          {
            none: "scan.pending",
            pending: "scan.waiting",
            error: "scan.error",
            unavailable: "scan.unavailable",
          } as const
        )[state],
      ),
    })}
  </small>
);

function ScanReportModal({
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
  metaDefender: Awaited<ReturnType<typeof metaDefenderReportOf>>;
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
            <Focusable onActivate={() => {}} onFocus={keepInView}>
              <strong style={{ color: COLORS.incomplete }}>{t("scan.unverifiedDetail")}</strong>
            </Focusable>
          )}
          {scan &&
            scannersOf(scan).map((scanner) => {
              const { name, verdict } = scanner;
              return (
                <Focusable key={name} flow-children="down" style={{ display: "grid", gap: 4 }}>
                  <Focusable onActivate={() => {}} onFocus={keepInView}>
                    <strong style={{ color: verdict ? COLORS[verdict.result] : colors.danger }}>
                      <FaShieldAlt /> {line(t, scanner)}
                    </strong>
                  </Focusable>
                  {verdict?.result === "incomplete" && verdict.found?.length ? (
                    <Focusable onActivate={() => {}} onFocus={keepInView}>
                      {t("scan.found", { names: verdict.found.join(", ") })}
                    </Focusable>
                  ) : null}
                  {verdict?.reason && (
                    <Focusable onActivate={() => {}} onFocus={keepInView}>
                      {t("scan.reason", { reason: verdict.reason })}
                    </Focusable>
                  )}
                  {verdict?.engine && (
                    <Focusable onActivate={() => {}} onFocus={keepInView}>
                      {name === "YARA"
                        ? t("scan.rules", { engine: verdict.engine, rules: verdict.signatures || "—" })
                        : t("scan.engine", { engine: verdict.engine, signatures: verdict.signatures || "—" })}
                    </Focusable>
                  )}
                  {verdict?.scannedAt && (
                    <Focusable onActivate={() => {}} onFocus={keepInView}>
                      {t("scan.scannedAt", { date: new Date(verdict.scannedAt).toLocaleString() })}
                    </Focusable>
                  )}
                </Focusable>
              );
            })}
          <Focusable onActivate={() => {}} onFocus={keepInView}>
            {t("scan.file", { file: asset.name })}
          </Focusable>
          {hash && (
            <Focusable onActivate={() => {}} onFocus={keepInView}>
              <small style={{ fontFamily: "monospace", color: MUTED }}>{t("scan.sha256", { hash })}</small>
            </Focusable>
          )}
          {virusTotal && (
            <Focusable onActivate={() => {}} onFocus={keepInView}>
              <VirusTotalResult t={t} report={virusTotal} />
            </Focusable>
          )}
          {metaDefender && (
            <Focusable onActivate={() => {}} onFocus={keepInView}>
              {metaDefender.state === "complete" ? (
                <strong style={{ color: metaDefender.flagged ? COLORS.infected : COLORS.clean }}>
                  <FaShieldAlt />{" "}
                  {t("scan.metaDefenderResult", { flagged: metaDefender.flagged, total: metaDefender.total })}
                </strong>
              ) : (
                <MetaDefenderPending t={t} state={metaDefender.state} />
              )}
            </Focusable>
          )}
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
            <Focusable onActivate={() => {}} onFocus={keepInView}>
              {t("scan.yourChoice")}
            </Focusable>
          )}
          <Focusable onActivate={() => {}} onFocus={keepInView}>
            <small style={{ color: MUTED }}>{t("scan.hint")}</small>
          </Focusable>
          <Focusable onActivate={() => {}} onFocus={keepInView}>
            <strong style={{ color: COLORS.infected }}>{t("scan.safetyWarning")}</strong>
          </Focusable>
          {showExternalGuidance && (
            <Focusable onActivate={() => {}} onFocus={keepInView}>
              <small style={{ color: MUTED }}>{t("scan.virusTotalHint")}</small>
            </Focusable>
          )}
          {showExternalGuidance && (
            <Focusable onActivate={() => {}} onFocus={keepInView}>
              <small style={{ color: MUTED }}>{t("scan.scanLinkHint")}</small>
            </Focusable>
          )}
        </Focusable>
      }
    />
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
  const [scan, setScan] = useState<VirusScan | "unavailable" | null | undefined>(undefined);
  const [virusTotal, setVirusTotal] = useState<VirusTotalReport | null>(null);
  const [metaDefender, setMetaDefender] = useState<Awaited<ReturnType<typeof metaDefenderReportOf>>>(null);
  useEffect(() => {
    let current = true;
    setScan(undefined);
    setVirusTotal(null);
    setMetaDefender(null);
    if (!asset) return;
    virusScanOf(asset).then(
      (found) => current && setScan(found),
      () => current && setScan("unavailable"),
    );
    virusTotalReportOf(asset).then(
      (found) => current && setVirusTotal(found),
      () => current && setVirusTotal(null),
    );
    metaDefenderReportOf(asset).then(
      (found) => current && setMetaDefender(found),
      () => current && setMetaDefender(null),
    );
    return () => {
      current = false;
    };
  }, [asset?.url, asset?.sha256]);
  if (!asset) return null;
  const report = typeof scan === "object" ? scan : null;
  const sha256 = [asset.sha256, report?.unverifiedMatch ? undefined : report?.sha256].find(
    (hash) => hash && /^[0-9a-f]{64}$/i.test(hash),
  );
  const link = asset.url.startsWith("https://") ? asset.url : undefined;
  // The box's accent: the worst thing any scanner said, grey while nothing has a verdict.
  const verdicts = report && !report.unverifiedMatch ? scannersOf(report).map(({ verdict }) => verdict?.result) : [];
  const flagged = verdicts.includes("infected") || !!virusTotal?.flagged || !!metaDefender?.flagged;
  const accent = flagged
    ? COLORS.infected
    : verdicts.length > 0 && verdicts.every((result) => result === "clean")
      ? COLORS.clean
      : verdicts.length > 0 || report?.unverifiedMatch
        ? COLORS.incomplete
        : MUTED;
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
    <div
      className="deckyhub-virus-scan"
      onFocus={keepInView}
      style={{
        display: "grid",
        gap: 6,
        padding: "8px 12px",
        background: "rgba(0, 0, 0, 0.2)",
        borderRadius: 10,
        borderLeft: `4px solid ${accent}`,
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
      {scan === undefined ? (
        <small style={{ color: MUTED }}>{t("scan.checking")}</small>
      ) : scan === "unavailable" ? (
        <small style={{ color: MUTED }}>{t("scan.unavailable")}</small>
      ) : scan === null ? (
        <small style={{ color: colors.danger }}>{t("scan.notScanned")}</small>
      ) : (
        <>
          {scan.unverifiedMatch && <strong style={{ color: COLORS.incomplete }}>{t("scan.unverifiedDetail")}</strong>}
          {!scan.unverifiedMatch &&
            scannersOf(scan).map((scanner) => (
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
          {!scan.unverifiedMatch && scannersOf(scan).some(({ verdict }) => verdict && verdict.result !== "clean") && (
            <small style={{ color: MUTED }}>{t("scan.yourChoice")}</small>
          )}
        </>
      )}
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
      {report && <small style={{ color: COLORS.incomplete }}>{t("scan.safetyWarning")}</small>}
      {(report || virusTotal || metaDefender || (showExternalActions && sha256) || (showZipActions && link)) && (
        <Focusable flow-children="right" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(report || virusTotal || metaDefender || (showExternalActions && sha256)) && (
            <Button
              style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }}
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
            <Button
              style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }}
              onClick={(event) => void copyLink(pageOf(event))}
            >
              <FaCopy /> {t("scan.copyLink")}
            </Button>
          )}
          {showZipActions && link && (
            <Button
              style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }}
              onClick={(event) => void scanLink(pageOf(event))}
            >
              <FaExternalLinkAlt /> {t("scan.scanLink")}
            </Button>
          )}
        </Focusable>
      )}
      {note && <small style={{ color: MUTED }}>{note}</small>}
    </div>
  );
}
