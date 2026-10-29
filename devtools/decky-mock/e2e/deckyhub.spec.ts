import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const deckyHubVersion = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version;
const deckyHubTag = `v${deckyHubVersion}`;

// Tags just above and below the installed version, derived from whatever the
// real installed version happens to be so they stay valid across version
// bumps. An installed "1.0.3-rc.3" gets its rc siblings ("-rc.2"/"-rc.4");
// a stable version (rc siblings of it would all be older) gets a far-future
// and a far-past rc pair instead.
const rcMatch = deckyHubVersion.match(/^(.*-rc\.)(\d+)$/);
const olderRcTag = rcMatch ? `v${rcMatch[1]}${Number(rcMatch[2]) - 1}` : "v0.0.1-rc.1";
const newerRcTag = rcMatch ? `v${rcMatch[1]}${Number(rcMatch[2]) + 1}` : "v999.0.0-rc.2";

const release = {
  tag_name: "plugin-v1.2.3",
  html_url: "https://github.com/example/project/releases/tag/plugin-v1.2.3",
  assets: Array.from({ length: 5 }, (_, index) => ({
    name: `mako-decky-${index + 1}.zip`,
    browser_download_url: `https://github.com/example/project/releases/download/plugin-v1.2.3/mako-decky-${index + 1}.zip`,
    size: 1024,
  })),
};

const mock = (page: Page) => page.frameLocator("iframe");

// GET /repos/eugeniosegala/MAKO/releases with one checksummed ZIP per release.
const makoRelease = (tag: string, sha256: string, day = "01") => ({
  tag_name: tag, prerelease: false, draft: false, published_at: `2026-01-${day}T00:00:00Z`, html_url: `https://github.com/eugeniosegala/MAKO/releases/tag/${tag}`,
  assets: [{ name: "mako-decky.zip", browser_download_url: `https://github.com/eugeniosegala/MAKO/releases/download/${tag}/mako-decky.zip`, size: 1024, digest: `sha256:${sha256}` }],
});
const RELEASE_INDEX_URL = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/release-index/releases.json";
const PLUGIN_STATS_URL = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/release-index/stats.json";
const mockMakoReleases = (page: Page, releases: unknown[]) =>
  page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases**", (route) => route.fulfill({ json: releases }));

// GET /repos/mazillka/deckyhub-plugin/releases with one checksummed DeckyHub ZIP per release.
const DECKYHUB_RELEASES = "https://github.com/mazillka/deckyhub-plugin/releases";
const deckyHubZipUrl = (tag: string) => `${DECKYHUB_RELEASES}/download/${tag}/DeckyHub-${tag}.zip`;
const deckyHubRelease = (tag: string, { sha = "a", prerelease = false, publishedAt }: { sha?: string; prerelease?: boolean; publishedAt?: string } = {}) => ({
  tag_name: tag, prerelease, draft: false, ...(publishedAt && { published_at: publishedAt }), html_url: `${DECKYHUB_RELEASES}/tag/${tag}`,
  assets: [{ name: `DeckyHub-${tag}.zip`, browser_download_url: deckyHubZipUrl(tag), digest: `sha256:${sha.repeat(64)}` }],
});
// What Decky receives once DeckyHub has staged a release ZIP (see dev-server.py's stage_install).
const localZip = (url: string) => `file:///deckyhub-installs/${url.split("/").pop()}`;
const mockDeckyHubReleases = (page: Page, releases: unknown[]) =>
  page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=20", (route) => route.fulfill({ json: releases }));

// Stand-in for Decky Loader in the plugin frame: window.DeckyBackend records
// calls in __installCalls and relays events sent with emit(); DeckyPluginLoader
// records the plugins it's asked to import in __imports.
const recordInstalls = (page: Page) =>
  page.addInitScript(() => {
    const calls: unknown[][] = [];
    const imports: string[] = [];
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    Object.assign(window, {
      __installCalls: calls,
      __imports: imports,
      __emit: (event: string, ...args: unknown[]) => [...(listeners[event] ?? [])].forEach((listener) => listener(...args)),
      DeckyPluginLoader: { importPlugin: async (name: string) => void imports.push(name) },
      DeckyBackend: {
        // Settles once __holdInstall does, if a test set one (Decky's dialog still coming).
        call: async (...args: unknown[]) => {
          calls.push(args);
          await (window as unknown as { __holdInstall?: Promise<void> }).__holdInstall;
        },
        addEventListener: (event: string, listener: (...args: unknown[]) => void) => void (listeners[event] ??= []).push(listener),
        removeEventListener: (event: string, listener: (...args: unknown[]) => void) => void (listeners[event] = (listeners[event] ?? []).filter((item) => item !== listener)),
      },
    });
  });
const pluginFrame = (page: Page) => page.frames().find((candidate) => candidate !== page.mainFrame())!;
const emit = (page: Page, event: string, name: string) =>
  pluginFrame(page).evaluate(([event, name]) => (window as unknown as { __emit: (event: string, name: string) => void }).__emit(event, name), [event, name] as const);

const BRIDGE_URL = "http://127.0.0.1:8643";

// Round-trips a request straight to the dev-server bridge (bypassing the
// app's own UI), used to seed or reset state — most often settings.json,
// which is a REAL SHARED FILE on disk across every test run and interactive
// preview session. Always await this before the test that used it finishes,
// since an unawaited call races Playwright's own page teardown.
// Discover opens on its shelves; tests of the whole list tap the All plugins chip.
// A query narrows it to the cards a test needs, since the list shows a page at a time.
async function browseAll(page: Page, query?: string) {
  await mock(page).getByRole("button", { name: /^All plugins/ }).click();
  if (query) await mock(page).getByLabel("Search").fill(query);
}

function bridgeCall(page: Page, route: string, ...args: unknown[]) {
  return page.evaluate(
    ([bridge, route, args]) =>
      fetch(bridge, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ route, args }) }).then((res) => res.json()),
    [BRIDGE_URL, route, args] as const,
  );
}

// A run interrupted mid-test can leave a seeded plugin behind, which would
// show as installed to every later test; clear them before starting.
test.beforeAll(() => {
  const plugins = new URL("../.dev-data/plugins/", import.meta.url);
  mkdirSync(plugins, { recursive: true });
  for (const dir of readdirSync(plugins)) if (dir.startsWith("e2e-")) rmSync(new URL(`${dir}/`, plugins), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test.beforeEach(async ({ page }) => {
  // Every release lookup hits GET /repos/{repo}/releases, which returns a list.
  await page.route("https://api.github.com/**", (route) => route.fulfill({ json: [release] }));
  // No release index unless a test serves one, so release lookups use the API stubs.
  await page.route(RELEASE_INDEX_URL, (route) => route.fulfill({ status: 404, body: "404: Not Found" }));
  await page.route(PLUGIN_STATS_URL, (route) => route.fulfill({ status: 404, body: "404: Not Found" }));
  // Search keeps only repos with a Decky plugin.json; every stubbed result has one.
  await page.route("https://raw.githubusercontent.com/**/plugin.json", (route) => route.fulfill({ json: { name: "Test plugin" } }));
  await page.goto("/?bridge=http://127.0.0.1:8643");
});

test("Quick Access navigation opens Discover", async ({ page }) => {
  const app = mock(page);
  const [discover, settings] = await Promise.all([
    app.getByRole("button", { name: "Discover", exact: true }).boundingBox(),
    app.getByRole("button", { name: "Settings", exact: true }).boundingBox(),
  ]);
  expect(settings!.y - (discover!.y + discover!.height)).toBeGreaterThanOrEqual(6);
  // The button counts every plugin Discover lists.
  const listed = (await bridgeCall(page, "get_apps")).result.apps.length;
  await expect(app.getByRole("button", { name: "Discover", exact: true }).locator(".deckyhub-discover-count")).toHaveText(String(listed));
  await app.getByRole("button", { name: "Discover", exact: true }).click();

  await expect(app.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
  await expect(app.getByText("STEAM", { exact: true })).toBeVisible();
  // It opens on its shelves, each a row of cards.
  await expect(app.getByRole("heading", { name: "Most popular", exact: true })).toBeVisible();
  await expect(app.locator(".deckyhub-shelf-popular").getByRole("heading", { level: 3 })).not.toHaveCount(0);
});

test("Quick Access keeps its controller footer below its content", async ({ page }) => {
  const app = mock(page);
  const content = app.locator(".qam-content");
  const footer = app.locator(".qam-panel .steam-bottombar");
  const [contentBox, footerBox] = await Promise.all([content.boundingBox(), footer.boundingBox()]);
  expect(contentBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y).toBeGreaterThanOrEqual(contentBox!.y + contentBox!.height);
});

test("download modal actions use the full modal width", async ({ page }) => {
  const app = mock(page);
  const expectFullWidth = async (name: string) => {
    const [button, modal] = await Promise.all([app.getByRole("button", { name, exact: true }).boundingBox(), app.locator(".steam-modal").boundingBox()]);
    expect(button).not.toBeNull();
    expect(modal).not.toBeNull();
    expect(button!.width).toBeGreaterThanOrEqual(modal!.width - 48);
  };

  await app.getByRole("button", { name: "Download progress modal", exact: true }).click();
  await expectFullWidth("Cancel");
  await app.getByRole("button", { name: "Cancel", exact: true }).click();
  await app.getByRole("button", { name: "Download complete modal", exact: true }).click();
  await expectFullWidth("OK");
});

test("Discover keeps search and status on one row", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  await browseAll(page);
  const app = mock(page);
  const search = app.getByLabel("Search");
  const status = app.getByLabel("Status");

  await expect(search).toBeVisible();
  await expect(status).toBeVisible();
  const [searchBox, statusBox] = await Promise.all([search.boundingBox(), status.boundingBox()]);
  expect(searchBox).not.toBeNull();
  expect(statusBox).not.toBeNull();
  expect(Math.abs(searchBox!.y - statusBox!.y)).toBeLessThan(20);
  expect(Math.abs(searchBox!.height - statusBox!.height)).toBeLessThan(20);
  expect(statusBox!.x).toBeGreaterThan(searchBox!.x);
  // Search gets twice a dropdown's share of the row.
  expect(searchBox!.width).toBeGreaterThan(statusBox!.width * 1.5);
});

test("Discover keeps its refresh action beside the description", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const title = app.getByRole("heading", { name: "Discover", exact: true });
  const description = app.getByText("Browse Decky plugins and install them from their authors' GitHub releases.");
  const refresh = app.getByRole("button", { name: "Refresh", exact: true });

  // On the header's row: its middle falls between the title's top and the description's bottom.
  const [titleBox, descriptionBox, refreshBox] = await Promise.all([title.boundingBox(), description.boundingBox(), refresh.boundingBox()]);
  const refreshMiddle = refreshBox!.y + refreshBox!.height / 2;
  expect(refreshMiddle).toBeGreaterThan(titleBox!.y);
  expect(refreshMiddle).toBeLessThan(descriptionBox!.y + descriptionBox!.height);
  expect(refreshBox!.x).toBeGreaterThan(descriptionBox!.x + descriptionBox!.width);
});

test("Repository search and action share one row", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/search&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const search = app.getByLabel("Search GitHub");
  const action = app.getByRole("button", { name: "Search", exact: true });
  const clear = app.getByRole("button", { name: "Clear", exact: true });

  await expect(search).toBeVisible();
  await expect(action).toBeVisible();
  await expect(clear).toBeVisible();
  const [searchBox, actionBox, clearBox] = await Promise.all([search.boundingBox(), action.boundingBox(), clear.boundingBox()]);
  expect(searchBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  // One centre line for the field and both buttons (seen off by a few px on a Deck).
  const middle = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(Math.abs(middle(searchBox!) - middle(actionBox!))).toBeLessThan(2);
  expect(actionBox!.x).toBeGreaterThan(searchBox!.x);
  expect(Math.abs(middle(actionBox!) - middle(clearBox!))).toBeLessThan(2);
  expect(clearBox!.x).toBeGreaterThan(actionBox!.x);
});

test("Repository search stays enabled but skips blank queries", async ({ page }) => {
  let requests = 0;
  await page.route("https://api.github.com/search/repositories**", (route) => {
    requests++;
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto("/?preview=/deckyhub/search&bridge=http://127.0.0.1:8643");
  const search = mock(page).getByRole("button", { name: "Search", exact: true });

  await expect(search).toBeEnabled();
  await search.click();
  expect(requests).toBe(0);
});

test("Repository import and export share one row", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/repositories&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const exportButton = app.getByRole("button", { name: "Export", exact: true });
  const importButton = app.getByRole("button", { name: "Import", exact: true });

  const [exportBox, importBox] = await Promise.all([exportButton.boundingBox(), importButton.boundingBox()]);
  expect(Math.abs(exportBox!.y - importBox!.y)).toBeLessThan(20);
  expect(importBox!.x).toBeGreaterThan(exportBox!.x);
});

test("Cleanup shows only when the downloads folder has files, and clearing requires confirmation", async ({ page }) => {
  // dev-server.py points the bridge's download folder at .dev-data/downloads.
  const downloads = new URL("../.dev-data/downloads/", import.meta.url);
  rmSync(downloads, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  const app = mock(page);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  await expect(app.getByRole("button", { name: "Discover", exact: true })).toBeVisible();
  await expect(app.getByText("Cleanup", { exact: true })).toHaveCount(0);

  mkdirSync(downloads, { recursive: true });
  writeFileSync(new URL("old-plugin.zip", downloads), "zip");
  await page.goto("/?bridge=http://127.0.0.1:8643");
  await app.locator(".qam-content").getByRole("button", { name: "Empty Folder", exact: true }).click();

  await expect(app.getByText("Permanently remove all files in /home/deck/Downloads/deckyhub?")).toBeVisible();
  // The two actions stack full-width, each on its own line.
  const modal = app.locator(".steam-modal");
  const [confirm, cancel] = await Promise.all([
    modal.getByRole("button", { name: "Empty Folder", exact: true }).boundingBox(),
    modal.getByRole("button", { name: "Cancel", exact: true }).boundingBox(),
  ]);
  expect(cancel!.y).toBeGreaterThanOrEqual(confirm!.y + confirm!.height);
  expect(Math.abs(cancel!.width - confirm!.width)).toBeLessThan(2);
  await expect(modal.getByText("old-plugin.zip")).toBeVisible();

  // Emptying it removes the file and the section with it.
  await modal.getByRole("button", { name: "Empty Folder", exact: true }).click();
  await expect(app.locator(".qam-content").getByRole("button", { name: "Empty Folder", exact: true })).toHaveCount(0);
  await expect(app.getByText("Cleanup", { exact: true })).toHaveCount(0);
});

test("Export Logs zips the backend log into Downloads", async ({ page }) => {
  // dev-server.py logs to .dev-data/logs/ and points Downloads at .dev-data/home/Downloads.
  const downloads = new URL("../.dev-data/home/Downloads/", import.meta.url);
  rmSync(downloads, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  const app = mock(page);
  const toast = page.waitForEvent("console", (message) => message.text().includes("Exported to"));
  await app.locator(".qam-content").getByRole("button", { name: "Export Logs", exact: true }).click();

  const name = (await toast).text().match(/DeckyHub-logs-\d{8}-\d{6}\.zip/)?.[0];
  expect(name).toBeTruthy();
  expect(readFileSync(new URL(name!, downloads)).subarray(0, 2).toString()).toBe("PK");
  // Backend actions land in the log the zip is built from.
  expect(readFileSync(new URL("../.dev-data/logs/deckyhub.log", import.meta.url), "utf8")).toContain("Listed");
  rmSync(downloads, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test("DeckyHub automatically notifies about an available update", async ({ page }) => {
  const newerRelease = deckyHubRelease("v9.9.9", { sha: "b" });
  await mockDeckyHubReleases(page, [newerRelease]);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await expect(app.getByText("DeckyHub: DeckyHub update v9.9.9 is available.")).toBeVisible();

  // Reopening the panel doesn't toast the same update again; its button names it.
  await page.reload();
  await expect(app.locator(".qam-content").getByRole("button", { name: "Update to v9.9.9", exact: true })).toBeVisible();
  await expect(app.getByText("DeckyHub: DeckyHub update v9.9.9 is available.")).toHaveCount(0);
  await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();
  await expect(app.locator(".steam-modal").getByRole("button", { name: "Update to v9.9.9", exact: true })).toBeVisible();
  await expect(app.getByRole("button", { name: "Release Page", exact: true })).toBeVisible();
});

test("DeckyHub's own update check asks GitHub, not a lagging release index", async ({ page }) => {
  // The index hasn't caught up with the newest DeckyHub release yet.
  await page.route(RELEASE_INDEX_URL, (route) =>
    route.fulfill({ json: { generatedAt: new Date().toISOString(), releases: { "mazillka/deckyhub-plugin": [deckyHubRelease("v9.9.8", { sha: "c" })] } } }),
  );
  await mockDeckyHubReleases(page, [deckyHubRelease("v9.9.9", { sha: "b" }), deckyHubRelease("v9.9.8", { sha: "c" })]);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  await expect(mock(page).locator(".qam-content").getByRole("button", { name: "Update to v9.9.9", exact: true })).toBeVisible();
});

test("DeckyHub's update check falls back to the release index when GitHub refuses", async ({ page }) => {
  await page.route(RELEASE_INDEX_URL, (route) =>
    route.fulfill({ json: { generatedAt: new Date().toISOString(), releases: { "mazillka/deckyhub-plugin": [deckyHubRelease("v9.9.8", { sha: "c" })] } } }),
  );
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=20", (route) => route.fulfill({ status: 403, json: { message: "API rate limit exceeded" } }));
  await page.goto("/?bridge=http://127.0.0.1:8643");
  await expect(mock(page).locator(".qam-content").getByRole("button", { name: "Update to v9.9.8", exact: true })).toBeVisible();
});

test("DeckyHub's panel Update hands the newer release straight to Decky's installer", async ({ page }) => {
  await mockDeckyHubReleases(page, [deckyHubRelease("v9.9.9", { sha: "b" })]);
  await recordInstalls(page);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Update to v9.9.9", exact: true }).click();

  // No update window in between: Decky's own dialog takes over.
  await expect(app.locator(".steam-modal")).toHaveCount(0);
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
  await expect.poll(() => frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([
    ["utilities/install_plugin", localZip(deckyHubZipUrl("v9.9.9")), "DeckyHub", "9.9.9", "b".repeat(64), 2],
  ]);
});

test("Y and X on DeckyHub's panel Update show the release notes and download the ZIP", async ({ page }) => {
  await mockDeckyHubReleases(page, [{ ...deckyHubRelease("v9.9.9", { sha: "b" }), body: "Snappier menus." }]);
  await recordInstalls(page);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const update = app.locator(".qam-content").getByRole("button", { name: "Update to v9.9.9", exact: true });
  await update.focus();
  await expect(app.locator(".steam-legend")).toContainText("Ⓨ Release Info");
  await expect(app.locator(".steam-legend")).toContainText("Ⓧ Download ZIP");

  await update.press("y");
  await expect(app.locator(".steam-modal", { hasText: "DeckyHub v9.9.9" }).getByText("Snappier menus.")).toBeVisible();
  await page.reload();
  await app.locator(".qam-content").getByRole("button", { name: "Update to v9.9.9", exact: true }).press("x");
  await expect(app.locator(".steam-modal", { hasText: "DeckyHub-v9.9.9.zip" })).toBeVisible();
  // Neither key installs anything.
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
  expect(await frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([]);
});

test("DeckyHub doesn't advertise an older release as an available update", async ({ page }) => {
  // The installed version is a pre-release (package.json); the stable
  // channel's newest release is older, so it must not show as "available".
  const olderStable = deckyHubRelease("v0.9.0", { sha: "c" });
  await mockDeckyHubReleases(page, [olderStable]);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);

  await expect(app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true })).toBeVisible();
  await expect(app.locator(".qam-content").getByRole("button", { name: /^Update to v/ })).toHaveCount(0);
  await expect(app.getByText(/DeckyHub update v0\.9\.0 is available/)).toHaveCount(0);
  await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();
  await expect(app.getByRole("button", { name: "Downgrade to v0.9.0", exact: true })).toBeVisible();
});

test("DeckyHub's Check for Updates snaps the version picker back to the channel's latest", async ({ page }) => {
  const installedRelease = deckyHubRelease(deckyHubTag);
  const olderRelease = deckyHubRelease("v0.9.0", { sha: "c" });
  await mockDeckyHubReleases(page, [installedRelease, olderRelease]);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();

  // Pick the older release to inspect a downgrade...
  await app.getByLabel("Version").selectOption({ label: "v0.9.0" });
  await expect(app.getByLabel("Version")).toHaveValue("v0.9.0");

  // ...then explicitly check for updates: the selection should jump back to
  // the channel's newest release (here, the installed one), not stay parked
  // on whatever was selected before.
  await app.locator(".steam-modal").getByRole("button", { name: "Check for Updates", exact: true }).click();

  await expect(app.getByLabel("Version")).toHaveValue(deckyHubTag);
  await expect(app.getByRole("button", { name: `Reinstall v${deckyHubVersion}`, exact: true })).toBeVisible();
});

test("DeckyHub distinguishes rc versions sharing the same release number", async ({ page }) => {
  // Regression test: versionNumbers()'s regex used to strip the "-rc.N"
  // suffix entirely, so "1.0.3-rc.1"/"-rc.2"/"-rc.3" all parsed as the same
  // "1.0.3" and switching between them in the version picker always showed
  // "Reinstall" — never "Update" or "Downgrade" — no matter which was picked.
    const installedRelease = deckyHubRelease(deckyHubTag);
  const olderRcRelease = deckyHubRelease(olderRcTag);
  const newerRcRelease = deckyHubRelease(newerRcTag);
  await mockDeckyHubReleases(page, [newerRcRelease, installedRelease, olderRcRelease]);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();

  // The modal defaults to the channel's newest release (newerRcRelease is
  // versions[0] in the mocked list), not the installed one, so it shows
  // "Update to …" immediately rather than "Reinstall …".
  await expect(app.locator(".steam-modal").getByRole("button", { name: `Update to ${newerRcTag}`, exact: true })).toBeVisible();

  await app.getByLabel("Version").selectOption({ label: olderRcTag });
  await expect(app.getByRole("button", { name: `Downgrade to ${olderRcTag}`, exact: true })).toBeVisible();

  await app.getByLabel("Version").selectOption({ label: `${deckyHubTag} (installed)` });
  await expect(app.getByRole("button", { name: `Reinstall v${deckyHubVersion}`, exact: true })).toBeVisible();
});

test("DeckyHub picks the newest release by publish date even when GitHub returns the list out of order", async ({ page }) => {
  // Regression test: GitHub's list-releases endpoint has been observed
  // returning a just-published release sandwiched in the middle of the
  // array instead of first, so trusting array order for "latest" silently
  // pointed the version picker (and its "(latest)" tag) at a stale release.
  // The mock below deliberately places the truly-newest release (by
  // published_at) in the middle of the response to reproduce that.
  const installedRelease = deckyHubRelease(deckyHubTag, { publishedAt: "2026-01-01T00:00:00Z" });
  const olderRcRelease = deckyHubRelease(olderRcTag, { publishedAt: "2026-01-02T00:00:00Z" });
  const newerRcRelease = deckyHubRelease(newerRcTag, { publishedAt: "2026-01-03T00:00:00Z" });
  // Out-of-order on purpose: the newest release (by published_at) isn't array[0].
  await mockDeckyHubReleases(page, [installedRelease, newerRcRelease, olderRcRelease]);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();

  await expect(app.locator(".steam-modal").getByRole("button", { name: `Update to ${newerRcTag}`, exact: true })).toBeVisible();
  await expect(app.locator(".steam-modal").getByLabel("Version")).toHaveValue(newerRcRelease.tag_name);
  const options = await app.locator(".steam-modal").getByLabel("Version").locator("option").allTextContents();
  expect(options.find((label) => label.includes("(latest)"))).toBe(`${newerRcTag} (latest)`);
});

test("DeckyHub falls back to a clear message when automatic update can't reach Decky Loader", async ({ page }) => {
  await mockDeckyHubReleases(page, [deckyHubRelease(deckyHubTag)]);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();

  // The dev mock never defines window.DeckyBackend, mirroring a Decky Loader
  // build old enough not to expose it — the same fallback path real users hit.
  await app.getByRole("button", { name: `Reinstall v${deckyHubVersion}`, exact: true }).click();

  await expect(app.getByText("Automatic update is unavailable right now — use Download ZIP instead.")).toBeVisible();
  await expect(app.getByRole("button", { name: "Download ZIP", exact: true })).toBeVisible();
});

test("DeckyHub's Reinstall closes its window and hands the release to Decky's installer", async ({ page }) => {
  await mockDeckyHubReleases(page, [deckyHubRelease(deckyHubTag)]);
  await recordInstalls(page);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();
  await app.getByRole("button", { name: `Reinstall v${deckyHubVersion}`, exact: true }).click();

  // Decky's own confirm/progress dialog takes over, so this window gets out of the way.
  await expect(app.locator(".steam-modal")).toHaveCount(0);
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
  await expect.poll(() => frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([
    ["utilities/install_plugin", localZip(deckyHubZipUrl(deckyHubTag)), "DeckyHub", deckyHubVersion, "a".repeat(64), 1],
  ]);
});

test("DeckyHub version picker re-filters by channel and leaves the channel as it found it", async ({ page }) => {
  const stableRelease = deckyHubRelease(deckyHubTag, { publishedAt: "2026-01-01T00:00:00Z" });
  const prereleaseRelease = deckyHubRelease("v999.0.0-beta", { sha: "d", prerelease: true, publishedAt: "2026-01-02T00:00:00Z" });
  await mockDeckyHubReleases(page, [stableRelease, prereleaseRelease]);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();
  await expect(app.getByLabel("Version")).toHaveValue(deckyHubTag);

  await app.getByLabel("Update Channel").selectOption({ label: "Pre-releases" });

  await expect(app.getByLabel("Version")).toHaveValue("v999.0.0-beta");
  await expect(app.locator(".steam-modal").getByRole("button", { name: "Update to v999.0.0-beta", exact: true })).toBeVisible();
  // Pre-releases lists stable releases too, so a newer stable is never hidden.
  await expect(app.getByLabel("Version").locator(`option[value="${deckyHubTag}"]`)).toHaveCount(1);

  // changeChannel() persists to the real (shared) settings.json via the dev
  // bridge, fire-and-forget from the UI's perspective — clicking the dropdown
  // back to "Stable" wouldn't reliably outlast the test (Playwright tears the
  // page down as soon as this function returns, racing the unawaited save).
  // Round-trip the bridge directly and await it so the reset actually lands
  // before this test — and the suite — finishes.
  const { result: settings } = await bridgeCall(page, "get_settings");
  await bridgeCall(page, "save_settings", { ...settings, updateChannel: "stable" });
});

test("DeckyHub update modal's Close button is full width and dismisses the modal", async ({ page }) => {
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();

  const [closeBox, modalBox] = await Promise.all([
    app.getByRole("button", { name: "Close", exact: true }).boundingBox(),
    app.locator(".steam-modal").boundingBox(),
  ]);
  expect(closeBox).not.toBeNull();
  expect(modalBox).not.toBeNull();
  expect(closeBox!.width).toBeGreaterThanOrEqual(modalBox!.width - 48);

  await app.getByRole("button", { name: "Close", exact: true }).click();
  await expect(app.getByText("DeckyHub Update", { exact: true })).toBeHidden();
});

test("Repository pagination stays on one row", async ({ page }) => {
  await page.route("https://api.github.com/search/repositories**", (route) =>
    route.fulfill({
      json: {
        items: Array.from({ length: 6 }, (_, index) => ({
          full_name: `example/repo-${index}`,
          description: "Test repository",
          stargazers_count: index,
        })),
      },
    })
  );
  await page.goto("/?preview=/deckyhub/search&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByLabel("Search GitHub").fill("example");
  await app.getByRole("button", { name: "Search", exact: true }).click();

  const previous = app.getByRole("button", { name: "Previous", exact: true });
  const next = app.getByRole("button", { name: "Next", exact: true });
  const pageOf = app.getByText("Page 1 of 2", { exact: true });
  await expect(previous).toBeVisible();
  await expect(pageOf).toBeVisible();
  await expect(next).toBeVisible();
  const [previousBox, pageOfBox, nextBox] = await Promise.all([previous.boundingBox(), pageOf.boundingBox(), next.boundingBox()]);
  expect(Math.abs(previousBox!.y - pageOfBox!.y)).toBeLessThan(20);
  expect(Math.abs(pageOfBox!.y - nextBox!.y)).toBeLessThan(20);
  expect(pageOfBox!.x).toBeGreaterThan(previousBox!.x);
  expect(nextBox!.x).toBeGreaterThan(pageOfBox!.x);
});

test("Discover's search also matches app descriptions", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  await browseAll(page);
  const app = mock(page);
  await app.getByLabel("Search").fill("lossless scaling");

  await expect(app.getByRole("heading", { name: "MAKO Decky" })).toBeVisible();
  await expect(app.getByRole("heading", { name: "Unifideck" })).toHaveCount(0);
});

test("Discover reports an empty filtered result", async ({ page }) => {
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page);
  await app.getByLabel("Search").fill("does-not-exist");

  await expect(app.getByRole("heading", { name: "No repositories are available." })).toBeVisible();
  // Clear resets the filters straight from the empty state.
  await app.locator(".deckyhub-empty").getByRole("button", { name: "Clear", exact: true }).click();
  await expect(app.getByLabel("Search")).toHaveValue("");
  await expect(app.getByRole("heading", { name: "No repositories are available." })).toHaveCount(0);
});

test("Discover filters by category", async ({ page }) => {
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page, "MAKO");
  await app.getByLabel("Category").selectOption("Mod Managers");

  await expect(app.getByRole("heading", { name: "MAKO Decky" })).toHaveCount(0);
  await app.getByLabel("Category").selectOption("");
  await expect(app.getByRole("heading", { name: "MAKO Decky" })).toBeVisible();
});

test("Discover sorts A to Z, Z to A and by most recently added", async ({ page }) => {
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page);
  const names = () => app.locator("[data-flow-children] h3").allTextContents();
  const sorted = (list: string[]) => [...list].sort((a, b) => a.localeCompare(b));

  await expect.poll(async () => { const list = await names(); return list.length > 1 && list.join() === sorted(list).join(); }).toBe(true);
  await app.getByLabel("Sort").selectOption("za");
  await expect.poll(async () => { const list = await names(); return list.join() === sorted(list).reverse().join(); }).toBe(true);
  // Recently added: the registry only appends, so its last entry comes first.
  await app.getByLabel("Sort").selectOption("added");
  const last = (await bridgeCall(page, "get_apps")).result.apps.at(-1).name;
  await expect.poll(async () => (await names())[0]).toBe(last);
});

test("Discover shows each plugin's stats, sorts by them and counts every filter option", async ({ page }) => {
  await page.route(PLUGIN_STATS_URL, (route) => route.fulfill({ json: { generatedAt: new Date().toISOString(), plugins: {
    "eugeniosegala/mako": { downloads: 73981, stars: 680, updated: new Date().toISOString(), root: false },
    "mubaraknumann/unifideck": { downloads: 110541, stars: 1410, updated: "2024-01-01T00:00:00Z", root: true },
  } } }));
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page);
  // The two plugins with stats lead when sorting by them, so both are on page 1.
  await app.getByLabel("Sort").selectOption("downloads");
  const mako = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
  const unifideck = app.getByRole("heading", { name: "Unifideck" }).locator("..");
  await expect(mako.getByText("↓ 74K")).toBeVisible();
  await expect(mako.getByText("★ 680")).toBeVisible();
  await expect(mako.getByText("Runs as root")).toHaveCount(0);
  await expect(mako.getByText("Updated today")).toBeVisible();
  await expect(unifideck.getByText(/^Updated /)).toHaveCount(0);
  await expect(unifideck.getByText("Runs as root")).toBeVisible();
  await expect(unifideck.getByText("No release in a year")).toBeVisible();
  // The badge's tooltip doesn't show on a Deck, so Discover explains it in words.
  await expect(app.locator(".deckyhub-root-legend")).toHaveText(/Runs as root.*full access to the system/);
  await expect(app.locator(".deckyhub-total-downloads")).toHaveText("184.5K downloads");

  const order = async () => {
    const names = await app.getByRole("heading").allTextContents();
    return names.indexOf("Unifideck") - names.indexOf("MAKO Decky");
  };
  await app.getByLabel("Sort").selectOption("downloads");
  await expect.poll(order).toBeLessThan(0);
  await expect(app.getByLabel("Sort").locator("option")).toHaveText(["A to Z", "Z to A", "Most downloaded", "Most stars", "Recently updated", "Recently added"]);

  // Every option says how many cards it would show next to the other filters.
  const total = (await bridgeCall(page, "get_apps")).result.apps.length;
  await expect(app.getByLabel("Status").locator("option").first()).toHaveText(`All (${total})`);
  await expect(app.getByLabel("Category").locator("option", { hasText: "Frame Generation" })).toHaveText(/^Frame Generation \(\d+\)$/);
});

test("Discover's Then by breaks Sort's ties, and A to Z breaks the rest", async ({ page }) => {
  await page.route(PLUGIN_STATS_URL, (route) => route.fulfill({ json: { generatedAt: new Date().toISOString(), plugins: {
    "eugeniosegala/mako": { downloads: 10, stars: 500, updated: null, root: false },
    "mubaraknumann/unifideck": { downloads: 900, stars: 500, updated: null, root: false },
  } } }));
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page);
  const unifideckFirst = async () => {
    const names = await app.getByRole("heading").allTextContents();
    return names.indexOf("Unifideck") < names.indexOf("MAKO Decky");
  };

  // Same stars: the default A to Z puts MAKO Decky first, Then by downloads puts Unifideck first.
  await app.getByLabel("Sort").selectOption("stars");
  await expect(app.getByRole("heading", { name: "Unifideck" })).toBeVisible();
  await expect.poll(unifideckFirst).toBe(false);
  await app.getByLabel("Then by").selectOption("downloads");
  await expect.poll(unifideckFirst).toBe(true);
  await app.getByLabel("Then by").selectOption("za");
  await expect.poll(unifideckFirst).toBe(true);
});

test("The Manage window shows the plugin's description, details and a Repository button", async ({ page }) => {
  await page.route(PLUGIN_STATS_URL, (route) => route.fulfill({ json: { generatedAt: new Date().toISOString(), plugins: { "eugeniosegala/mako": { downloads: 73981, stars: 680, updated: "2024-01-01T00:00:00Z", root: true } } } }));
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page, "MAKO");
  await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Manage", exact: true }).click();
  await expect(app.locator(".steam-modal .deckyhub-details-description")).toHaveText("Boosts frame rates with Lossless Scaling frame generation.");
  const meta = app.locator(".steam-modal .deckyhub-details-meta");
  for (const text of ["Frame Generation", "↓ 74K", "★ 680", "Runs as root", "No release in a year"]) await expect(meta.getByText(text, { exact: true })).toBeVisible();
  // The repository sits beside the name, and the selected release's notes below the description.
  await expect(app.locator(".steam-modal").getByText("eugeniosegala/MAKO", { exact: true })).toBeVisible();
  await expect(app.locator(".steam-modal .deckyhub-details-notes")).toBeVisible();
  await expect(app.locator(".steam-modal").getByRole("button", { name: "Repository" })).toBeVisible();
});

test("A GitHub rate limit surfaces a friendly message instead of a raw status code", async ({ page }) => {
  const resetInTwoMinutes = Math.floor(Date.now() / 1000) + 120;
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) =>
    route.fulfill({
      status: 403,
      // GitHub exposes these to browsers via CORS; without this header the
      // mock's cross-origin fetch can't read them and the wait time is lost.
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetInTwoMinutes), "access-control-expose-headers": "x-ratelimit-remaining, x-ratelimit-reset" },
      json: { message: "API rate limit exceeded" },
    })
  );
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page, "MAKO");

  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await expect(makoCard.getByText(/GitHub rate limit reached./)).toBeVisible();
  await expect(makoCard.getByText("GitHub API returned 403", { exact: true })).toBeHidden();

  // Without a token, the limit also raises one header banner (even though
  // several apps hit it) that links straight to the token setting.
  const banner = app.locator(".deckyhub-rate-limit");
  await expect(banner).toHaveCount(1);
  await expect(banner.getByText("GitHub rate limit reached")).toBeVisible();
  await expect(banner.getByText(/Try again in about \d+ min\. Add a GitHub token in Settings/)).toBeVisible();

  // It follows the user to other GitHub-backed screens until dismissed.
  await app.getByRole("button", { name: "/deckyhub/repositories" }).click();
  await expect(banner).toHaveCount(1);
  await banner.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(banner).toHaveCount(0);

  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page, "MAKO");
  await expect(banner).toHaveCount(1);
  await banner.getByRole("button", { name: "Open Settings", exact: true }).click();
  await expect(app.getByText("GitHub Token")).toBeVisible();
});

test("The Quick Access rate-limit banner stacks its buttons and stays inside the panel", async ({ page }) => {
  const app = mock(page);
  await app.getByRole("button", { name: "Rate limit banner", exact: true }).click();
  const banner = app.locator(".qam-content .deckyhub-rate-limit");
  // Steam's buttons don't shrink below their label; side by side they overflowed the panel.
  await app.locator("head").evaluate((head) => head.insertAdjacentHTML("beforeend", "<style>.steam-button { min-width: 160px; white-space: nowrap; }</style>"));
  const [openSettings, dismiss, panel, box] = await Promise.all([
    banner.getByRole("button", { name: "Open Settings" }).boundingBox(),
    banner.getByRole("button", { name: "Dismiss" }).boundingBox(),
    app.locator(".qam-content").boundingBox(),
    banner.boundingBox(),
  ]);
  expect(dismiss!.y).toBeGreaterThanOrEqual(openSettings!.y + openSettings!.height);
  expect(box!.x + box!.width).toBeLessThanOrEqual(panel!.x + panel!.width);
  expect(await app.locator(".qam-content").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("The rate-limit message suggests adding a GitHub token only when none is configured", async ({ page }) => {
  const resetInTwoMinutes = Math.floor(Date.now() / 1000) + 120;
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) =>
    route.fulfill({
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetInTwoMinutes) },
      json: { message: "API rate limit exceeded" },
    })
  );

  try {
    const app = mock(page);
    await app.getByRole("button", { name: "/deckyhub/discover" }).click();
    await browseAll(page, "MAKO");
    const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
    await expect(makoCard.getByText(/Add a GitHub token in Settings/)).toBeVisible();

    // A fresh route mount re-primes the token from backend settings (same
    // mechanism proven by the "Saving a GitHub token" test below) — no
    // reload needed. 403 responses are never cached (see hydrate()'s
    // catch block), so this navigation re-fetches for real either way.
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "ghp_already_set" });
    await app.getByRole("button", { name: "/deckyhub/settings" }).click();
    await app.getByRole("button", { name: "/deckyhub/discover" }).click();
    await browseAll(page, "MAKO");

    await expect(makoCard.getByText(/GitHub rate limit reached./)).toBeVisible();
    await expect(makoCard.getByText(/Add a GitHub token in Settings/)).toBeHidden();
    await expect(app.locator(".deckyhub-rate-limit")).toHaveCount(0);
  } finally {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "" });
  }
});

test("With a token set, an empty release list is asked again without the token", async ({ page }) => {
  // GitHub sometimes answers [] to authenticated requests for repos that have releases.
  const asked: string[] = [];
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases**", (route) => {
    const authorized = Boolean(route.request().headers().authorization);
    asked.push(authorized ? "token" : "anonymous");
    return route.fulfill({ json: authorized ? [] : [makoRelease("plugin-v1.5.0", "a".repeat(64))] });
  });

  try {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "ghp_already_set" });
    await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
    const makoCard = mock(page).getByRole("heading", { name: "MAKO Decky" }).locator("..");
    await expect(makoCard.getByText("Latest: v1.5.0", { exact: true })).toBeVisible();
    expect(asked).toEqual(["token", "anonymous"]);
  } finally {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "" });
  }
});

test("An empty release list never replaces releases already seen", async ({ page }) => {
  let releases: unknown[] = [makoRelease("plugin-v1.5.0", "a".repeat(64))];
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases**", (route) => route.fulfill({ json: releases }));
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await expect(makoCard.getByText("Latest: v1.5.0", { exact: true })).toBeVisible();

  releases = [];
  const refetched = page.waitForRequest("https://api.github.com/repos/eugeniosegala/MAKO/releases**");
  await app.getByRole("button", { name: "Refresh", exact: true }).click();
  await refetched;
  await expect(makoCard.getByText("Latest: v1.5.0", { exact: true })).toBeVisible();
  await expect(makoCard.getByText("No matching release found.")).toHaveCount(0);
});

test("Settings' GitHub Access intro is a controller focus stop above the token field", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/settings&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await expect(app.getByLabel("GitHub Token")).toBeVisible();

  // Steam only scrolls to follow focus, so the intro must be focusable or the
  // controller can never scroll back up to it from the token field.
  const intro = app.locator("[tabindex]", { hasText: "Without a token, GitHub limits this device" });
  await intro.focus();
  await expect(intro).toBeFocused();
  await intro.press("ArrowDown");
  await expect(app.locator(".deckyhub-token-link")).toBeFocused();
  await app.locator(".deckyhub-token-link").press("ArrowDown");
  await expect(app.getByLabel("GitHub Token")).toBeFocused();
});

test("Settings' token link opens GitHub's token page", async ({ page, context }) => {
  await context.route("https://github.com/**", (route) => route.fulfill({ body: "tokens page" }));
  await page.goto("/?preview=/deckyhub/settings&bridge=http://127.0.0.1:8643");
  const popupPromise = page.waitForEvent("popup");
  await mock(page).locator(".deckyhub-token-link").click();
  expect((await popupPromise).url()).toBe("https://github.com/settings/tokens");
});

test("Quick Access's About thanks both plugin catalogs and links to them", async ({ page }) => {
  // Records what Steam's browser would open; real popups made this flaky on CI.
  await page.addInitScript(() => {
    const opened: string[] = [];
    Object.assign(window, { __opened: opened, open: (url: string) => void opened.push(url) });
  });
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page).locator(".qam-content");
  await expect(app.getByText(/found through two community catalogs/)).toBeVisible();
  for (const label of ["Decky Plugins Explorer by SafetZahirovic", "Decky Extended Plugins by beallio", "DeckyHub on GitHub"]) {
    await app.getByRole("button", { name: label, exact: true }).click();
  }
  await expect.poll(() => pluginFrame(page).evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual([
    "https://github.com/SafetZahirovic/decky-plugins-explorer",
    "https://github.com/beallio/decky-plugins-extended",
    "https://github.com/mazillka/deckyhub-plugin",
  ]);
});

test("An outdated Decky plugin's card offers Update and hands it to Decky's installer", async ({ page }) => {
  // dev-server.py scans .dev-data/plugins/*/plugin.json as the installed
  // Decky plugins, so seed an old MAKO there for the length of this test.
  const pluginDir = new URL("../.dev-data/plugins/e2e-mako/", import.meta.url);
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(new URL("plugin.json", pluginDir), JSON.stringify({ name: "MAKO - Frame Generation", version: "1.0.0" }));
  const sha256 = "c".repeat(64);
  const url = "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.2.3/mako-decky.zip";
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", sha256)]);
  // Stand-in for Decky Loader's own WS bridge: records install requests.
  await recordInstalls(page);

  try {
    await page.goto("/?preview=/deckyhub/updates&bridge=http://127.0.0.1:8643");
    const app = mock(page);
    const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
    await makoCard.getByRole("button", { name: "Update to v1.2.3", exact: true }).click();
    await acceptDisclaimer(page, "Update to v1.2.3");
    // Decky's own dialog takes over, so the page is left.
    await expect(mock(page).locator(".qam-content")).toBeVisible();

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
    await expect.poll(() => frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([
      ["utilities/install_plugin", localZip(url), "MAKO - Frame Generation", "1.2.3", sha256, 2],
    ]);
  } finally {
    // Retries: on Windows the bridge's plugin scan can briefly lock the folder.
    rmSync(pluginDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

// Every install first shows DeckyHub's no-responsibility disclaimer.
async function acceptDisclaimer(page: Page, label: string) {
  const confirm = mock(page).locator(".steam-modal", { hasText: "Install at your own risk." });
  await confirm.getByRole("button", { name: label, exact: true }).click();
}

test("Menu on an Install button opens the plugin's GitHub page", async ({ page, context }) => {
  await context.route("https://github.com/**", (route) => route.fulfill({ body: "repo page" }));
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", "e".repeat(64))]);
  await recordInstalls(page);
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const card = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");

  // On the card.
  const install = card.getByRole("button", { name: "Install v1.2.3", exact: true });
  await install.focus();
  await expect(app.locator(".steam-legend")).toContainText("☰ Repository");
  let popupPromise = page.waitForEvent("popup");
  await install.press("m");
  let popup = await popupPromise;
  expect(popup.url()).toBe("https://github.com/eugeniosegala/MAKO");
  await popup.close();

  // In the Manage window, which closes first so the page isn't opened underneath it.
  await card.getByRole("button", { name: "Manage", exact: true }).click();
  const modalInstall = app.locator(".steam-modal").getByRole("button", { name: /^Install/ }).first();
  await modalInstall.focus();
  popupPromise = page.waitForEvent("popup");
  await modalInstall.press("m");
  popup = await popupPromise;
  expect(popup.url()).toBe("https://github.com/eugeniosegala/MAKO");
  await expect(app.locator(".steam-modal")).toHaveCount(0);
  // Menu only opens the page; nothing is installed.
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
  expect(await frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([]);
});

test("Y on a card's Install button shows the release notes and the bottom bar names it", async ({ page }) => {
  await mockMakoReleases(page, [{ ...makoRelease("plugin-v1.2.3", "e".repeat(64)), body: "Faster frame pacing." }]);
  await recordInstalls(page);
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const install = app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Install v1.2.3", exact: true });
  await install.focus();
  await expect(app.locator(".steam-legend")).toContainText("Ⓨ Release Info");
  await install.press("y");

  const info = app.locator(".steam-modal", { hasText: "MAKO Decky v1.2.3" });
  await expect(info.getByText("Faster frame pacing.")).toBeVisible();
  // Y only shows the notes; nothing is installed.
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
  expect(await frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([]);
});

test("Nothing is installed until the disclaimer is accepted", async ({ page }) => {
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", "e".repeat(64))]);
  await recordInstalls(page);
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Install v1.2.3", exact: true }).click();
  const confirm = app.locator(".steam-modal", { hasText: "isn't responsible for anything" });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();

  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
  expect(await frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([]);
  await expect(app.getByRole("heading", { name: "MAKO Decky" })).toBeVisible();
});

test("The Manage window offers Install for a Decky plugin that isn't installed yet", async ({ page }) => {
  const sha256 = "d".repeat(64);
  const url = "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.2.3/mako-decky.zip";
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", sha256)]);
  await recordInstalls(page);
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await makoCard.getByRole("button", { name: "Manage", exact: true }).click();
  const modal = app.locator(".steam-modal");
  // Every version shows as v*.*.*, whatever the tag's prefix.
  await expect(modal.getByLabel("Version").locator("option")).toHaveText(["v1.2.3 (latest)"]);
  await expect(modal.getByRole("button", { name: "Update", exact: true })).toHaveCount(0);
  await modal.getByRole("button", { name: "Install v1.2.3", exact: true }).click();
  await acceptDisclaimer(page, "Install v1.2.3");
  // Decky's own dialog takes over, so the page is left.
  await expect(mock(page).locator(".qam-content")).toBeVisible();

  // A fresh install is named after the registry's first detection name, the
  // plugin's own manifest name, with Decky's INSTALL (0) type.
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
  await expect.poll(() => frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([
    ["utilities/install_plugin", localZip(url), "MAKO - Frame Generation", "1.2.3", sha256, 0],
  ]);
});

test("Search shows only Decky plugins, under a warning", async ({ page }) => {
  let query = "";
  await page.route("https://api.github.com/search/repositories**", (route) => {
    query = new URL(route.request().url()).searchParams.get("q") ?? "";
    return route.fulfill({ json: { items: [{ full_name: "example/plugin" }, { full_name: "example/awesome-list" }] } });
  });
  await page.route("https://raw.githubusercontent.com/example/awesome-list/HEAD/plugin.json", (route) => route.fulfill({ status: 404, body: "404: Not Found" }));
  await page.goto("/?preview=/deckyhub/search&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await expect(app.getByText(/Nobody has reviewed them/)).toBeVisible();
  await app.getByLabel("Search GitHub").fill("frame");
  await app.getByRole("button", { name: "Search", exact: true }).click();

  await expect(app.getByRole("heading", { name: "example/plugin" })).toBeVisible();
  await expect(app.getByRole("heading", { name: "example/awesome-list" })).toHaveCount(0);
  expect(query).toBe("frame decky in:name,description,topics,readme");
});

test("Search installs a plugin straight from its GitHub release", async ({ page }) => {
  const sha256 = "e".repeat(64);
  const url = "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.2.3/mako-decky.zip";
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", sha256)]);
  await page.route("https://api.github.com/search/repositories**", (route) =>
    route.fulfill({ json: { items: [{ full_name: "eugeniosegala/MAKO", description: "Frame generation", stargazers_count: 1 }] } }),
  );
  await recordInstalls(page);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Search", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Search & Install", exact: true })).toBeVisible();
  await app.getByLabel("Search GitHub").fill("mako");
  await app.getByRole("button", { name: "Search", exact: true }).click();
  // Already in DeckyHub's list, so Add shows as done; Install still works.
  await expect(app.getByRole("button", { name: "Added", exact: true })).toBeDisabled();
  await app.getByRole("button", { name: "Install", exact: true }).click();
  await acceptDisclaimer(page, "Install v1.2.3");

  await expect.poll(() => pluginFrame(page).evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([
    ["utilities/install_plugin", localZip(url), "MAKO - Frame Generation", "1.2.3", sha256, 0],
  ]);
});

test("Cancelling a search result's install leaves its repo untracked", async ({ page }) => {
  const repo = "e2e-cancel/plugin";
  await page.route("https://api.github.com/search/repositories**", (route) => route.fulfill({ json: { items: [{ full_name: repo, description: "Test repository", stargazers_count: 1 }] } }));
  await page.route(`https://raw.githubusercontent.com/${repo}/HEAD/plugin.json`, (route) => route.fulfill({ json: { name: "E2E Cancel" } }));
  await page.route(`https://api.github.com/repos/${repo}/releases**`, (route) =>
    route.fulfill({ json: [{ ...makoRelease("v1.0.0", "e".repeat(64)), assets: [{ name: "plugin.zip", browser_download_url: `https://github.com/${repo}/releases/download/v1.0.0/plugin.zip`, size: 1024 }] }] }),
  );
  await recordInstalls(page);
  await page.goto("/?preview=/deckyhub/search&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  try {
    await app.getByLabel("Search GitHub").fill("plugin");
    await app.getByRole("button", { name: "Search", exact: true }).click();
    const card = app.getByRole("heading", { name: repo }).locator("..");
    await card.getByRole("button", { name: "Install", exact: true }).click();
    await app.locator(".steam-modal", { hasText: "Install at your own risk." }).getByRole("button", { name: "Cancel", exact: true }).click();

    // A fresh search reads the tracked list again, and the repo isn't on it.
    await app.getByRole("button", { name: "Search", exact: true }).click();
    await expect(card.getByRole("button", { name: "Add", exact: true })).toBeEnabled();
    expect((await bridgeCall(page, "get_settings")).result.customRepos).not.toContain(repo);
  } finally {
    await bridgeCall(page, "remove_custom_repo", repo);
  }
});

test("Y and X on a search result's Install show the release notes and download the ZIP", async ({ page }) => {
  await mockMakoReleases(page, [{ ...makoRelease("plugin-v1.2.3", "e".repeat(64)), body: "Faster frame pacing." }]);
  await page.route("https://api.github.com/search/repositories**", (route) =>
    route.fulfill({ json: { items: [{ full_name: "eugeniosegala/MAKO", description: "Frame generation", stargazers_count: 1 }] } }),
  );
  await recordInstalls(page);
  await page.goto("/?preview=/deckyhub/search&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByLabel("Search GitHub").fill("mako");
  await app.getByRole("button", { name: "Search", exact: true }).click();
  const install = app.getByRole("button", { name: "Install", exact: true });
  await install.focus();
  await expect(app.locator(".steam-legend")).toContainText("Ⓨ Release Info");
  await expect(app.locator(".steam-legend")).toContainText("Ⓧ Download ZIP");

  await install.press("y");
  await expect(app.locator(".steam-modal", { hasText: "MAKO Decky v1.2.3" }).getByText("Faster frame pacing.")).toBeVisible();
  await page.reload();
  await app.getByLabel("Search GitHub").fill("mako");
  await app.getByRole("button", { name: "Search", exact: true }).click();
  await install.press("x");
  await expect(app.locator(".steam-modal", { hasText: "mako-decky.zip" })).toBeVisible();
  // Neither key installs anything.
  expect(await pluginFrame(page).evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([]);
});

test("Release checks read the registry's release index instead of the GitHub API", async ({ page }) => {
  let apiCalls = 0;
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases**", (route) => {
    apiCalls++;
    return route.fulfill({ json: [makoRelease("plugin-v1.0.0", "a".repeat(64))] });
  });
  await page.route(RELEASE_INDEX_URL, (route) =>
    // A day old still counts: GitHub skips the index job's scheduled runs for hours at a time.
    route.fulfill({ json: { generatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), releases: { "eugeniosegala/mako": [makoRelease("plugin-v7.7.7", "f".repeat(64))] } } }),
  );
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const makoCard = mock(page).getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await expect(makoCard.getByRole("button", { name: "Install v7.7.7", exact: true })).toBeVisible();
  expect(apiCalls).toBe(0);
  // Index answers aren't copied into localStorage (they'd fill most of its quota).
  expect(await pluginFrame(page).evaluate(() => localStorage.getItem("deckyhub-releases:eugeniosegala/MAKO"))).toBeNull();
});

test("A newer release without the plugin's ZIP is skipped for the last one that has it", async ({ page }) => {
  await mockMakoReleases(page, [
    { tag_name: "windows-v9.0.0", prerelease: false, draft: false, published_at: "2026-02-01T00:00:00Z", html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/windows-v9.0.0",
      assets: [{ name: "mako-windows.exe", browser_download_url: "https://github.com/eugeniosegala/MAKO/releases/download/windows-v9.0.0/mako-windows.exe", size: 1024 }] },
    makoRelease("plugin-v1.2.3", "a".repeat(64)),
  ]);
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  await browseAll(page, "MAKO");
  const makoCard = mock(page).getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await expect(makoCard.getByRole("button", { name: "Install v1.2.3", exact: true })).toBeVisible();
  await expect(makoCard.getByText(/No release|windows/i)).toHaveCount(0);
});

test("A stale release index is ignored in favour of the GitHub API", async ({ page }) => {
  await mockMakoReleases(page, [makoRelease("plugin-v1.0.0", "a".repeat(64))]);
  await page.route(RELEASE_INDEX_URL, (route) =>
    route.fulfill({ json: { generatedAt: "2026-01-01T00:00:00Z", releases: { "eugeniosegala/mako": [makoRelease("plugin-v7.7.7", "f".repeat(64))] } } }),
  );
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const makoCard = mock(page).getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await expect(makoCard.getByRole("button", { name: "Install v1.0.0", exact: true })).toBeVisible();
});

test("The download window spins until Decky's own install dialog is up", async ({ page }) => {
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", "a".repeat(64))]);
  await recordInstalls(page);
  await page.addInitScript(() => {
    const target = window as unknown as { __holdInstall: Promise<void>; __releaseInstall: () => void };
    target.__holdInstall = new Promise((resolve) => (target.__releaseInstall = resolve));
  });
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const makoCard = mock(page).getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await makoCard.getByRole("button", { name: "Install v1.2.3", exact: true }).click();
  await acceptDisclaimer(page, "Install v1.2.3");

  const preparing = mock(page).getByText("Preparing install…");
  await expect(preparing).toBeVisible();
  await pluginFrame(page).evaluate(() => (window as unknown as { __releaseInstall: () => void }).__releaseInstall());
  await expect(preparing).toHaveCount(0);
});

test("Discover's card installs the latest release of a Decky plugin that isn't installed yet", async ({ page }) => {
  const sha256 = "a".repeat(64);
  const url = "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.2.3/mako-decky.zip";
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", sha256)]);
  await recordInstalls(page);
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const makoCard = mock(page).getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await makoCard.getByRole("button", { name: "Install v1.2.3", exact: true }).click();
  await acceptDisclaimer(page, "Install v1.2.3");
  // Decky's own dialog takes over, so the page is left.
  await expect(mock(page).locator(".qam-content")).toBeVisible();

  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
  await expect.poll(() => frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([
    ["utilities/install_plugin", localZip(url), "MAKO - Frame Generation", "1.2.3", sha256, 0],
  ]);
});

test("A release without a GitHub checksum installs with an empty hash", async ({ page }) => {
  const url = "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.2.3/mako-decky.zip";
  const { digest: _, ...asset } = makoRelease("plugin-v1.2.3", "").assets[0];
  await mockMakoReleases(page, [{ ...makoRelease("plugin-v1.2.3", ""), assets: [asset] }]);
  await recordInstalls(page);
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const makoCard = mock(page).getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await makoCard.getByRole("button", { name: "Install v1.2.3", exact: true }).click();
  await acceptDisclaimer(page, "Install v1.2.3");

  // Decky Loader skips its SHA-256 check when the hash is empty.
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
  await expect.poll(() => frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([
    ["utilities/install_plugin", localZip(url), "MAKO - Frame Generation", "1.2.3", "", 0],
  ]);
});

test("The Manage window reinstalls or downgrades an installed Decky plugin to the selected version", async ({ page }) => {
  const pluginDir = new URL("../.dev-data/plugins/e2e-mako/", import.meta.url);
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(new URL("plugin.json", pluginDir), JSON.stringify({ name: "MAKO - Frame Generation", version: "1.2.3" }));
  const sha = "b".repeat(64);
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", sha, "02"), makoRelease("plugin-v1.0.0", sha, "01")]);
  await recordInstalls(page);

  try {
    await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
    const app = mock(page);
    const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
    // Absence checks pass on a card whose release hasn't loaded yet, so wait for it first.
    await expect(makoCard.getByText(/^Latest: /)).not.toHaveText("Latest: —");
    await expect(makoCard.getByRole("button", { name: /^Install v/ })).toHaveCount(0);
    // Up to date, so the card offers no Update either.
    await expect(makoCard.getByRole("button", { name: /^Update to v/ })).toHaveCount(0);
    await makoCard.getByRole("button", { name: "Manage", exact: true }).click();
    const modal = app.locator(".steam-modal");
    await expect(modal.getByRole("button", { name: "Reinstall v1.2.3", exact: true })).toBeVisible();

    await modal.getByLabel("Version").selectOption({ label: "v1.0.0" });
    await modal.getByRole("button", { name: "Downgrade to v1.0.0", exact: true }).click();
    await acceptDisclaimer(page, "Downgrade to v1.0.0");

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
    await expect.poll(() => frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls)).toEqual([
      ["utilities/install_plugin", localZip("https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.0.0/mako-decky.zip"), "MAKO - Frame Generation", "1.0.0", sha, 3],
    ]);
  } finally {
    rmSync(pluginDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("Unifideck updates by uninstalling first and installing fresh, after a warning", async ({ page }) => {
  // Decky's in-place update starts Unifideck mid-install and then stops it,
  // which froze the Deck, so DeckyHub removes it first and installs fresh (0).
  const pluginDir = new URL("../.dev-data/plugins/e2e-unifideck/", import.meta.url);
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(new URL("plugin.json", pluginDir), JSON.stringify({ name: "Unifideck", version: "0.7.0" }));
  const sha = "f".repeat(64);
  const url = "https://github.com/mubaraknumann/unifideck/releases/download/Release-0.7.6/unifideck.prod.v0.7.6.zip";
  await page.route("https://api.github.com/repos/mubaraknumann/unifideck/releases**", (route) =>
    route.fulfill({ json: [{ tag_name: "Release-0.7.6", prerelease: false, draft: false, published_at: "2026-10-04T00:00:00Z", html_url: "https://github.com/mubaraknumann/unifideck/releases/tag/Release-0.7.6", assets: [{ name: "unifideck.prod.v0.7.6.zip", browser_download_url: url, size: 1024, digest: `sha256:${sha}` }] }] }),
  );
  await recordInstalls(page);

  try {
    await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
    const app = mock(page);
    // The card's quick Update goes through the same warning as the Manage window's.
    await app.getByRole("heading", { name: "Unifideck" }).locator("..").getByRole("button", { name: "Update to v0.7.6", exact: true }).click();

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
    const calls = () => frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls);
    // Nothing reaches Decky until the uninstall-first warning is confirmed.
    const confirm = app.locator(".steam-modal", { hasText: "Update to v0.7.6?" });
    await expect(confirm.getByText("removes the installed version first", { exact: false })).toBeVisible();
    expect(await calls()).toEqual([]);
    await confirm.getByRole("button", { name: "Update to v0.7.6", exact: true }).click();

    await expect.poll(calls).toEqual([
      ["utilities/uninstall_plugin", "Unifideck"],
      ["utilities/install_plugin", localZip(url), "Unifideck", "0.7.6", sha, 0],
    ]);
  } finally {
    rmSync(pluginDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("Update All sends every outdated Decky plugin to Decky's installer in one request, leaving fresh-install ones out", async ({ page }) => {
  const plugins = { "e2e-mako": ["MAKO - Frame Generation", "1.0.0"], "e2e-lsfg": ["Decky LSFG-VK", "0.1.0"], "e2e-unifideck": ["Unifideck", "0.7.0"] };
  const dirs = Object.entries(plugins).map(([dir, [name, version]]) => {
    const pluginDir = new URL(`../.dev-data/plugins/${dir}/`, import.meta.url);
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(new URL("plugin.json", pluginDir), JSON.stringify({ name, version }));
    return pluginDir;
  });
  const sha = "9".repeat(64);
  const releaseOf = (repo: string, tag: string, file: string) => ({
    tag_name: tag, prerelease: false, draft: false, published_at: "2026-10-01T00:00:00Z", html_url: `https://github.com/${repo}/releases/tag/${tag}`,
    assets: [{ name: file, browser_download_url: `https://github.com/${repo}/releases/download/${tag}/${file}`, size: 1024, digest: `sha256:${sha}` }],
  });
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", sha)]);
  await page.route("https://api.github.com/repos/xXJSONDeruloXx/decky-lsfg-vk/releases**", (route) => route.fulfill({ json: [releaseOf("xXJSONDeruloXx/decky-lsfg-vk", "v0.2.0", "decky-lsfg-vk.zip")] }));
  await page.route("https://api.github.com/repos/mubaraknumann/unifideck/releases**", (route) => route.fulfill({ json: [releaseOf("mubaraknumann/unifideck", "Release-0.7.6", "unifideck.zip")] }));
  await recordInstalls(page);

  try {
    await page.goto("/?preview=/deckyhub/updates&bridge=http://127.0.0.1:8643");
    const app = mock(page);
    await expect(app.getByRole("heading", { name: "Unifideck" })).toBeVisible();
    await app.getByRole("button", { name: "Update All (2)", exact: true }).click();
    await acceptDisclaimer(page, "Update All (2)");
    // Decky's own dialog takes over, so the page is left.
    await expect(mock(page).locator(".qam-content")).toBeVisible();

    const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
    const calls = () => frame.evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls);
    await expect.poll(calls).toHaveLength(1);
    const [[route, requests]] = (await calls()) as [string, { artifact: string; name: string; version: string; install_type: number }[]][];
    expect(route).toBe("utilities/install_plugins");
    expect(requests.map(({ artifact, name, version, install_type }) => [name, version, install_type, artifact]).sort()).toEqual([
      ["Decky LSFG-VK", "0.2.0", 2, localZip("decky-lsfg-vk.zip")],
      ["MAKO - Frame Generation", "1.2.3", 2, localZip("mako-decky.zip")],
    ]);
  } finally {
    for (const pluginDir of dirs) rmSync(pluginDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("Display Settings can hide the Manage window's buttons", async ({ page }) => {
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", "e".repeat(64))]);
  const app = mock(page);
  const openManage = async () => {
    await app.getByRole("button", { name: "/deckyhub/discover" }).click();
    await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Manage", exact: true }).click();
    return app.locator(".steam-modal");
  };

  try {
    // settings.json is shared with any interactive mock session; start clean.
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "" });
    let modal = await openManage();
    for (const name of ["Install v1.2.3", "Download ZIP", "Release Page"]) await expect(modal.getByRole("button", { name, exact: true })).toBeVisible();
    await modal.getByRole("button", { name: "Close", exact: true }).click();

    await app.getByRole("button", { name: "/deckyhub/settings" }).click();
    for (const name of ["Download ZIP", "Install", "Release Page"]) await app.getByText(`Hide “${name}”`, { exact: true }).click();
    await expect(app.getByLabel("Hide “Release Page”")).toBeChecked();

    modal = await openManage();
    await expect(modal.getByLabel("Version").locator("option").first()).toBeAttached();
    for (const name of ["Install v1.2.3", "Download ZIP", "Release Page"]) await expect(modal.getByRole("button", { name, exact: true })).toHaveCount(0);
    await modal.getByRole("button", { name: "Close", exact: true }).click();

    // DeckyHub's own update window honours the same toggles ("Hide Update"
    // covers its Update/Reinstall/Downgrade button).
    await app.getByRole("button", { name: "/deckyhub/settings" }).click();
    await app.getByText("Hide “Update”", { exact: true }).click();
    await expect(app.getByLabel("Hide “Update”")).toBeChecked();
    await app.getByRole("button", { name: "Quick Access widget" }).click();
    await expect(app.locator(".qam-content").getByRole("button", { name: /^Update to v/ })).toHaveCount(0);
    await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();
    modal = app.locator(".steam-modal");
    await expect(modal.getByLabel("Version").locator("option").first()).toBeAttached();
    await expect(modal.getByRole("button", { name: /^(Update to|Reinstall|Downgrade to|Download ZIP|Release Page)/ })).toHaveCount(0);
  } finally {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "" });
  }
});

test("The Manage window uninstalls an installed Decky plugin after confirming", async ({ page }) => {
  const pluginDir = new URL("../.dev-data/plugins/e2e-mako-uninstall/", import.meta.url);
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(new URL("plugin.json", pluginDir), JSON.stringify({ name: "MAKO - Frame Generation", version: "1.0.0" }));
  // Stand-in for Decky Loader's WS bridge: records calls without deleting anything.
  await page.addInitScript(() => {
    const calls: unknown[][] = [];
    Object.assign(window, { __loaderCalls: calls, DeckyBackend: { call: async (...args: unknown[]) => void calls.push(args), addEventListener() {}, removeEventListener() {} } });
  });

  try {
    await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
    await browseAll(page, "MAKO");
    const app = mock(page);
    await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Manage", exact: true }).click();
    await app.locator(".steam-modal").getByRole("button", { name: "Uninstall", exact: true }).click();

    // Decky Loader deletes without asking, so DeckyHub confirms first.
    const confirm = app.locator(".steam-modal", { hasText: "Uninstall MAKO Decky?" });
    await expect(confirm.getByText("This removes the plugin and its settings from this device.", { exact: false })).toBeVisible();
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame())!;
    const calls = () => frame.evaluate(() => (window as unknown as { __loaderCalls: unknown[][] }).__loaderCalls);
    expect(await calls()).toEqual([]);
    await confirm.getByRole("button", { name: "Uninstall", exact: true }).click();

    await expect.poll(calls).toEqual([["utilities/uninstall_plugin", "MAKO - Frame Generation"]]);
  } finally {
    // Retries: on Windows the bridge's plugin scan can briefly lock the folder.
    rmSync(pluginDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("Release Page closes the Manage window before opening the page", async ({ page, context }) => {
  await context.route("https://github.com/**", (route) => route.fulfill({ body: "release page" }));
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page, "MAKO");
  await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Manage", exact: true }).click();
  const popupPromise = page.waitForEvent("popup");
  await app.locator(".steam-modal").getByRole("button", { name: "Release Page", exact: true }).click();

  // Steam's browser would otherwise open underneath the still-open modal.
  expect((await popupPromise).url()).toBe(release.html_url);
  await expect(app.locator(".steam-modal")).toHaveCount(0);
});

test("Compact interface shrinks DeckyHub's buttons and spacing, Default restores them", async ({ page }) => {
  const app = mock(page);
  const minHeight = (locator: ReturnType<typeof app.locator>) => locator.evaluate((el) => getComputedStyle(el).minHeight);
  try {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "" });
    await app.getByRole("button", { name: "/deckyhub/settings" }).click();
    const save = app.getByRole("button", { name: "Save Settings", exact: true });
    await expect.poll(() => minHeight(save)).toBe("40px");

    await app.getByLabel("Interface").selectOption({ label: "Compact" });
    await expect.poll(() => minHeight(save)).toBe("28px");

    // Modals follow too: they render in the same document as the variables.
    await app.getByRole("button", { name: "/deckyhub/discover" }).click();
    await browseAll(page, "MAKO");
    await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Manage", exact: true }).click();
    const close = app.locator(".steam-modal").getByRole("button", { name: "Close", exact: true });
    await expect.poll(() => minHeight(close)).toBe("28px");
    await close.click();

    await app.getByRole("button", { name: "/deckyhub/settings" }).click();
    await app.getByLabel("Interface").selectOption({ label: "Default" });
    await expect.poll(() => minHeight(app.getByRole("button", { name: "Save Settings", exact: true }))).toBe("40px");
  } finally {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "" });
  }
});

test("Settings shows how many GitHub requests are left", async ({ page }) => {
  const resetInTenMinutes = Math.floor(Date.now() / 1000) + 600;
  await page.route("https://api.github.com/rate_limit", (route) =>
    route.fulfill({ json: { resources: { core: { limit: 60, remaining: 42, reset: resetInTenMinutes }, search: { limit: 10, remaining: 10, reset: resetInTenMinutes } } } })
  );
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/settings" }).click();

  await expect(app.locator(".deckyhub-github-quota")).toHaveText(/^GitHub requests left: 42 of 60 \(resets in (10|11) min\)$/);
});

test("Discover's Details modal exposes every matching release asset", async ({ page }) => {
  const multiAssetRelease = {
    tag_name: "plugin-v1.2.3",
    prerelease: false,
    draft: false,
    html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/plugin-v1.2.3",
    assets: Array.from({ length: 5 }, (_, index) => ({
      name: `mako-decky-${index + 1}.zip`,
      browser_download_url: `https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.2.3/mako-decky-${index + 1}.zip`,
      size: 1024,
    })),
  };
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) => route.fulfill({ json: [multiAssetRelease] }));
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page, "MAKO");

  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await makoCard.getByRole("button", { name: "Manage", exact: true }).click();

  const modal = app.locator(".steam-modal");
  await expect(modal.getByRole("button", { name: "Download ZIP", exact: true })).toBeVisible();
  await expect(modal.getByRole("button", { name: "mako-decky-5.zip (1 KB)" })).toBeVisible();
});

test("Reopening Details within the cache window doesn't re-fetch its release list", async ({ page }) => {
  let requests = 0;
  const release = {
    tag_name: "plugin-v1.2.3",
    prerelease: false,
    draft: false,
    html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/plugin-v1.2.3",
    assets: [{ name: "mako-decky-1.zip", browser_download_url: "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.2.3/mako-decky-1.zip", size: 1024 }],
  };
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) => {
    requests++;
    return route.fulfill({ json: [release] });
  });
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page, "MAKO");
  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");

  await makoCard.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(app.locator(".steam-modal").getByRole("button", { name: "Download ZIP", exact: true })).toBeVisible();
  await app.locator(".steam-modal").getByRole("button", { name: "Close", exact: true }).click();

  // The card (hydrate) and the modal (listAppReleases) share fetchReleases()'s
  // per-repo cache, so the whole flow costs one request — and reopening the
  // modal adds none while it's still within CACHE_TTL.
  const requestsAfterFirstOpen = requests;
  expect(requestsAfterFirstOpen).toBe(1);
  await makoCard.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(app.locator(".steam-modal").getByRole("button", { name: "Download ZIP", exact: true })).toBeVisible();

  expect(requests).toBe(requestsAfterFirstOpen);
});

const makoReleases = [
  {
    tag_name: "plugin-v1.3.0",
    published_at: "2026-01-02T00:00:00Z",
    prerelease: false,
    draft: false,
    html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/plugin-v1.3.0",
    assets: [{ name: "mako-decky-1.zip", browser_download_url: "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.3.0/mako-decky-1.zip", size: 2048 }],
  },
  {
    tag_name: "plugin-v1.2.3",
    published_at: "2026-01-01T00:00:00Z",
    prerelease: false,
    draft: false,
    html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/plugin-v1.2.3",
    assets: [{ name: "mako-decky-1.zip", browser_download_url: "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.2.3/mako-decky-1.zip", size: 1024 }],
  },
  {
    tag_name: "plugin-v1.4.0-beta",
    published_at: "2026-01-03T00:00:00Z",
    prerelease: true,
    draft: false,
    html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/plugin-v1.4.0-beta",
    assets: [{ name: "mako-decky-1.zip", browser_download_url: "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.4.0-beta/mako-decky-1.zip", size: 4096 }],
  },
];

test("Discover's Details modal lists versions for the selected channel", async ({ page }) => {
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) => route.fulfill({ json: makoReleases }));
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await makoCard.getByRole("button", { name: "Manage", exact: true }).click();

  // Every card on the page also has its own "Installed: —" line, so scope
  // assertions to the modal itself rather than the whole (iframe) document.
  const modal = app.locator(".steam-modal");
  await expect(modal.getByText("Installed: —", { exact: true })).toBeVisible();
  await expect(modal.getByLabel("Version")).toHaveValue("plugin-v1.3.0");
  await expect(modal.getByRole("button", { name: "Download ZIP", exact: true })).toBeVisible();
  await expect(modal.getByRole("button", { name: "Release Page", exact: true })).toBeVisible();

  await modal.getByLabel("Version").selectOption({ label: "v1.2.3" });
  await expect(modal.getByLabel("Version")).toHaveValue("plugin-v1.2.3");

  await modal.getByRole("button", { name: "Close", exact: true }).click();
  await expect(modal).toBeHidden();
});

test("Discover's Details modal channel picker updates the card's Channel label", async ({ page }) => {
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) => route.fulfill({ json: makoReleases }));
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");

  // Stable is the default, so the card only names the channel once it's overridden.
  await expect(makoCard.getByText(/^Latest: v/)).toBeVisible();
  await expect(makoCard.getByText(/^Channel: /)).toHaveCount(0);

  try {
    await makoCard.getByRole("button", { name: "Manage", exact: true }).click();
    await app.getByLabel("Update Channel").selectOption({ label: "Pre-releases" });
    await expect(app.getByLabel("Version")).toHaveValue("plugin-v1.4.0-beta");

    await app.getByRole("button", { name: "Close", exact: true }).click();
    await expect(makoCard.getByText("Channel: Pre-release", { exact: true })).toBeVisible();
  } finally {
    // save_repo_settings persists to the real (shared) settings.json via the
    // dev bridge — round-trip it back to the default directly so this test
    // doesn't leave MAKO's channel overridden for later tests/runs.
    await bridgeCall(page, "save_repo_settings", "eugeniosegala/MAKO", { channel: "stable" });
  }
});

test("Discover's card picks the newest pre-release by publish date, not array order", async ({ page }) => {
  // Regression test for the same GitHub list-order bug as the DeckyHub
  // version-picker fix, but for hydrate() — the function driving every
  // card's own "Latest: …" line and update status, not just a picker. The
  // mock deliberately puts the truly-newest pre-release second in the
  // array to reproduce GitHub returning the list out of order.
  const olderBeta = {
    tag_name: "plugin-v1.4.0-beta.1",
    prerelease: true,
    draft: false,
    published_at: "2026-01-01T00:00:00Z",
    html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/plugin-v1.4.0-beta.1",
    assets: [{ name: "mako-decky-1.zip", browser_download_url: "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.4.0-beta.1/mako-decky-1.zip", size: 1024 }],
  };
  const newerBeta = {
    tag_name: "plugin-v1.4.0-beta.2",
    prerelease: true,
    draft: false,
    published_at: "2026-01-02T00:00:00Z",
    html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/plugin-v1.4.0-beta.2",
    assets: [{ name: "mako-decky-1.zip", browser_download_url: "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.4.0-beta.2/mako-decky-1.zip", size: 1024 }],
  };
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) =>
    // Out-of-order on purpose: the newest pre-release (by published_at) isn't array[0].
    route.fulfill({ json: [olderBeta, newerBeta] })
  );
  await bridgeCall(page, "save_repo_settings", "eugeniosegala/MAKO", { channel: "prerelease" });
  try {
    await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
    const app = mock(page);
    const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
    await expect(makoCard.getByText("Latest: v1.4.0-beta.2", { exact: true })).toBeVisible();
  } finally {
    await bridgeCall(page, "save_repo_settings", "eugeniosegala/MAKO", { channel: "stable" });
  }
});

test("A card on the pre-release channel picks a stable release newer than its pre-releases", async ({ page }) => {
  const beta = makoRelease("plugin-v1.4.0-beta.1", "a".repeat(64), "01");
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) =>
    route.fulfill({ json: [{ ...beta, prerelease: true }, makoRelease("plugin-v1.4.0", "b".repeat(64), "02")] }),
  );
  await bridgeCall(page, "save_repo_settings", "eugeniosegala/MAKO", { channel: "prerelease" });
  try {
    await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
    const makoCard = mock(page).getByRole("heading", { name: "MAKO Decky" }).locator("..");
    await expect(makoCard.getByText("Latest: v1.4.0", { exact: true })).toBeVisible();
  } finally {
    await bridgeCall(page, "save_repo_settings", "eugeniosegala/MAKO", { channel: "stable" });
  }
});

test("A newer pre-release of an installed pre-release counts as an update", async ({ page }) => {
  // Regression: only the numeric part used to be compared, so rc.1 → rc.2 was "Up To Date".
  const pluginDir = new URL("../.dev-data/plugins/e2e-mako-rc/", import.meta.url);
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(new URL("plugin.json", pluginDir), JSON.stringify({ name: "MAKO - Frame Generation", version: "1.4.0-rc.1" }));
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) =>
    route.fulfill({ json: [{ tag_name: "plugin-v1.4.0-rc.2", prerelease: true, draft: false, published_at: "2026-01-02T00:00:00Z", html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/plugin-v1.4.0-rc.2", assets: makoRelease("plugin-v1.4.0-rc.2", "b".repeat(64)).assets }] })
  );
  await bridgeCall(page, "save_repo_settings", "eugeniosegala/MAKO", { channel: "prerelease" });
  try {
    await page.goto("/?preview=/deckyhub/updates&bridge=http://127.0.0.1:8643");
    const makoCard = mock(page).getByRole("heading", { name: "MAKO Decky" }).locator("..");
    await expect(makoCard.getByText("Update Available", { exact: true })).toBeVisible();
  } finally {
    await bridgeCall(page, "save_repo_settings", "eugeniosegala/MAKO", { channel: "stable" });
    rmSync(pluginDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("A failed release check falls back to the cached releases", async ({ page }) => {
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page, "MAKO");
  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await expect(makoCard.getByText("Latest: v1.2.3", { exact: true })).toBeVisible();

  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) =>
    route.fulfill({ status: 403, headers: { "x-ratelimit-remaining": "0" }, json: { message: "API rate limit exceeded" } })
  );
  await app.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(app.locator(".deckyhub-rate-limit")).toHaveCount(1);
  await expect(makoCard.getByText("Latest: v1.2.3", { exact: true })).toBeVisible();
  await expect(makoCard.getByText(/GitHub rate limit reached/)).toBeHidden();
});

test("Saving a GitHub token in Settings adds it to GitHub API requests", async ({ page }) => {
  let authHeader: string | undefined;
  await page.route("https://api.github.com/**", (route) => {
    authHeader = route.request().headers()["authorization"];
    return route.fulfill({ json: [release] });
  });

  try {
    const app = mock(page);
    await app.getByRole("button", { name: "/deckyhub/settings" }).click();
    await app.getByLabel("GitHub Token").fill("ghp_test_token_abc123");
    const saveButton = app.getByRole("button", { name: "Save Settings", exact: true });
    await saveButton.click();
    // The button re-disables only once the save round-trip resolves and
    // settings state updates, so waiting for that avoids racing the
    // navigation below against an in-flight save (see save_repo_settings'
    // channel-reset tests above for the same race under a different route).
    await expect(saveButton).toBeDisabled();

    // /deckyhub/discover mounts a brand-new I18nProvider (one per route, see
    // AGENTS.md), which re-primes the GitHub token from backend settings on
    // mount — same mechanism as its locale refresh — so no reload is needed.
    await app.getByRole("button", { name: "/deckyhub/discover" }).click();
    await expect(app.getByText("Latest: v1.2.3", { exact: true }).first()).toBeVisible();

    expect(authHeader).toBe("Bearer ghp_test_token_abc123");
  } finally {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "" });
  }
});

test("Settings loads a previously saved GitHub token and keeps Save disabled until it changes", async ({ page }) => {
  try {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "ghp_preexisting_token" });

    const app = mock(page);
    await app.getByRole("button", { name: "/deckyhub/settings" }).click();
    const tokenField = app.getByLabel("GitHub Token");
    const saveButton = app.getByRole("button", { name: "Save Settings", exact: true });

    await expect(tokenField).toHaveValue("ghp_preexisting_token");
    await expect(saveButton).toBeDisabled();

    await tokenField.fill("ghp_preexisting_token_edited");
    await expect(saveButton).toBeEnabled();
  } finally {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "" });
  }
});

test("Clearing a previously-saved GitHub token removes it from GitHub API requests", async ({ page }) => {
  // "Saving a GitHub token" above already proves the "token set → header
  // sent" half in CI, so this only exercises the other direction, and seeds
  // the starting token via the bridge instead of the Settings UI to keep
  // the step count down. An earlier, heavier version of this test (proving
  // both directions in one test, via full Discover-grid navigation) passed
  // locally every time but hit CI's 30s test timeout twice in a row — this
  // is deliberately the leanest version that still forces a real re-fetch
  // (via "Check for Updates") rather than risking a cache hit that would
  // make the final assertion trivially true regardless of the real fix.
  let authHeader: string | undefined;
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases**", (route) => {
    authHeader = route.request().headers()["authorization"];
    return route.fulfill({ json: [release] });
  });

  try {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "ghp_temp_token" });

    const app = mock(page);
    await app.getByRole("button", { name: "/deckyhub/settings" }).click();
    // Wait for the seeded token to load; clearing the field before that
    // leaves nothing to save, and Save stays disabled.
    await expect(app.getByLabel("GitHub Token")).toHaveValue("ghp_temp_token");
    await app.getByLabel("GitHub Token").fill("");
    const saveButton = app.getByRole("button", { name: "Save Settings", exact: true });
    await saveButton.click();
    await expect(saveButton).toBeDisabled();

    await app.getByRole("button", { name: "/deckyhub/discover" }).click();
    await browseAll(page, "MAKO");
    const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
    await makoCard.getByRole("button", { name: "Manage", exact: true }).click();
    const modal = app.locator(".steam-modal");
    await modal.getByRole("button", { name: "Check for Updates", exact: true }).click();
    await expect(modal.getByRole("button", { name: "Download ZIP", exact: true })).toBeVisible();

    expect(authHeader).toBeUndefined();
  } finally {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "" });
  }
});

test("GitHub repository search also sends the saved token", async ({ page }) => {
  let authHeader: string | undefined;
  await page.route("https://api.github.com/search/repositories**", (route) => {
    authHeader = route.request().headers()["authorization"];
    return route.fulfill({ json: { items: [] } });
  });

  try {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "ghp_search_token" });

    const app = mock(page);
    await app.getByRole("button", { name: "/deckyhub/search" }).click();
    await app.getByLabel("Search GitHub").fill("some-repo");
    await app.getByRole("button", { name: "Search", exact: true }).click();

    await expect.poll(() => authHeader).toBe("Bearer ghp_search_token");
  } finally {
    await bridgeCall(page, "save_settings", { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "" });
  }
});

test("Arrow keys move focus through Discover", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const refresh = app.getByRole("button", { name: "Refresh", exact: true });

  await refresh.focus();
  await refresh.press("ArrowDown");
  await expect(app.locator(":focus")).not.toHaveText("Refresh");
  await app.locator(":focus").press("ArrowRight");
  await expect(app.locator(":focus")).toBeVisible();
  await app.locator(":focus").press("ArrowLeft");
  await expect(app.locator(":focus")).toBeVisible();
  await app.locator(":focus").press("ArrowUp");
  await expect(app.locator(":focus")).toBeVisible();
});

// Steam scrolls only far enough to show the focused control. Mimic that from
// the bottom of the page, putting the control flush with the top edge: focus
// the first control of each section on screen and list the titles left out of view.
async function titlesHiddenAfterFocus(page: Page) {
  return mock(page).locator("body").evaluate(async (body) => {
    const controlSelector = "button:not(:disabled), input, select, [tabindex]:not([tabindex='-1'])";
    const hidden: string[] = [];
    for (const section of Array.from(body.querySelectorAll(".steam-screen section"))) {
      const title = section.querySelector("h3");
      const control = section.querySelector<HTMLElement>(controlSelector);
      if (!title || !control || !control.getClientRects().length) continue;
      let scroller = control.parentElement;
      while (scroller && getComputedStyle(scroller).overflowY !== "auto") scroller = scroller.parentElement;
      if (!scroller) continue;
      scroller.scrollTop = scroller.scrollHeight;
      control.focus({ preventScroll: true });
      scroller.scrollTop += control.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      await new Promise((resolve) => setTimeout(resolve, 50));
      const view = scroller.getBoundingClientRect();
      const box = title.getBoundingClientRect();
      if (box.top < view.top || box.bottom > view.bottom) hidden.push(title.textContent ?? "");
    }
    return hidden;
  });
}

// Pairs of controls sitting side by side whose shared Focusable doesn't flow
// left-right: Steam's D-pad can't move between them (the mock's can). An open
// window is checked on its own, since the page behind it can't take focus.
async function sideBySideWithoutRightFlow(page: Page) {
  return mock(page).locator("body").evaluate((body) => {
    const scope = Array.from(body.querySelectorAll(".steam-modal")).pop() ?? body;
    const controls = Array.from(scope.querySelectorAll<HTMLElement>("button, input, select, [tabindex]:not([tabindex='-1'])"))
      .filter((control) => control.getClientRects().length && !control.closest(".preview-nav"));
    const label = (control: HTMLElement) => control.textContent?.trim() || control.getAttribute("aria-label") || control.tagName;
    const problems = new Set<string>();
    for (const left of controls) {
      for (const right of controls) {
        const a = left.getBoundingClientRect(), b = right.getBoundingClientRect();
        if (left === right || b.left < a.right || Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top)) continue;
        let shared = left.parentElement;
        while (shared && !shared.contains(right)) shared = shared.parentElement;
        if (shared?.closest("[data-focusable]")?.getAttribute("data-flow-children") !== "right") problems.add(`${label(left)} → ${label(right)}`);
      }
    }
    return [...problems];
  });
}

test("The D-pad moves left and right through every row of the new Discover, list and Search views", async ({ page }) => {
  await page.route("https://api.github.com/search/repositories**", (route) =>
    route.fulfill({ json: { items: Array.from({ length: 7 }, (_, index) => ({ full_name: `example/repo-${index}`, description: "Test repository", stargazers_count: index })) } }),
  );
  const removePlugin = seedPlugin("e2e-mako", "MAKO - Frame Generation", "1.0.0");
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", "c".repeat(64))]);
  try {
    await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
    const app = mock(page);
    // Home: category chips and shelves.
    await expect(app.getByRole("heading", { name: "Most popular", exact: true })).toBeVisible();
    expect(await sideBySideWithoutRightFlow(page)).toEqual([]);
    // Browsing: grid, then list.
    await browseAll(page);
    await expect(app.getByText(/^Page 1 of/)).toBeVisible();
    expect(await sideBySideWithoutRightFlow(page)).toEqual([]);
    await app.getByRole("button", { name: "List", exact: true }).click();
    await expect(app.locator(".deckyhub-app-row").first()).toBeVisible();
    expect(await sideBySideWithoutRightFlow(page)).toEqual([]);
    // Updates as a list.
    await app.getByRole("button", { name: "/deckyhub/updates" }).click();
    await expect(app.locator(".deckyhub-app-row")).toHaveCount(1);
    expect(await sideBySideWithoutRightFlow(page)).toEqual([]);
    // Search as a list.
    await app.getByRole("button", { name: "/deckyhub/search" }).click();
    await app.getByLabel("Search GitHub").fill("example");
    await app.getByRole("button", { name: "Search", exact: true }).click();
    await expect(app.locator(".deckyhub-search-row")).toHaveCount(7);
    expect(await sideBySideWithoutRightFlow(page)).toEqual([]);
  } finally {
    removePlugin();
  }
});

test("Discover keeps the D-pad focused through its chips, category switches and page turns", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const focused = () => pluginFrame(page).evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  // Chips sit in explicit rows (each a left/right row inside a top-to-bottom column), so Down reaches the second row.
  const chips = app.locator(".deckyhub-category-chips");
  await expect(chips.locator('[data-flow-children="right"]').nth(1)).toBeVisible();
  await expect(chips.locator('[data-flow-children="down"]').first()).toBeVisible();

  // Opening a category hands focus to the Back button; going back hands it to the first chip.
  await app.getByRole("button", { name: /^All plugins/ }).click();
  await expect.poll(focused).toContain("Discover");
  await app.locator(".deckyhub-back-button").getByRole("button").click();
  await expect.poll(focused).toMatch(/^All plugins/);

  // R1 turns the page and focus stays on the same spot, now holding the next page's card.
  await app.getByRole("button", { name: /^All plugins/ }).click();
  const firstManage = app.getByRole("button", { name: "Manage", exact: true }).first();
  await firstManage.focus();
  const before = await app.locator("[data-flow-children] h3").first().textContent();
  await firstManage.press("]");
  await expect(app.getByText(/^Page 2 of/)).toBeVisible();
  await expect(app.locator("[data-flow-children] h3").first()).not.toHaveText(before!);
  await expect.poll(focused).toBe("Manage");

  // The card holding focus gets a ring; the others don't.
  const rings = () => app.locator(".deckyhub-focus-ring").evaluateAll((cards) => cards.map((card) => getComputedStyle(card).outlineWidth));
  await expect.poll(async () => (await rings()).filter((width) => width === "3px").length).toBe(1);
});

test("B goes back from a category to the shelves", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: /^Utilities/ }).click();
  await expect(app.getByRole("heading", { name: "Utilities", exact: true })).toBeVisible();
  // The mock's Escape stands in for B.
  await app.getByRole("button", { name: "Manage", exact: true }).first().press("Escape");
  await expect(app.getByRole("heading", { name: "Most popular", exact: true })).toBeVisible();
});

test("Text stays readable at arm's length: nothing under 12px on the main screens", async ({ page }) => {
  const tooSmall = () => pluginFrame(page).evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((element) => !element.closest(".preview-nav, .steam-bottombar, .steam-topbar") && element.getClientRects().length && [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim()))
      .filter((element) => parseFloat(getComputedStyle(element).fontSize) < 12)
      .map((element) => `${getComputedStyle(element).fontSize} ${element.textContent?.trim().slice(0, 30)}`));
  await page.goto("/?bridge=http://127.0.0.1:8643");
  await expect(mock(page).getByRole("button", { name: "Discover", exact: true })).toBeVisible();
  expect(await tooSmall()).toEqual([]);
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await expect(app.getByRole("heading", { name: "Most popular", exact: true })).toBeVisible();
  expect(await tooSmall()).toEqual([]);
  await browseAll(page);
  await app.getByRole("button", { name: "List", exact: true }).click();
  await expect(app.locator(".deckyhub-app-row").first()).toBeVisible();
  expect(await tooSmall()).toEqual([]);
  await page.goto("/?preview=/deckyhub/settings&bridge=http://127.0.0.1:8643");
  await expect(app.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  expect(await tooSmall()).toEqual([]);
});

test("With motion allowed, windows pop in and switching views slides the list in", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await browseAll(page, "MAKO");
  await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Manage", exact: true }).click();
  await expect.poll(() => app.locator(".steam-modal .deckyhub-pop").evaluate((element) => getComputedStyle(element).animationName)).toBe("deckyhub-pop");
  await app.locator(".steam-modal").getByRole("button", { name: "Close", exact: true }).click();
  // Switching to the list animates the list in place (Web Animations), without rebuilding it.
  await app.getByRole("button", { name: "List", exact: true }).click();
  await expect.poll(() => pluginFrame(page).evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
});

// Seeds an installed Decky plugin where dev-server.py scans for them.
function seedPlugin(dir: string, name: string, version: string) {
  const pluginDir = new URL(`../.dev-data/plugins/${dir}/`, import.meta.url);
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(new URL("plugin.json", pluginDir), JSON.stringify({ name, version }));
  // Retries: on Windows the bridge's plugin scan can briefly lock the folder.
  return () => rmSync(pluginDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

const defaultSettings = { overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: 3, githubToken: "", density: "default", haptics: true, hiddenButtons: [] };

test("Moving focus ticks the Deck's trackpads, unless Display Settings turns it off", async ({ page }) => {
  // Steam's controller list (the built-in Deck controller is type 4) and its haptics call.
  await page.addInitScript(() => {
    const ticks: unknown[][] = [];
    Object.assign(window, {
      __ticks: ticks,
      SteamClient: { Input: {
        RegisterForControllerListChanges: (callback: (list: unknown[]) => void) => {
          callback([{ eControllerType: 2, nControllerIndex: 0 }, { eControllerType: 4, nControllerIndex: 3 }]);
          return { unregister: () => {} };
        },
        TriggerSimpleHapticEvent: (...args: unknown[]) => ticks.push(args),
      } },
    });
  });
  await bridgeCall(page, "save_settings", defaultSettings);
  try {
    await page.goto("/?preview=/deckyhub/settings&bridge=http://127.0.0.1:8643");
    const app = mock(page);
    const ticks = () => pluginFrame(page).evaluate(() => (window as unknown as { __ticks: unknown[][] }).__ticks.length);
    const toggle = app.getByLabel("Haptic feedback when navigating");
    await expect(toggle).toBeChecked();

    await app.getByRole("button", { name: "Repositories", exact: true }).focus();
    await expect.poll(ticks).toBeGreaterThan(0);
    // The first focus registers for the controller list; this one ticks on the Deck's controller.
    await page.waitForTimeout(60);
    await toggle.focus();
    expect(await pluginFrame(page).evaluate(() => (window as unknown as { __ticks: unknown[][] }).__ticks.at(-1))).toEqual([3, 2, 1, 1, 0]);

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.waitForTimeout(300);
    const before = await ticks();
    await app.getByRole("button", { name: "Repositories", exact: true }).focus();
    await page.waitForTimeout(60);
    await toggle.focus();
    expect(await ticks()).toBe(before);
  } finally {
    await bridgeCall(page, "save_settings", defaultSettings);
  }
});

test("Moving focus up into a card or the page header brings its title into view", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  await expect(mock(page).getByRole("button", { name: "Manage", exact: true }).nth(3)).toBeVisible();
  expect(await titlesHiddenAfterFocus(page)).toEqual([]);
});

test("Moving focus up through Settings and Repositories brings each section title into view", async ({ page }) => {
  await page.route("https://api.github.com/search/repositories**", (route) =>
    route.fulfill({ json: { items: Array.from({ length: 5 }, (_, index) => ({ full_name: `example/repo-${index}`, description: "Test repository", stargazers_count: index })) } }),
  );
  await page.goto("/?preview=/deckyhub/settings&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await expect(app.getByLabel("Language")).toBeVisible();
  expect(await titlesHiddenAfterFocus(page)).toEqual([]);

  await app.getByRole("button", { name: "/deckyhub/search" }).click();
  await app.getByLabel("Search GitHub").fill("example");
  await app.getByRole("button", { name: "Search", exact: true }).click();
  await expect(app.getByRole("heading", { name: "example/repo-4" })).toBeVisible();
  expect(await titlesHiddenAfterFocus(page)).toEqual([]);
});

test("Every row of side-by-side controls lets the D-pad move left and right", async ({ page }) => {
  await page.route("https://api.github.com/search/repositories**", (route) =>
    route.fulfill({ json: { items: Array.from({ length: 6 }, (_, index) => ({ full_name: `example/repo-${index}`, description: "Test repository", stargazers_count: index })) } }),
  );
  const app = mock(page);

  // Quick Access panel, with the rate-limit banner's two buttons.
  await expect(app.getByRole("button", { name: "Discover", exact: true })).toBeVisible();
  await app.getByRole("button", { name: "Rate limit banner", exact: true }).click();
  expect(await sideBySideWithoutRightFlow(page)).toEqual([]);

  // Discover: header, search/status row, card grid, and its Manage window.
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await browseAll(page, "MAKO");
  await expect(app.getByRole("button", { name: "Manage", exact: true }).first()).toBeVisible();
  expect(await sideBySideWithoutRightFlow(page)).toEqual([]);
  await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Manage", exact: true }).click();
  await expect(app.locator(".steam-modal").getByRole("button", { name: "Check for Updates", exact: true })).toBeVisible();
  expect(await sideBySideWithoutRightFlow(page)).toEqual([]);
  await app.locator(".steam-modal").getByRole("button", { name: "Close", exact: true }).click();

  // Search: search row, two-column results with Install/Add, pager.
  await app.getByRole("button", { name: "/deckyhub/search" }).click();
  await app.getByLabel("Search GitHub").fill("example");
  await app.getByRole("button", { name: "Search", exact: true }).click();
  await expect(app.getByText("Page 1 of 2", { exact: true })).toBeVisible();
  expect(await sideBySideWithoutRightFlow(page)).toEqual([]);

  // Repositories: import/export, registries.
  await app.getByRole("button", { name: "/deckyhub/repositories" }).click();
  await expect(app.getByRole("button", { name: "Export", exact: true })).toBeVisible();
  expect(await sideBySideWithoutRightFlow(page)).toEqual([]);

  // Settings.
  await app.getByRole("button", { name: "/deckyhub/settings" }).click();
  await expect(app.getByLabel("Language")).toBeVisible();
  expect(await sideBySideWithoutRightFlow(page)).toEqual([]);

  // DeckyHub's own update window.
  await app.getByRole("button", { name: "Quick Access widget", exact: true }).click();
  await app.locator(".qam-content").getByRole("button", { name: "Manage", exact: true }).click();
  await expect(app.locator(".steam-modal").getByRole("button", { name: "Close", exact: true })).toBeVisible();
  expect(await sideBySideWithoutRightFlow(page)).toEqual([]);
});

test("Quick Access lists its pages in order, showing Updates only while there are some", async ({ page }) => {
  const removePlugin = seedPlugin("e2e-mako", "MAKO - Frame Generation", "1.0.0");
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", "c".repeat(64))]);
  try {
    await page.goto("/?bridge=http://127.0.0.1:8643");
    const app = mock(page);
    const nav = app.locator(".qam-content").getByRole("button");
    await expect(nav.nth(0).locator("span")).toHaveText("1");
    await expect(nav.nth(0)).toContainText("Updates");
    await expect(nav.nth(1)).toHaveText(/^\s*Discover\d+$/);
    await expect(nav.nth(2)).toHaveText("Search");
    await expect(nav.nth(3)).toHaveText("Settings");
    await expect(app.getByText("Browse", { exact: true })).toHaveCount(0);
  } finally {
    removePlugin();
  }

  await page.reload();
  await expect(mock(page).locator(".qam-content").getByRole("button").first()).toHaveText(/^\s*Discover\d+$/);
  await expect(mock(page).getByRole("button", { name: "Updates", exact: true })).toHaveCount(0);
});

test("Settings opens Repositories", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/settings&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Repositories", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Repositories", exact: true })).toBeVisible();
});

test("An up-to-date Decky plugin's card offers only Manage", async ({ page }) => {
  const removePlugin = seedPlugin("e2e-mako", "MAKO - Frame Generation", "1.2.3");
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", "c".repeat(64))]);
  try {
    await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
    const makoCard = mock(page).getByRole("heading", { name: "MAKO Decky" }).locator("..");
    await expect(makoCard.getByText("Up To Date", { exact: true })).toBeVisible();
    await expect(makoCard.getByRole("button")).toHaveText(["Manage"]);
  } finally {
    removePlugin();
  }
});

test("The Manage window's Install button names the version picked in the dropdown", async ({ page }) => {
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", "a".repeat(64), "02"), makoRelease("plugin-v1.2.2", "b".repeat(64), "01")]);
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Manage", exact: true }).click();
  const modal = app.locator(".steam-modal");
  await expect(modal.getByRole("button", { name: "Install v1.2.3", exact: true })).toBeVisible();
  await modal.getByLabel("Version").selectOption("plugin-v1.2.2");
  await expect(modal.getByRole("button", { name: "Install v1.2.2", exact: true })).toBeVisible();
  await expect(modal.getByRole("button", { name: "Install v1.2.3", exact: true })).toHaveCount(0);
});

test("Check for Updates and Download ZIP keep the Manage window open", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  await browseAll(page, "MAKO");
  const app = mock(page);
  await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Manage", exact: true }).click();
  const modal = app.locator(".steam-modal");
  await modal.getByRole("button", { name: "Check for Updates", exact: true }).click();
  await expect(modal.getByRole("button", { name: "Check for Updates", exact: true })).toBeEnabled();
  await expect(modal.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "Download ZIP", exact: true }).click();
  await expect(modal.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  await expect(app.locator(".steam-modal")).toHaveCount(1);
});

test("Updates counts its plugins and Discover lists them first", async ({ page }) => {
  const removePlugin = seedPlugin("e2e-nexus", "Nexus Mods", "1.0.0");
  try {
    await page.goto("/?preview=/deckyhub/updates&bridge=http://127.0.0.1:8643");
    const app = mock(page);
    await expect(app.locator(".deckyhub-update-count")).toHaveText("1");
    await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
    await browseAll(page);
    await expect(mock(page).getByRole("heading", { level: 3 }).first()).toHaveText("Nexus Mods");
  } finally {
    removePlugin();
  }
});

test("The Updates page offers Discover when everything is up to date", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/updates&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await expect(app.getByRole("heading", { name: "Everything installed is up to date." })).toBeVisible();
  await app.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(app.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
});

test("A stalled Decky install warns once its progress goes quiet, a finished one doesn't", async ({ page }) => {
  await recordInstalls(page);
  await page.clock.install();
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", "a".repeat(64))]);
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const stalled = app.getByText("Decky couldn't finish installing MAKO - Frame Generation: Reload Decky and try again.");
  const install = async () => {
    await app.getByRole("button", { name: "/deckyhub/discover" }).click();
    await app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Install v1.2.3", exact: true }).click();
    await acceptDisclaimer(page, "Install v1.2.3");
    await expect(app.locator(".qam-content")).toBeVisible();
  };

  await install();
  await emit(page, "loader/plugin_download_start", "MAKO - Frame Generation");
  await emit(page, "loader/plugin_download_finish", "MAKO - Frame Generation");
  await page.clock.fastForward(60_000);
  await expect(stalled).toHaveCount(0);

  await install();
  await emit(page, "loader/plugin_download_start", "MAKO - Frame Generation");
  await page.clock.fastForward(46_000);
  await expect(stalled).toBeVisible();
});

test("DeckyHub asks Decky to load its new version when Decky doesn't reload it after an update", async ({ page }) => {
  await recordInstalls(page);
  await page.clock.install();
  await mockDeckyHubReleases(page, [deckyHubRelease("v9.9.9", { sha: "b" })]);
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Update to v9.9.9", exact: true }).click();

  const imports = () => pluginFrame(page).evaluate(() => (window as unknown as { __imports: string[] }).__imports);
  // Decky can only finish an install it has been handed, after the ZIP is staged.
  await expect.poll(() => pluginFrame(page).evaluate(() => (window as unknown as { __installCalls: unknown[][] }).__installCalls.length)).toBe(1);
  await emit(page, "loader/plugin_download_finish", "DeckyHub");
  // Decky gets its own 15 s to reload DeckyHub first.
  await page.clock.fastForward(10_000);
  expect(await imports()).toEqual([]);
  await page.clock.fastForward(6_000);
  await expect.poll(imports).toEqual(["DeckyHub"]);
});

test("A failed download shows its reason in the download window", async ({ page }) => {
  const app = mock(page);
  await app.getByRole("button", { name: "Download failed modal", exact: true }).click();
  const modal = app.locator(".steam-modal");
  await expect(modal.getByText("DeckyHub download failed", { exact: true })).toBeVisible();
  await expect(modal.getByText("HTTP Error 404: Not Found", { exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "OK", exact: true }).click();
  await expect(app.locator(".steam-modal")).toHaveCount(0);
});

test("Discover's list shows a page at a time, and L1 / R1 turn it", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await browseAll(page);
  const total = (await bridgeCall(page, "get_apps")).result.apps.length;
  const pages = Math.ceil(total / 9);
  // Three rows of three cards (the default Items Per Row).
  await expect(app.getByText(`Page 1 of ${pages}`, { exact: true })).toBeVisible();
  await expect(app.locator("[data-flow-children] h3")).toHaveCount(9);
  const first = await app.locator("[data-flow-children] h3").first().textContent();

  // R1 (the mock's "]") anywhere in the list turns the page; L1 ("[") turns it back.
  await app.getByRole("button", { name: "Manage", exact: true }).first().press("]");
  await expect(app.getByText(`Page 2 of ${pages}`, { exact: true })).toBeVisible();
  await expect(app.locator("[data-flow-children] h3").first()).not.toHaveText(first!);
  await app.getByRole("button", { name: "Manage", exact: true }).first().press("[");
  await expect(app.getByText(`Page 1 of ${pages}`, { exact: true })).toBeVisible();

  // The list view shows every plugin, with no pages.
  await app.getByRole("button", { name: "List", exact: true }).click();
  await expect(app.locator(".deckyhub-app-row")).toHaveCount(total);
  await expect(app.locator(".deckyhub-pager")).toHaveCount(0);
});

test("Search and Updates switch to the list view too, and remember it", async ({ page }) => {
  await page.route("https://api.github.com/search/repositories**", (route) =>
    route.fulfill({ json: { items: Array.from({ length: 7 }, (_, index) => ({ full_name: `example/repo-${index}`, description: "Test repository", stargazers_count: index })) } }),
  );
  const removePlugin = seedPlugin("e2e-mako", "MAKO - Frame Generation", "1.0.0");
  await mockMakoReleases(page, [makoRelease("plugin-v1.2.3", "c".repeat(64))]);
  try {
    // Search: five results a page as a grid, all seven as a list.
    await page.goto("/?preview=/deckyhub/search&bridge=http://127.0.0.1:8643");
    const app = mock(page);
    await app.getByLabel("Search GitHub").fill("example");
    await app.getByRole("button", { name: "Search", exact: true }).click();
    await expect(app.getByText("Page 1 of 2", { exact: true })).toBeVisible();
    await app.getByRole("button", { name: "List", exact: true }).click();
    await expect(app.locator(".deckyhub-search-row")).toHaveCount(7);
    await expect(app.getByText("Page 1 of 2", { exact: true })).toHaveCount(0);
    await expect(app.getByRole("heading", { name: "example/repo-6" }).locator("..").getByRole("button", { name: "Install", exact: true })).toBeVisible();

    // Updates opens in the list view chosen on Search, and switches back to the grid.
    await app.getByRole("button", { name: "/deckyhub/updates" }).click();
    await expect(app.locator(".deckyhub-app-row")).toHaveCount(1);
    await expect(app.getByRole("heading", { name: "MAKO Decky" }).locator("..").getByRole("button", { name: "Update to v1.2.3", exact: true })).toBeVisible();
    await app.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(app.locator(".deckyhub-app-row")).toHaveCount(0);
    await expect(app.getByRole("heading", { name: "MAKO Decky" })).toBeVisible();
  } finally {
    removePlugin();
  }
});

test("A repository added from search shows on Discover until it's removed", async ({ page }) => {
  const repo = "e2e-add/plugin";
  await page.route("https://api.github.com/search/repositories**", (route) => route.fulfill({ json: { items: [{ full_name: repo, description: "Test repository", stargazers_count: 1 }] } }));
  await page.goto("/?preview=/deckyhub/search&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  try {
    await app.getByLabel("Search GitHub").fill("plugin");
    await app.getByRole("button", { name: "Search", exact: true }).click();
    await app.getByRole("heading", { name: repo }).locator("..").getByRole("button", { name: "Add", exact: true }).click();
    await expect(app.getByRole("heading", { name: repo }).locator("..").getByRole("button", { name: "Added", exact: true })).toBeDisabled();
    await app.getByRole("button", { name: "/deckyhub/repositories" }).click();
    await expect(app.getByRole("button", { name: `Remove ${repo}`, exact: true })).toBeVisible();

    await app.getByRole("button", { name: "/deckyhub/discover" }).click();
    await browseAll(page, repo);
    await expect(app.getByRole("heading", { name: repo })).toBeVisible();

    await app.getByRole("button", { name: "/deckyhub/repositories" }).click();
    await app.getByRole("button", { name: `Remove ${repo}`, exact: true }).click();
    await app.locator(".steam-modal").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(app.getByRole("button", { name: `Remove ${repo}`, exact: true })).toHaveCount(0);

    await app.getByRole("button", { name: "/deckyhub/discover" }).click();
    await browseAll(page, "MAKO");
    await expect(app.getByRole("heading", { name: "MAKO Decky" })).toBeVisible();
    await expect(app.getByRole("heading", { name: repo })).toHaveCount(0);
  } finally {
    await bridgeCall(page, "remove_custom_repo", repo);
  }
});

test("Switching the language updates Settings and the Quick Access panel", async ({ page }) => {
  await bridgeCall(page, "save_settings", defaultSettings);
  try {
    await page.goto("/?preview=/deckyhub/settings&bridge=http://127.0.0.1:8643");
    const app = mock(page);
    await app.getByLabel("Language").selectOption("ru");
    await expect(app.getByLabel("Язык")).toBeVisible();
    await app.getByRole("button", { name: "Quick Access widget", exact: true }).click();
    await expect(app.locator(".qam-content").getByRole("button", { name: "Настройки", exact: true })).toBeVisible();

    await app.getByRole("button", { name: "/deckyhub/settings" }).click();
    await app.getByLabel("Язык").selectOption("auto");
    await expect(app.getByLabel("Language")).toBeVisible();
  } finally {
    await bridgeCall(page, "save_settings", defaultSettings);
  }
});

test("Switching DeckyHub's channel in its update window doesn't toast, and the panel button follows it", async ({ page }) => {
  await mockDeckyHubReleases(page, [
    deckyHubRelease("v9.9.9-rc.1", { sha: "e", prerelease: true, publishedAt: "2026-01-02T00:00:00Z" }),
    deckyHubRelease("v0.9.0", { sha: "e", publishedAt: "2026-01-01T00:00:00Z" }),
  ]);
  await bridgeCall(page, "save_settings", defaultSettings);
  const toasts: string[] = [];
  page.on("console", (message) => message.text().startsWith("[decky-mock toast]") && toasts.push(message.text()));
  try {
    await page.goto("/?bridge=http://127.0.0.1:8643");
    const app = mock(page);
    const panel = app.locator(".qam-content");
    await panel.getByRole("button", { name: "Manage", exact: true }).click();
    const modal = app.locator(".steam-modal");
    await modal.getByLabel("Update Channel").selectOption("prerelease");
    await expect(modal.getByRole("button", { name: "Update to v9.9.9-rc.1", exact: true })).toBeVisible();
    await modal.getByRole("button", { name: "Check for Updates", exact: true }).click();
    await expect(modal.getByRole("button", { name: "Check for Updates", exact: true })).toBeEnabled();
    await modal.getByRole("button", { name: "Close", exact: true }).click();

    await expect(panel.getByRole("button", { name: "Update to v9.9.9-rc.1", exact: true })).toBeVisible();
    await expect(panel.getByText("DeckyHub update v9.9.9-rc.1 is available.")).toBeVisible();
    expect(toasts.filter((text) => /DeckyHub update .* is available/.test(text))).toEqual([]);
  } finally {
    await bridgeCall(page, "save_settings", defaultSettings);
  }
});

test("Custom registries: add, reject, refresh and remove", async ({ page }) => {
  // dev-server.py serves https://registry.test/<name> from fixtures, no network.
  const toasts: string[] = [];
  page.on("console", (message) => message.text().startsWith("[decky-mock toast]") && toasts.push(message.text()));
  const lastToast = () => expect.poll(() => toasts.at(-1) ?? "");
  await page.goto("/?preview=/deckyhub/repositories&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const add = app.getByRole("button", { name: "Add registry", exact: true });
  try {
    const { apps: official } = (await bridgeCall(page, "refresh_registry")).result;
    // One field: "owner/repo" expands to a GitHub URL, anything else is sent as a URL.
    const url = app.getByLabel("GitHub owner/repo or registry URL (https://….json)");
    for (const [value, message] of [
      ["../..", "https:// URL ending in .json"],
      ["http://registry.test/good.json", "https:// URL ending in .json"],
      ["https://registry.test/missing.json", "Nothing at that URL"],
      ["https://registry.test/empty.json", "already listed"],
    ]) {
      await url.fill(value);
      await add.click();
      await lastToast().toContain(message);
    }
    await expect(app.getByText("No custom registries yet.", { exact: false })).toBeVisible();

    await url.fill("https://registry.test/good.json");
    await add.click();
    await lastToast().toContain("Registry added with 1 repositories");
    await expect(app.getByText("https://registry.test/good.json", { exact: true })).toBeVisible();
    const { result } = await bridgeCall(page, "get_apps");
    expect(result.apps.map((item: { repo: string }) => item.repo)).toContain("example/fixture-app");

    await url.fill("https://registry.test/good.json");
    await add.click();
    await lastToast().toContain("already in use");

    // Refresh re-downloads every source and must keep the added registry's app.
    const refreshButton = app.getByRole("button", { name: "Refresh registries", exact: true });
    const refreshed = page.waitForResponse((response) => response.request().postData()?.includes('"refresh_registry"') ?? false);
    await refreshButton.click();
    expect((await (await refreshed).json()).result).toEqual({ apps: official + 1 });
    await expect(refreshButton).toBeEnabled();
    await lastToast().toContain("already in use");

    await app.getByRole("button", { name: "Remove", exact: true }).click();
    await app.locator(".steam-modal").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(app.getByText("No custom registries yet.", { exact: false })).toBeVisible();
    const after = await bridgeCall(page, "get_apps");
    expect(after.result.apps.map((item: { repo: string }) => item.repo)).not.toContain("example/fixture-app");
  } finally {
    // settings.json is shared across runs; never leave the fixture registry behind.
    await bridgeCall(page, "remove_custom_registry", "https://registry.test/good.json");
  }
});
