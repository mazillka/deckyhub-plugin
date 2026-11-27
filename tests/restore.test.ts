import assert from "node:assert/strict";
import { test } from "node:test";
import { restoreChoices, restoreStatus } from "../src/version.ts";

const release = (tag: string, prerelease = false) => ({ tag, prerelease });
const releases = [release("v3.0.0"), release("v2.0.0"), release("v1.0.0")];
const tags = (result: ReturnType<typeof restoreChoices>) =>
  result.choices.map((choice) => [choice.release.tag, choice.saved, choice.latest]);

test("status compares the saved version with the installed one", () => {
  assert.equal(restoreStatus("1.0.0", null, false), "missing");
  assert.equal(restoreStatus("1.0.0", "v1.0.0", false), "installed");
  assert.equal(restoreStatus(null, "2.0.0", false), "installed");
  assert.equal(restoreStatus("1.0.0", "2.0.0", false), "different");
  assert.equal(restoreStatus("1.0.0", "2.0.0", true), "unverified");
});

test("the saved release comes first, then the latest", () => {
  const result = restoreChoices(releases, "v3.0.0", "1.0.0", null);
  assert.deepEqual(tags(result), [
    ["v1.0.0", true, false],
    ["v3.0.0", false, true],
  ]);
  assert.equal(result.savedUnavailable, false);
});

test("a saved release that is also the latest is offered once", () => {
  assert.deepEqual(tags(restoreChoices(releases, "v3.0.0", "3.0.0", null)), [["v3.0.0", true, true]]);
});

test("a saved version DeckyHub can't see is reported, and only the latest is offered", () => {
  const result = restoreChoices(releases, "v3.0.0", "0.5.0", null);
  assert.deepEqual(tags(result), [["v3.0.0", false, true]]);
  assert.equal(result.savedUnavailable, true);
  assert.equal(restoreChoices(releases, "v3.0.0", null, null).savedUnavailable, false);
});

test("the installed version is never offered", () => {
  assert.deepEqual(tags(restoreChoices(releases, "v3.0.0", "1.0.0", "3.0.0")), [["v1.0.0", true, false]]);
  assert.deepEqual(tags(restoreChoices(releases, "v3.0.0", "0.5.0", "3.0.0")), []);
});
