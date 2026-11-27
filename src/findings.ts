// What the audit, the virus scans and the registry say about a release, as a list of facts for the
// user to weigh. DeckyHub gives no verdict and no score: the decision to install is the user's.
// Pure, so it's unit-tested (tests/findings.test.ts); labels and hints are message keys the
// caller translates.

import type { App, VirusScan } from "./types";

export type FindingsInput = {
  // Audit warning IDs for the release (installWarnings), already limited to known ones.
  warnings: string[];
  // The independent audit found the ZIP's code doesn't match its repository.
  sourceMismatch: boolean;
  // The worse of the scanners' verdicts (scanSummary), null while the ZIP has no report.
  scan: "clean" | "infected" | "partial" | null;
  root: boolean;
  prereleaseOnly: boolean;
  // No release in a year.
  stale: boolean;
};

// label: the message key for the fact; hint: the key that explains it, if there is one.
// tone only picks the colour the matching badge already uses.
export type Finding = { label: string; hint?: string; tone: "danger" | "caution" };

// The warnings whose badges are red.
const RED = ["blocked", "not-in-source"];

export function collectFindings(input: FindingsInput): { findings: Finding[]; scanned: boolean } {
  const findings: Finding[] = [];
  const add = (tone: Finding["tone"], label: string, hint?: string) => findings.push({ tone, label, hint });
  for (const warning of input.warnings)
    add(RED.includes(warning) ? "danger" : "caution", `appcard.warning.${warning}`, `appcard.warning.${warning}.hint`);
  if (input.sourceMismatch && !input.warnings.includes("not-in-source"))
    add("danger", "appcard.warning.not-in-source", "appcard.warning.not-in-source.hint");
  if (input.scan === "infected") add("danger", "appcard.scan.infected", "appcard.scan.infected.hint");
  if (input.scan === "partial") add("caution", "appcard.scan.partial", "appcard.scan.partial.hint");
  if (input.root) add("caution", "appcard.runsAsRoot", "appcard.runsAsRootHint");
  if (input.prereleaseOnly) add("caution", "appcard.prereleaseOnly", "appcard.prereleaseOnlyHint");
  if (input.stale) add("caution", "appcard.noReleaseInYear");
  return { findings, scanned: input.scan !== null };
}

// The colour of the virus scan box (the Manage window and the install confirmation), by the same rule as the scan
// badge: infected if any scanner flagged the ZIP; clean only once all four (ClamAV, YARA, VirusTotal, MetaDefender)
// have reported and none flagged it, so two clean reports out of four never paint it green; partial for anything
// in between; none while nothing has a verdict.
export type ScanAccent = "infected" | "clean" | "partial" | "none";
export function scanAccent(input: {
  // ClamAV's and YARA's results, undefined for a scanner with no verdict.
  verdicts: (string | undefined)[];
  // One entry per finished VirusTotal or MetaDefender report: whether it flagged the ZIP.
  external: boolean[];
  // A report for the ZIP exists, even one without a usable verdict.
  hasReport: boolean;
}): ScanAccent {
  const results = [
    ...input.verdicts.filter((result): result is string => result !== undefined),
    ...input.external.map((flagged) => (flagged ? "infected" : "clean")),
  ];
  if (results.includes("infected")) return "infected";
  if (results.length >= 4 && results.every((result) => result === "clean")) return "clean";
  return results.length > 0 || input.hasReport ? "partial" : "none";
}

// ClamAV, YARA, VirusTotal and MetaDefender.
const SCANNERS = 4;
export type ScanBadgeKind = "clean" | "infected" | "partial";

// The scan badge of a release: its verdict by scanAccent's rule (Nothing flagged only once all four scanners have
// reported and none flagged it), and how many of the four reported finding nothing.
export const scanSummary = (scan: VirusScan, virusTotal?: App["virusTotal"], metaDefender?: App["metaDefender"]) => {
  const verdicts: (string | undefined)[] = [scan.result ?? undefined, scan.yara?.result ?? undefined];
  const external = [virusTotal, metaDefender].flatMap((report) =>
    report?.state === "complete" && report.flagged !== undefined ? [report.flagged > 0] : [],
  );
  const passed = verdicts.filter((result) => result === "clean").length + external.filter((flagged) => !flagged).length;
  const accent = scanAccent({ verdicts, external, hasReport: true });
  const kind: ScanBadgeKind = accent === "none" ? "partial" : accent;
  return { kind, count: `${passed}/${SCANNERS}` };
};
