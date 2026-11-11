import assert from "node:assert/strict";
import { test } from "node:test";
import { nextTrustedRequest } from "../src/remoteTrusted.ts";

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
