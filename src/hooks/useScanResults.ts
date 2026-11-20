import { useContext, useEffect, useState } from "react";
import { independentAuditOf } from "../independentAudit";
import type { MetaDefenderReport, VirusTotalReport } from "../components/ScanParts";
import { scannersOf } from "../components/ScanParts";
import { ExpandRowContext } from "../components/DetailsParts";
import { metaDefenderReportOf, virusTotalReportOf } from "../registryData";
import type { Asset, VirusScan } from "../types";
import { virusScanOf } from "../utils";

export type ScanState = VirusScan | "unavailable" | null | undefined;

// Looks the ZIP's scan up in scans.json, and VirusTotal's and MetaDefender's reports for it.
export function useScanResults(asset?: Asset) {
  const [scan, setScan] = useState<ScanState>(undefined);
  const [virusTotal, setVirusTotal] = useState<VirusTotalReport | null>(null);
  const [metaDefender, setMetaDefender] = useState<MetaDefenderReport>(null);
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
  return { scan, virusTotal, metaDefender };
}

// Flags or a scan still pending: opens the Manage window's collapsed row so it isn't missed.
// Waits for the scan to load; a clean, finished scan stays closed.
export function useExpandOnAttention(
  scan: ScanState,
  report: VirusScan | null,
  virusTotal: VirusTotalReport | null,
  metaDefender: MetaDefenderReport,
) {
  const expand = useContext(ExpandRowContext);
  const audit = independentAuditOf(report);
  const needsAttention =
    scan !== undefined &&
    (scan === null ||
      (report !== null &&
        (report.unverifiedMatch ||
          scannersOf(report).some(({ verdict }) => !verdict || verdict.result !== "clean") ||
          (audit?.source?.findings.length ?? 0) > 0)) ||
      [virusTotal, metaDefender].some(
        (found) => found?.state === "pending" || (found?.state === "complete" && found.flagged > 0),
      ));
  useEffect(() => {
    if (needsAttention) expand?.();
  }, [needsAttention]);
}
