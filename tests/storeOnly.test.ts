import assert from "node:assert/strict";
import { test } from "node:test";
import { clearStoreReleaseData, lookupForApp } from "../src/storeOnly.ts";
import type { App } from "../src/types.ts";

test("store-only release lookup returns empty without calling the release loader", async () => {
  let calls = 0;
  const result = await lookupForApp(
    { store: true },
    async () => {
      calls++;
      return ["old GitHub ZIP"];
    },
    [],
  );
  assert.deepEqual(result, []);
  assert.equal(calls, 0);
});

test("store-only hydration clears stale GitHub release data but keeps installed identity", () => {
  const asset = { name: "old.zip", url: "https://example.com/old.zip", size: 1 };
  const app = {
    id: "store-app",
    name: "Store App",
    repo: "owner/store-app",
    category: "Tools",
    asset: { include: [], exclude: [] },
    assets: [asset],
    latestVersion: "1.2.3",
    latestPrerelease: true,
    releaseNotes: "old notes",
    releaseUrl: "https://github.com/owner/store-app/releases/tag/v1.2.3",
    publishedAt: "2025-01-01",
    updateAvailable: true,
    installedVersion: "1.0.0",
    pluginName: "StoreAppPlugin",
    installedAssets: [asset],
    installedAudit: "stable",
    installedRisk: { threat: false, warnings: ["not-in-source"] },
    scan: { result: "infected" },
    virusTotal: { state: "complete", flagged: 1 },
    metaDefender: { state: "complete", flagged: 1 },
    prereleaseOnly: true,
    channel: "prerelease",
    store: true,
  } as App;
  const cleared = clearStoreReleaseData(app);
  assert.deepEqual(cleared.assets, []);
  for (const field of ["latestVersion", "latestPrerelease", "releaseNotes", "releaseUrl", "publishedAt"] as const)
    assert.equal(cleared[field], undefined);
  assert.equal(cleared.updateAvailable, null);
  assert.equal(cleared.installedAssets, undefined);
  assert.equal(cleared.installedAudit, undefined);
  assert.equal(cleared.installedRisk, undefined);
  assert.equal(cleared.scan, undefined);
  assert.equal(cleared.virusTotal, undefined);
  assert.equal(cleared.metaDefender, undefined);
  assert.equal(cleared.prereleaseOnly, undefined);
  assert.equal(cleared.channel, undefined);
  assert.equal(cleared.error, undefined);
  assert.equal(cleared.installedVersion, app.installedVersion);
  assert.equal(cleared.pluginName, app.pluginName);
});
