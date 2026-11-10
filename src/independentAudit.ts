import type { IndependentAudit, VirusScan } from "./types";

// Registry data is untrusted at runtime; never present a partial or mismatched report as complete.
export function independentAuditOf(scan: VirusScan | null): IndependentAudit | null {
  if (!scan || scan.unverifiedMatch || !scan.audit || typeof scan.audit !== "object") return null;
  const audit = scan.audit;
  if (
    !(["complete", "incomplete", "error"] as unknown[]).includes(audit.result) ||
    !(audit.root === null || typeof audit.root === "boolean") ||
    typeof audit.scannedAt !== "string" ||
    !Number.isFinite(Date.parse(audit.scannedAt)) ||
    !Array.isArray(audit.findings) ||
    audit.findings.length > 1000 ||
    !audit.findings.every(
      (f) =>
        f &&
        (f.rule === "no-tls-check" || f.rule === "runs-downloads") &&
        typeof f.path === "string" &&
        f.path.length > 0 &&
        f.path.length <= 1024 &&
        Number.isSafeInteger(f.line) &&
        f.line > 0,
    )
  )
    return null;
  return audit;
}
