import assert from "node:assert/strict";
import { test } from "node:test";
import { settleInstall } from "../src/remoteOutcome.ts";

const run = (versions: (string | null | Error)[], before: string | null) => {
  const calls: string[] = [];
  let read = 0;
  return settleInstall({
    installedVersion: async () => {
      const next = versions[Math.min(read++, versions.length - 1)];
      if (next instanceof Error) throw next;
      return next;
    },
    before,
    succeeded: async () => void calls.push("succeeded"),
    unknown: async () => void calls.push("unknown"),
    wait: async () => undefined,
    attempts: 5,
  }).then(() => ({ calls, reads: read }));
};

test("a fresh install succeeds as soon as the plugin shows up, and not before", async () => {
  assert.deepEqual(await run([null, null, "1.0.0"], null), { calls: ["succeeded"], reads: 3 });
});

test("an update succeeds once the version is not the old one", async () => {
  assert.deepEqual(await run(["1.0.0", "1.0.0", "1.1.0"], "1.0.0"), { calls: ["succeeded"], reads: 3 });
});

test("nothing changing is an unknown outcome, after every attempt", async () => {
  assert.deepEqual(await run(["1.0.0"], "1.0.0"), { calls: ["unknown"], reads: 5 });
  assert.deepEqual(await run([null], null), { calls: ["unknown"], reads: 5 });
});

test("a failed read is tried again, not taken for a result", async () => {
  assert.deepEqual(await run([new Error("backend busy"), "2.0.0"], "1.0.0"), { calls: ["succeeded"], reads: 2 });
});
