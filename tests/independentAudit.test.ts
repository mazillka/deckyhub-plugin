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
  assert.equal(
    independentAuditOf({ ...scan, audit: { ...audit, findings: [{ ...audit.findings[0], rule: "unknown" }] } }),
    null,
  );
});
