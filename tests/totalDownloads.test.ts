import assert from "node:assert/strict";
import { test } from "node:test";
import { compareBy, totalDownloads } from "../src/sorting.ts";
import type { App } from "../src/types.ts";

test("a plugin's downloads are GitHub's plus the Decky store's, whichever of them is known", () => {
  assert.equal(totalDownloads({ downloads: 1200, store: { downloads: 300 } }), 1500);
  assert.equal(totalDownloads({ downloads: 1200 }), 1200);
  assert.equal(totalDownloads({ store: { downloads: 300 } }), 300);
  assert.equal(totalDownloads({}), undefined);
  assert.equal(totalDownloads(undefined), undefined);
});

test("store activity counts downloads and updates, including zero, and falls back for old or invalid data", () => {
  assert.equal(totalDownloads({ downloads: 10, store: { downloads: 90, activity: { downloads: 3, updates: 7 } } }), 20);
  assert.equal(totalDownloads({ store: { downloads: 90, activity: { downloads: 0, updates: 0 } } }), 0);
  assert.equal(totalDownloads({ downloads: 10, store: { downloads: 90 } }), 100);
  assert.equal(
    totalDownloads({ downloads: 10, store: { downloads: 90, activity: { downloads: -1, updates: 7 } } }),
    100,
  );
  assert.equal(
    totalDownloads({ downloads: Number.MAX_SAFE_INTEGER, store: { activity: { downloads: 1, updates: 0 } } }),
    undefined,
  );
  assert.equal(totalDownloads({ downloads: -1, store: { activity: { downloads: 3, updates: 7 } } }), 10);
});

test("Most downloaded counts both, and plugins with no numbers go last", () => {
  const app = (name: string, stats?: App["stats"]) => ({ name, stats }) as App;
  const apps = [
    app("github-only", { downloads: 1000 }),
    app("both", { downloads: 800, store: { downloads: 700, activity: { downloads: 400, updates: 500 } } }),
    app("store-only", { store: { downloads: 1200 } }),
    app("unknown"),
  ];
  const sorted = [...apps].sort((a, b) => compareBy("downloads", a, b, apps)).map((item) => item.name);
  assert.deepEqual(sorted, ["both", "store-only", "github-only", "unknown"]);
});
