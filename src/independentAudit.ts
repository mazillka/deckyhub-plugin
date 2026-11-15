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
        typeof f.rule === "string" &&
        typeof f.path === "string" &&
        f.path.length > 0 &&
        f.path.length <= 1024 &&
        Number.isSafeInteger(f.line) &&
        f.line > 0,
    )
  )
    return null;
  const status = (value: unknown) => ["complete", "incomplete", "error"].includes(value as string);
  const str = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 1024;
  const source = audit.source;
  const validSource =
    source &&
    status(source.result) &&
    Array.isArray(source.findings) &&
    source.findings.length <= 1000 &&
    source.findings.every((f) => f && ["source_path_missing", "source_file_differs"].includes(f.rule) && str(f.path)) &&
    (source.tag === undefined || str(source.tag)) &&
    (source.reason === undefined || str(source.reason));
  const deps = audit.dependencies;
  const validDeps =
    deps &&
    status(deps.result) &&
    Array.isArray(deps.packages) &&
    deps.packages.length <= 1000 &&
    deps.packages.every((p) => p && str(p.ecosystem) && str(p.name) && str(p.version) && str(p.source)) &&
    Array.isArray(deps.findings) &&
    deps.findings.length <= 1000 &&
    deps.findings.every((f) => f && str(f.ecosystem) && str(f.name) && str(f.version) && str(f.id)) &&
    Array.isArray(deps.issues) &&
    deps.issues.length <= 1000 &&
    deps.issues.every(str);
  const known = [
    "no-tls-check",
    "runs-downloads",
    "sensitive_file_read",
    "persistence_crontab",
    "persistence_systemd_enable",
    "privilege_setuid",
    "privilege_sudoers",
  ];
  const findings = audit.findings.filter((finding) => known.includes(finding.rule));
  const result: IndependentAudit = {
    ...audit,
    findings,
    result: findings.length !== audit.findings.length && audit.result === "complete" ? "incomplete" : audit.result,
  };
  if (!validSource) delete result.source;
  if (!validDeps) delete result.dependencies;
  else if (
    deps.binaries !== undefined &&
    (!Array.isArray(deps.binaries) ||
      deps.binaries.length > 1000 ||
      !deps.binaries.every((b) => b && str(b.path) && str(b.format) && Number.isSafeInteger(b.size) && b.size >= 0))
  ) {
    result.dependencies = { ...deps };
    delete result.dependencies.binaries;
  }
  return result;
}
