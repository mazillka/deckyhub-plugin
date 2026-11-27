import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { collectFindings, scanSummary } from "../src/findings.ts";
import { en } from "../src/i18n/en.ts";
import { AUDIT_WARNINGS, type VirusScan } from "../src/types.ts";

// The registry's shared warning texts and cases, which the extension and deckyhub.com are tested against too.
// DECKYHUB_REGISTRY is a checkout's registry/apps.json (the Registry compatibility workflow sets it).
const folder = process.env.DECKYHUB_REGISTRY ? dirname(process.env.DECKYHUB_REGISTRY) : "";
const read = (name: string) => JSON.parse(readFileSync(join(folder, name), "utf8"));
// shortcut: a registry branch without the files is skipped, make this a failure once they're on the registry's main.
const skip = !folder
  ? "set DECKYHUB_REGISTRY to a registry/apps.json"
  : !existsSync(join(folder, "warnings.json")) && "this registry checkout has no warnings.json yet";

test("English warning texts and tones match the registry's warnings.json", { skip }, () => {
  const { warnings } = read("warnings.json");
  assert.deepEqual([...AUDIT_WARNINGS].sort(), Object.keys(warnings).sort());
  const texts: Record<string, string> = en;
  for (const [id, warning] of Object.entries<{ label: string; hint: string; tone: string }>(warnings)) {
    assert.equal(texts[`appcard.warning.${id}`], warning.label, id);
    assert.equal(texts[`appcard.warning.${id}.hint`], warning.hint, id);
    const [finding] = collectFindings({
      warnings: [id],
      sourceMismatch: false,
      scan: "clean",
      root: false,
      prereleaseOnly: false,
      stale: false,
    }).findings;
    assert.equal(finding.tone, warning.tone, id);
  }
});

test("the registry's shared scan cases give the same badge", { skip }, () => {
  const { scans } = read("contract-cases.json");
  assert.ok(scans.length);
  const report = (flagged: number | null) => (flagged === null ? null : { state: "complete", flagged, total: 10 });
  for (const item of scans) {
    const scan = { result: item.clamav, yara: item.yara ? { result: item.yara } : undefined } as VirusScan;
    assert.deepEqual(
      scanSummary(scan, report(item.virusTotal), report(item.metaDefender)),
      { kind: item.expect.kind, count: `${item.expect.passed}/4` },
      item.name,
    );
  }
});
