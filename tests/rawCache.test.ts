import { test } from "node:test";
import assert from "node:assert/strict";
import { createRawCache } from "../src/rawCache.ts";

test("a failed read is shared, retried after the short TTL, and a success is cached", async (t) => {
  let now = 1000, calls = 0;
  t.mock.method(Date, "now", () => now);
  const cache = createRawCache(async () => {
    calls++;
    return calls === 1 ? { value: "unavailable", failed: true } : { value: "report", failed: false };
  }, 1_800_000, 30_000);
  assert.deepEqual(await Promise.all([cache(["a"]), cache(["a"])]), ["unavailable", "unavailable"]);
  now += 30_001;
  assert.equal(await cache(["a"]), "report");
  now += 30_001;
  assert.equal(await cache(["a"]), "report");
  assert.equal(calls, 2);
  assert.equal(await cache(["b"]), "report");
  assert.equal(calls, 3);
});
