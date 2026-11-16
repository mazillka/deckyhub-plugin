// One verdict on a release, from what the registry knows: audit warnings, the virus scans
// and a few facts about the plugin. It informs the decision and never blocks it, and "low"
// means no findings, not safe: nobody reviews these plugins. Pure, so it's unit-tested
// (tests/risk.test.ts); the strings are keys the caller translates.

export type RiskLevel = "high" | "caution" | "low" | "unknown";

export type RiskInput = {
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

// label: the message key for the finding; hint: the key that explains it, if there is one.
export type RiskReason = { label: string; hint?: string; severity: "high" | "caution" };

// An audit warning that is serious by itself, matching the red badges.
const SERIOUS = ["blocked", "not-in-source"];

export function assessRisk(input: RiskInput): { level: RiskLevel; reasons: RiskReason[] } {
  const reasons: RiskReason[] = [];
  const add = (severity: RiskReason["severity"], label: string, hint?: string) =>
    reasons.push({ severity, label, hint });
  for (const warning of input.warnings.filter((key) => SERIOUS.includes(key)))
    add("high", `appcard.warning.${warning}`, `appcard.warning.${warning}.hint`);
  if (input.sourceMismatch && !input.warnings.includes("not-in-source"))
    add("high", "appcard.warning.not-in-source", "appcard.warning.not-in-source.hint");
  if (input.scan === "infected") add("high", "appcard.scan.infected", "appcard.scan.infected.hint");
  for (const warning of input.warnings.filter((key) => !SERIOUS.includes(key)))
    add("caution", `appcard.warning.${warning}`, `appcard.warning.${warning}.hint`);
  if (input.root) add("caution", "appcard.runsAsRoot", "appcard.runsAsRootHint");
  if (input.scan === "partial") add("caution", "appcard.scan.partial", "appcard.scan.partial.hint");
  if (input.prereleaseOnly) add("caution", "appcard.prereleaseOnly", "appcard.prereleaseOnlyHint");
  if (input.stale) add("caution", "appcard.noReleaseInYear");
  const level: RiskLevel = reasons.some((reason) => reason.severity === "high")
    ? "high"
    : reasons.length
      ? "caution"
      : input.scan === "clean"
        ? "low"
        : "unknown";
  return { level, reasons };
}
