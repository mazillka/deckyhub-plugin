import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assessRisk, type RiskInput } from "../src/risk.ts";

const none: RiskInput = {
  warnings: [],
  sourceMismatch: false,
  scan: "clean",
  root: false,
  prereleaseOnly: false,
  stale: false,
};
const labels = (input: Partial<RiskInput>) => assessRisk({ ...none, ...input }).reasons.map((reason) => reason.label);

test("clean scans and no warnings is 'low': no findings, listed nothing", () => {
  assert.deepEqual(assessRisk(none), { level: "low", reasons: [] });
});

test("no scan report yet is 'unknown', never 'low'", () => {
  assert.equal(assessRisk({ ...none, scan: null }).level, "unknown");
});

test("a threat, a blocked release or code that doesn't match its source is 'high'", () => {
  for (const change of [
    { scan: "infected" },
    { warnings: ["blocked"] },
    { warnings: ["not-in-source"] },
    { sourceMismatch: true },
  ] as const)
    assert.equal(assessRisk({ ...none, ...change }).level, "high", JSON.stringify(change));
});

test("a mismatch the audit already warned about is listed once", () => {
  assert.deepEqual(labels({ warnings: ["not-in-source"], sourceMismatch: true }), ["appcard.warning.not-in-source"]);
});

test("milder warnings, root, a partial scan, pre-release only and a stale plugin are 'caution'", () => {
  for (const change of [
    { warnings: ["obfuscated"] },
    { root: true },
    { scan: "partial" },
    { prereleaseOnly: true },
    { stale: true },
  ] as const)
    assert.equal(assessRisk({ ...none, ...change }).level, "caution", JSON.stringify(change));
});

test("a warning with no scan is still 'caution', not 'unknown'", () => {
  assert.equal(assessRisk({ ...none, scan: null, warnings: ["vulnerable"] }).level, "caution");
});

test("serious findings come before cautions, each with the keys that explain it", () => {
  const { level, reasons } = assessRisk({ ...none, scan: "infected", warnings: ["persistence"], root: true });
  assert.equal(level, "high");
  assert.deepEqual(
    reasons.map((reason) => [reason.severity, reason.label]),
    [
      ["high", "appcard.scan.infected"],
      ["caution", "appcard.warning.persistence"],
      ["caution", "appcard.runsAsRoot"],
    ],
  );
  assert.equal(reasons[0].hint, "appcard.scan.infected.hint");
});
