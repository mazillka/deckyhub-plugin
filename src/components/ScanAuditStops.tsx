import type { independentAuditOf } from "../independentAudit";
import type { TFunc } from "../i18n/en";
import { MUTED, Stop } from "./ScanParts";

type Audit = NonNullable<ReturnType<typeof independentAuditOf>>;

// Only this many findings, packages or binaries are listed; the rest is a count.
const LISTED = 20;

const FILE_RULES = {
  sensitive_file_read: "audit.sensitive",
  persistence_crontab: "audit.cron",
  persistence_systemd_enable: "audit.service",
  privilege_setuid: "audit.setuid",
  privilege_sudoers: "audit.sudoers",
} as const;

// Which rules fired in the ZIP's own files, and whether it runs as root.
function FilesAudit({ t, audit }: { t: TFunc; audit: Audit }) {
  const rootKey = audit.root === true ? "audit.rootYes" : audit.root === false ? "audit.rootNo" : "audit.rootUnknown";
  return (
    <>
      <Stop>{t(rootKey)}</Stop>
      {audit.findings.slice(0, LISTED).map((finding, index) => (
        <Stop key={index}>
          {finding.rule === "no-tls-check" || finding.rule === "runs-downloads"
            ? t(`appcard.warning.${finding.rule}`)
            : t(FILE_RULES[finding.rule])}
          : {finding.path}:{finding.line}
        </Stop>
      ))}
      {audit.findings.length > LISTED && <Stop>{t("audit.more", { count: audit.findings.length - LISTED })}</Stop>}
    </>
  );
}

// Whether the ZIP matches the source repository's tag.
function SourceAudit({ t, source }: { t: TFunc; source: Audit["source"] }) {
  return (
    <>
      <Stop>
        <strong>
          {t("audit.source")}: {source ? t(`audit.${source.result}`) : t("scan.unavailable")}
        </strong>
      </Stop>
      {source && (
        <Stop>
          <small style={{ color: MUTED }}>{t("audit.sourceScope")}</small>
        </Stop>
      )}
      {source?.tag && (
        <Stop>
          {t("audit.sourceTag")}: {source.tag}
        </Stop>
      )}
      {source && source.result !== "complete" && (
        <Stop>
          <small style={{ color: MUTED }}>{t("audit.sourceCoverage")}</small>
        </Stop>
      )}
      {source?.findings.slice(0, LISTED).map((finding, index) => (
        <Stop key={`source-${index}`}>
          {t(finding.rule === "source_path_missing" ? "audit.sourceMissing" : "audit.sourceDiffers")}: {finding.path}
        </Stop>
      ))}
      {source && source.findings.length > LISTED && (
        <Stop>{t("audit.more", { count: source.findings.length - LISTED })}</Stop>
      )}
    </>
  );
}

// The ZIP's dependencies: packages, known vulnerabilities and bundled binaries.
function DependencyAudit({ t, dependencies }: { t: TFunc; dependencies: Audit["dependencies"] }) {
  return (
    <>
      <Stop>
        <strong>
          {t("audit.dependencies")}: {dependencies ? t(`audit.${dependencies.result}`) : t("scan.unavailable")}
        </strong>
      </Stop>
      {dependencies && dependencies.result !== "complete" && (
        <Stop>
          <small style={{ color: MUTED }}>{t("audit.dependencyCoverage")}</small>
        </Stop>
      )}
      {dependencies && (
        <Stop>
          {t("audit.packages")}: {dependencies.packages.length}
        </Stop>
      )}
      {dependencies?.packages.slice(0, LISTED).map((pkg, index) => (
        <Stop key={`package-${index}`}>
          {pkg.ecosystem}: {pkg.name} {pkg.version} — {pkg.source}
        </Stop>
      ))}
      {dependencies && dependencies.packages.length > LISTED && (
        <Stop>{t("audit.morePackages", { count: dependencies.packages.length - LISTED })}</Stop>
      )}
      {!!dependencies?.findings.length && (
        <Stop>
          <strong>{t("appcard.warning.vulnerable")}</strong>
        </Stop>
      )}
      {dependencies?.findings.slice(0, LISTED).map((finding, index) => (
        <Stop key={`dependency-${index}`}>
          {finding.ecosystem}: {finding.name} {finding.version} — {finding.id}
        </Stop>
      ))}
      {dependencies && dependencies.findings.length > LISTED && (
        <Stop>{t("audit.more", { count: dependencies.findings.length - LISTED })}</Stop>
      )}
      {dependencies?.binaries && (
        <Stop>
          {t("audit.binaries")}: {dependencies.binaries.length}
        </Stop>
      )}
      {dependencies?.binaries?.slice(0, LISTED).map((binary, index) => (
        <Stop key={`binary-${index}`}>
          {binary.path} ({binary.format}, {binary.size})
        </Stop>
      ))}
    </>
  );
}

// The independent audit: what it is, then its three parts.
export function AuditStops({ t, audit }: { t: TFunc; audit: Audit | null }) {
  return (
    <>
      <Stop>
        <strong>
          {t("audit.title")}: {audit ? t(`audit.${audit.result}`) : t("scan.unavailable")}
        </strong>
      </Stop>
      <Stop>
        <small style={{ color: MUTED }}>{t("audit.scope")}</small>
      </Stop>
      {audit && (
        <>
          <FilesAudit t={t} audit={audit} />
          <SourceAudit t={t} source={audit.source} />
          <DependencyAudit t={t} dependencies={audit.dependencies} />
          <Stop>{t("scan.scannedAt", { date: new Date(audit.scannedAt).toLocaleString() })}</Stop>
        </>
      )}
    </>
  );
}
