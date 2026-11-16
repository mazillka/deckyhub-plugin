// What the audit, the virus scans and the registry say about a release, as a list of facts for the
// user to weigh. DeckyHub gives no verdict and no score: the decision to install is the user's.
// Pure, so it's unit-tested (tests/findings.test.ts); labels and hints are message keys the
// caller translates.

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
