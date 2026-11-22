import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPendingRequest, nextTrustedRequest, runsUnattended } from "../src/remoteTrusted.ts";

const request = (id: string) => ({ id, pluginId: "a", ownerName: "Phone", status: "approved" });

test("only approved requests from trusted browsers run, once each, and only while Remote Install is on", () => {
  const started = new Set<string>();
  const status = { enabled: true, trustedRequests: [request("one"), request("two")] };
  assert.equal(nextTrustedRequest(status, started)?.id, "one");
  started.add("one");
  assert.equal(nextTrustedRequest(status, started)?.id, "two");
  started.add("two");
  assert.equal(nextTrustedRequest(status, started), undefined);
  assert.equal(nextTrustedRequest({ enabled: false, trustedRequests: [request("x")] }, new Set()), undefined);
  assert.equal(nextTrustedRequest({ enabled: true }, new Set()), undefined);
});

test("a request waiting for an answer is put in front of the owner once, and only while Remote Install is on", () => {
  const shown = new Set<string>();
  const status = { enabled: true, requests: [request("one"), request("two")] };
  assert.equal(nextPendingRequest(status, shown)?.id, "one");
  shown.add("one");
  assert.equal(nextPendingRequest(status, shown)?.id, "two");
  shown.add("two");
  assert.equal(nextPendingRequest(status, shown), undefined);
  assert.equal(nextPendingRequest({ enabled: false, requests: [request("x")] }, new Set()), undefined);
  assert.equal(nextPendingRequest({ enabled: true }, new Set()), undefined);
});

test("a trusted browser's install runs without asking only when its ZIP has a SHA-256 to check", () => {
  const hash = "a".repeat(64);
  assert.equal(runsUnattended(true, { sha256: hash }), true);
  assert.equal(runsUnattended(true, { sha256: hash.toUpperCase() }), true);
  assert.equal(runsUnattended(true, {}), false);
  assert.equal(runsUnattended(true, { sha256: "abc" }), false);
  assert.equal(runsUnattended(true, undefined), false);
  assert.equal(runsUnattended(false, { sha256: hash }), false);
});
