import { strict as assert } from "node:assert";
import { test } from "node:test";
import { collectFindings, type FindingsInput } from "../src/findings.ts";

const none: FindingsInput = {
  warnings: [],
  sourceMismatch: false,
  scan: "clean",
  root: false,
  prereleaseOnly: false,
  stale: false,
};
const labels = (input: Partial<FindingsInput>) => collectFindings({ ...none, ...input }).findings.map((f) => f.label);

test("nothing found: an empty list, and the ZIP counts as scanned", () => {
  assert.deepEqual(collectFindings(none), { findings: [], scanned: true });
});

test("a ZIP without a scan report is reported as not scanned, not as clean", () => {
  assert.deepEqual(collectFindings({ ...none, scan: null }), { findings: [], scanned: false });
});

test("each fact is listed with what explains it, and there is no verdict or score", () => {
  const result = collectFindings({ ...none, scan: "infected", warnings: ["persistence"], root: true });
  assert.deepEqual(Object.keys(result), ["findings", "scanned"]);
  assert.deepEqual(
    result.findings.map((f) => [f.label, f.hint]),
    [
      ["appcard.warning.persistence", "appcard.warning.persistence.hint"],
      ["appcard.scan.infected", "appcard.scan.infected.hint"],
      ["appcard.runsAsRoot", "appcard.runsAsRootHint"],
    ],
  );
});

test("the colours match the badges: blocked, not-in-source and a threat are red, the rest amber", () => {
  const tones = (input: Partial<FindingsInput>) => collectFindings({ ...none, ...input }).findings.map((f) => f.tone);
  assert.deepEqual(tones({ warnings: ["blocked", "obfuscated"] }), ["danger", "caution"]);
  assert.deepEqual(tones({ sourceMismatch: true }), ["danger"]);
  assert.deepEqual(tones({ scan: "infected" }), ["danger"]);
  assert.deepEqual(tones({ scan: "partial", root: true, prereleaseOnly: true, stale: true }), [
    "caution",
    "caution",
    "caution",
    "caution",
  ]);
});

test("a source mismatch the audit already warned about is listed once", () => {
  assert.deepEqual(labels({ warnings: ["not-in-source"], sourceMismatch: true }), ["appcard.warning.not-in-source"]);
});

test("a warning with no scan is listed and the ZIP is still reported as not scanned", () => {
  const result = collectFindings({ ...none, scan: null, warnings: ["vulnerable"] });
  assert.deepEqual(
    result.findings.map((f) => f.label),
    ["appcard.warning.vulnerable"],
  );
  assert.equal(result.scanned, false);
});
