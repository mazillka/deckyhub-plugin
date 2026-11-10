import { test } from "node:test";
import { strict as assert } from "node:assert";
import { independentAuditOf } from "../src/independentAudit.ts";

const audit = {
  result: "complete",
  root: false,
  findings: [{ rule: "no-tls-check", path: "main.py", line: 3 }],
  scannedAt: "2026-11-10T12:00:00Z",
};
const scan = { result: "clean", audit };
test("accepts a verified audit and rejects unverified or malformed data", () => {
  assert.deepEqual(independentAuditOf(scan), audit);
  assert.equal(independentAuditOf({ ...scan, unverifiedMatch: true }), null);
  assert.equal(independentAuditOf({ ...scan, audit: { ...audit, root: "false" } }), null);
  assert.equal(
    independentAuditOf({ ...scan, audit: { ...audit, findings: [{ ...audit.findings[0], line: 0 }] } }),
    null,
  );
  const future = independentAuditOf({
    ...scan,
    audit: { ...audit, findings: [{ ...audit.findings[0], rule: "unknown" }] },
  });
  assert.equal(future?.result, "incomplete");
  assert.equal(future?.root, false);
});

test("optional checks are independently validated", () => {
  const source = { result: "complete", findings: [{ rule: "source_file_differs", path: "main.py" }] };
  const dependencies = {
    result: "incomplete",
    packages: [],
    findings: [],
    issues: [],
    binaries: [{ path: "tool", size: 12, format: "ELF" }],
  };
  const result = independentAuditOf({ ...scan, audit: { ...audit, source, dependencies } } as never);
  assert.deepEqual(result?.source, source);
  assert.deepEqual(result?.dependencies, dependencies);
  const bad = independentAuditOf({
    ...scan,
    audit: {
      ...audit,
      source: { ...source, findings: [{ path: "x" }] },
      dependencies: { ...dependencies, binaries: [{ size: -1 }] },
    },
  } as never);
  assert.equal(bad?.source, undefined);
  assert.equal(bad?.dependencies?.binaries, undefined);
  assert.equal(bad?.root, audit.root);
});

test("preserves source tag and identified package evidence", () => {
  const source = { result: "incomplete", findings: [], tag: "v1.0" };
  const dependencies = {
    result: "error",
    packages: [{ ecosystem: "PyPI", name: "example", version: "1.0", source: "requirements.txt" }],
    findings: [],
    issues: ["unavailable"],
  };
  const result = independentAuditOf({ ...scan, audit: { ...audit, source, dependencies } } as never);
  assert.equal(result?.source?.tag, "v1.0");
  assert.deepEqual(result?.dependencies?.packages, dependencies.packages);
  const malformed = independentAuditOf({
    ...scan,
    audit: {
      ...audit,
      source,
      dependencies: { ...dependencies, packages: [{ ...dependencies.packages[0], source: 3 }] },
    },
  } as never);
  assert.equal(malformed?.dependencies, undefined);
  assert.equal(malformed?.source?.tag, "v1.0");
});
