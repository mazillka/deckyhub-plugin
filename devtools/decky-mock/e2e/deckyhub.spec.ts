import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const deckyHubVersion = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version;
const deckyHubTag = `v${deckyHubVersion}`;

// Adjacent rc tags sharing the installed version's release number (e.g.
// "1.0.3-rc.2" and "1.0.3-rc.4" around an installed "1.0.3-rc.3") — derived
// from whatever the real installed version happens to be, so the regression
// test below stays valid across future version bumps instead of hardcoding
// a specific rc number that will eventually go stale.
const rcMatch = deckyHubVersion.match(/^(.*-rc\.)(\d+)$/);
const rcPrefix = rcMatch ? rcMatch[1] : `${deckyHubVersion}-rc.`;
const rcNumber = rcMatch ? Number(rcMatch[2]) : 1;
const olderRcTag = `v${rcPrefix}${Math.max(rcNumber - 1, 1)}`;
const newerRcTag = `v${rcPrefix}${rcNumber + 1}`;

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

test.beforeEach(async ({ page }) => {
  await page.route("https://api.github.com/**", (route) => route.fulfill({ json: release }));
  await page.goto("/?bridge=http://127.0.0.1:8643");
});

test("Quick Access navigation opens Discover", async ({ page }) => {
  const app = mock(page);
  const [updates, discover] = await Promise.all([
    app.getByRole("button", { name: "Updates", exact: true }).boundingBox(),
    app.getByRole("button", { name: "Discover", exact: true }).boundingBox(),
  ]);
  expect(discover!.y - (updates!.y + updates!.height)).toBeGreaterThanOrEqual(6);
  await app.getByRole("button", { name: "Discover", exact: true }).click();

  await expect(app.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
  await expect(app.getByText("STEAM", { exact: true })).toBeVisible();
  await expect(app.getByRole("heading", { name: "MAKO Decky" })).toBeVisible();
  await expect(app.getByText("Boosts frame rates with Lossless Scaling frame generation.")).toBeVisible();
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

test("direct preview URLs render the requested page", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");

  await expect(mock(page).getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
});

test("Discover keeps search and status on one row", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
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
});

test("Discover keeps its refresh action beside the description", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const description = app.getByText("Browse supported GitHub projects and their ZIP releases.");
  const refresh = app.getByRole("button", { name: "Refresh", exact: true });

  const [descriptionBox, refreshBox] = await Promise.all([description.boundingBox(), refresh.boundingBox()]);
  expect(Math.abs(descriptionBox!.y - refreshBox!.y)).toBeLessThan(20);
  expect(refreshBox!.x).toBeGreaterThan(descriptionBox!.x);
});

test("Repositories page renders Add & Manage directly, with no tabs", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/repositories&bridge=http://127.0.0.1:8643");
  const app = mock(page);

  await expect(app.getByLabel("Search GitHub")).toBeVisible();
  await expect(app.getByRole("button", { name: "Repository Settings", exact: true })).toHaveCount(0);
});

test("Repository search and action share one row", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/repositories&bridge=http://127.0.0.1:8643");
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
  expect(Math.abs(searchBox!.y - actionBox!.y)).toBeLessThan(20);
  expect(actionBox!.x).toBeGreaterThan(searchBox!.x);
  expect(Math.abs(actionBox!.y - clearBox!.y)).toBeLessThan(20);
  expect(clearBox!.x).toBeGreaterThan(actionBox!.x);
});

test("Repository search stays enabled but skips blank queries", async ({ page }) => {
  let requests = 0;
  await page.route("https://api.github.com/search/repositories**", (route) => {
    requests++;
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto("/?preview=/deckyhub/repositories&bridge=http://127.0.0.1:8643");
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

test("Clearing DeckyHub downloads requires confirmation", async ({ page }) => {
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Empty DeckyHub Downloads Folder", exact: true }).click();

  await expect(app.getByText("Permanently remove all files in /home/deck/Downloads/deckyhub?")).toBeVisible();
  await app.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("DeckyHub offers to reinstall the matching version and keeps its release page", async ({ page }) => {
  const deckyHubRelease = {
    tag_name: deckyHubTag,
    prerelease: false,
    html_url: `https://github.com/mazillka/deckyhub-plugin/releases/tag/${deckyHubTag}`,
    assets: [{ name: `DeckyHub-${deckyHubTag}.zip`, browser_download_url: `https://github.com/mazillka/deckyhub-plugin/releases/download/${deckyHubTag}/DeckyHub-${deckyHubTag}.zip`, digest: `sha256:${"a".repeat(64)}` }],
  };
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases/latest", (route) => route.fulfill({ json: deckyHubRelease }));
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=20", (route) => route.fulfill({ json: [deckyHubRelease] }));
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Update", exact: true }).click();
  await expect(app.getByRole("button", { name: `Reinstall v${deckyHubVersion}`, exact: true })).toBeVisible();
  await expect(app.getByRole("button", { name: "Download ZIP", exact: true })).toBeVisible();
  await expect(app.getByRole("button", { name: "Release Page", exact: true })).toBeVisible();
});

test("DeckyHub automatically notifies about an available update", async ({ page }) => {
  const newerRelease = {
    tag_name: "v9.9.9",
    prerelease: false,
    html_url: "https://github.com/mazillka/deckyhub-plugin/releases/tag/v9.9.9",
    assets: [{ name: "DeckyHub-v9.9.9.zip", browser_download_url: "https://github.com/mazillka/deckyhub-plugin/releases/download/v9.9.9/DeckyHub-v9.9.9.zip", digest: `sha256:${"b".repeat(64)}` }],
  };
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases/latest", (route) => route.fulfill({ json: newerRelease }));
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=20", (route) => route.fulfill({ json: [newerRelease] }));
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await expect(app.getByText("DeckyHub: DeckyHub update v9.9.9 is available.")).toBeVisible();
  await app.getByRole("button", { name: "Update (v9.9.9 available)", exact: true }).click();
  await expect(app.getByRole("button", { name: "Update to v9.9.9", exact: true })).toBeVisible();
  await expect(app.getByRole("button", { name: "Release Page", exact: true })).toBeVisible();
});

test("DeckyHub version picker offers to downgrade to an older release", async ({ page }) => {
  const installedRelease = {
    tag_name: deckyHubTag,
    prerelease: false,
    html_url: `https://github.com/mazillka/deckyhub-plugin/releases/tag/${deckyHubTag}`,
    assets: [{ name: `DeckyHub-${deckyHubTag}.zip`, browser_download_url: `https://github.com/mazillka/deckyhub-plugin/releases/download/${deckyHubTag}/DeckyHub-${deckyHubTag}.zip`, digest: `sha256:${"a".repeat(64)}` }],
  };
  const olderRelease = {
    tag_name: "v0.9.0",
    prerelease: false,
    html_url: "https://github.com/mazillka/deckyhub-plugin/releases/tag/v0.9.0",
    assets: [{ name: "DeckyHub-v0.9.0.zip", browser_download_url: "https://github.com/mazillka/deckyhub-plugin/releases/download/v0.9.0/DeckyHub-v0.9.0.zip", digest: `sha256:${"c".repeat(64)}` }],
  };
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases/latest", (route) => route.fulfill({ json: installedRelease }));
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=20", (route) => route.fulfill({ json: [installedRelease, olderRelease] }));
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Update", exact: true }).click();
  await expect(app.getByRole("button", { name: `Reinstall v${deckyHubVersion}`, exact: true })).toBeVisible();

  await app.getByLabel("Version").selectOption({ label: "v0.9.0" });

  await expect(app.getByRole("button", { name: "Downgrade to v0.9.0", exact: true })).toBeVisible();
});

test("DeckyHub's Check for Updates snaps the version picker back to the channel's latest", async ({ page }) => {
  const installedRelease = {
    tag_name: deckyHubTag,
    prerelease: false,
    html_url: `https://github.com/mazillka/deckyhub-plugin/releases/tag/${deckyHubTag}`,
    assets: [{ name: `DeckyHub-${deckyHubTag}.zip`, browser_download_url: `https://github.com/mazillka/deckyhub-plugin/releases/download/${deckyHubTag}/DeckyHub-${deckyHubTag}.zip`, digest: `sha256:${"a".repeat(64)}` }],
  };
  const olderRelease = {
    tag_name: "v0.9.0",
    prerelease: false,
    html_url: "https://github.com/mazillka/deckyhub-plugin/releases/tag/v0.9.0",
    assets: [{ name: "DeckyHub-v0.9.0.zip", browser_download_url: "https://github.com/mazillka/deckyhub-plugin/releases/download/v0.9.0/DeckyHub-v0.9.0.zip", digest: `sha256:${"c".repeat(64)}` }],
  };
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases/latest", (route) => route.fulfill({ json: installedRelease }));
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=20", (route) => route.fulfill({ json: [installedRelease, olderRelease] }));
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Update", exact: true }).click();

  // Pick the older release to inspect a downgrade...
  await app.getByLabel("Version").selectOption({ label: "v0.9.0" });
  await expect(app.getByLabel("Version")).toHaveValue("v0.9.0");

  // ...then explicitly check for updates: the selection should jump back to
  // the channel's newest release (here, the installed one), not stay parked
  // on whatever was selected before.
  await app.getByRole("button", { name: "Check for Updates", exact: true }).click();

  await expect(app.getByLabel("Version")).toHaveValue(deckyHubTag);
  await expect(app.getByRole("button", { name: `Reinstall v${deckyHubVersion}`, exact: true })).toBeVisible();
});

test("DeckyHub distinguishes rc versions sharing the same release number", async ({ page }) => {
  // Regression test: versionNumbers()'s regex used to strip the "-rc.N"
  // suffix entirely, so "1.0.3-rc.1"/"-rc.2"/"-rc.3" all parsed as the same
  // "1.0.3" and switching between them in the version picker always showed
  // "Reinstall" — never "Update" or "Downgrade" — no matter which was picked.
  const makeRelease = (tag: string) => ({
    tag_name: tag,
    prerelease: false,
    html_url: `https://github.com/mazillka/deckyhub-plugin/releases/tag/${tag}`,
    assets: [{ name: `DeckyHub-${tag}.zip`, browser_download_url: `https://github.com/mazillka/deckyhub-plugin/releases/download/${tag}/DeckyHub-${tag}.zip`, digest: `sha256:${"a".repeat(64)}` }],
  });
  const installedRelease = makeRelease(deckyHubTag);
  const olderRcRelease = makeRelease(olderRcTag);
  const newerRcRelease = makeRelease(newerRcTag);
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases/latest", (route) => route.fulfill({ json: installedRelease }));
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=20", (route) =>
    route.fulfill({ json: [newerRcRelease, installedRelease, olderRcRelease] })
  );
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Update", exact: true }).click();

  // The modal defaults to the channel's newest release (newerRcRelease is
  // versions[0] in the mocked list), not the installed one, so it shows
  // "Update to …" immediately rather than "Reinstall …".
  await expect(app.getByRole("button", { name: `Update to ${newerRcTag}`, exact: true })).toBeVisible();

  await app.getByLabel("Version").selectOption({ label: olderRcTag });
  await expect(app.getByRole("button", { name: `Downgrade to ${olderRcTag}`, exact: true })).toBeVisible();

  await app.getByLabel("Version").selectOption({ label: `${deckyHubTag} (installed)` });
  await expect(app.getByRole("button", { name: `Reinstall v${deckyHubVersion}`, exact: true })).toBeVisible();
});

test("DeckyHub falls back to a clear message when automatic update can't reach Decky Loader", async ({ page }) => {
  const deckyHubRelease = {
    tag_name: deckyHubTag,
    prerelease: false,
    html_url: `https://github.com/mazillka/deckyhub-plugin/releases/tag/${deckyHubTag}`,
    assets: [{ name: `DeckyHub-${deckyHubTag}.zip`, browser_download_url: `https://github.com/mazillka/deckyhub-plugin/releases/download/${deckyHubTag}/DeckyHub-${deckyHubTag}.zip`, digest: `sha256:${"a".repeat(64)}` }],
  };
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases/latest", (route) => route.fulfill({ json: deckyHubRelease }));
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=20", (route) => route.fulfill({ json: [deckyHubRelease] }));
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Update", exact: true }).click();

  // The dev mock never defines window.DeckyBackend, mirroring a Decky Loader
  // build old enough not to expose it — the same fallback path real users hit.
  await app.getByRole("button", { name: `Reinstall v${deckyHubVersion}`, exact: true }).click();

  await expect(app.getByText("Automatic update is unavailable right now — use Download ZIP instead.")).toBeVisible();
});

test("DeckyHub version picker re-filters by channel and leaves the channel as it found it", async ({ page }) => {
  const stableRelease = {
    tag_name: deckyHubTag,
    prerelease: false,
    html_url: `https://github.com/mazillka/deckyhub-plugin/releases/tag/${deckyHubTag}`,
    assets: [{ name: `DeckyHub-${deckyHubTag}.zip`, browser_download_url: `https://github.com/mazillka/deckyhub-plugin/releases/download/${deckyHubTag}/DeckyHub-${deckyHubTag}.zip`, digest: `sha256:${"a".repeat(64)}` }],
  };
  const prereleaseRelease = {
    tag_name: "v2.0.0-beta",
    prerelease: true,
    html_url: "https://github.com/mazillka/deckyhub-plugin/releases/tag/v2.0.0-beta",
    assets: [{ name: "DeckyHub-v2.0.0-beta.zip", browser_download_url: "https://github.com/mazillka/deckyhub-plugin/releases/download/v2.0.0-beta/DeckyHub-v2.0.0-beta.zip", digest: `sha256:${"d".repeat(64)}` }],
  };
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases/latest", (route) => route.fulfill({ json: stableRelease }));
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=20", (route) => route.fulfill({ json: [stableRelease, prereleaseRelease] }));
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Update", exact: true }).click();
  await expect(app.getByLabel("Version")).toHaveValue(deckyHubTag);

  await app.getByLabel("Update Channel").selectOption({ label: "Pre-releases" });

  await expect(app.getByLabel("Version")).toHaveValue("v2.0.0-beta");
  await expect(app.getByRole("button", { name: "Update to v2.0.0-beta", exact: true })).toBeVisible();

  // changeChannel() persists to the real (shared) settings.json via the dev
  // bridge, fire-and-forget from the UI's perspective — clicking the dropdown
  // back to "Stable" wouldn't reliably outlast the test (Playwright tears the
  // page down as soon as this function returns, racing the unawaited save).
  // Round-trip the bridge directly and await it so the reset actually lands
  // before this test — and the suite — finishes.
  await page.evaluate(async () => {
    const bridge = "http://127.0.0.1:8643";
    const call = (route: string, ...args: unknown[]) =>
      fetch(bridge, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ route, args }) }).then((res) => res.json());
    const { result: settings } = await call("get_settings");
    await call("save_settings", { ...settings, updateChannel: "stable" });
  });
});

test("DeckyHub update modal's Close button is full width and dismisses the modal", async ({ page }) => {
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Update", exact: true }).click();

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
  await page.goto("/?preview=/deckyhub/repositories&bridge=http://127.0.0.1:8643");
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

test("Discover reports an empty filtered result", async ({ page }) => {
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();
  await app.getByLabel("Search").fill("does-not-exist");

  await expect(app.getByRole("heading", { name: "No repositories are available." })).toBeVisible();
});

test("A GitHub rate limit surfaces a friendly message instead of a raw status code", async ({ page }) => {
  const resetInTwoMinutes = Math.floor(Date.now() / 1000) + 120;
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) =>
    route.fulfill({
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetInTwoMinutes) },
      json: { message: "API rate limit exceeded" },
    })
  );
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();

  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await expect(makoCard.getByText(/GitHub API rate limit reached/)).toBeVisible();
  await expect(makoCard.getByText("GitHub API returned 403", { exact: true })).toBeHidden();
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

  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");
  await makoCard.getByRole("button", { name: "Details", exact: true }).click();

  const modal = app.locator(".steam-modal");
  await expect(modal.getByRole("button", { name: "Download", exact: true })).toBeVisible();
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
  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");

  await makoCard.getByRole("button", { name: "Details", exact: true }).click();
  await expect(app.locator(".steam-modal").getByRole("button", { name: "Download", exact: true })).toBeVisible();
  await app.locator(".steam-modal").getByRole("button", { name: "Close", exact: true }).click();

  // hydrate() (the card itself) and listAppReleases() (the modal) hit the
  // same endpoint independently, so opening Details fresh costs 2 requests —
  // reopening it should add none, since both are still within CACHE_TTL.
  const requestsAfterFirstOpen = requests;
  await makoCard.getByRole("button", { name: "Details", exact: true }).click();
  await expect(app.locator(".steam-modal").getByRole("button", { name: "Download", exact: true })).toBeVisible();

  expect(requests).toBe(requestsAfterFirstOpen);
});

const makoReleases = [
  {
    tag_name: "plugin-v1.3.0",
    prerelease: false,
    draft: false,
    html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/plugin-v1.3.0",
    assets: [{ name: "mako-decky-1.zip", browser_download_url: "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.3.0/mako-decky-1.zip", size: 2048 }],
  },
  {
    tag_name: "plugin-v1.2.3",
    prerelease: false,
    draft: false,
    html_url: "https://github.com/eugeniosegala/MAKO/releases/tag/plugin-v1.2.3",
    assets: [{ name: "mako-decky-1.zip", browser_download_url: "https://github.com/eugeniosegala/MAKO/releases/download/plugin-v1.2.3/mako-decky-1.zip", size: 1024 }],
  },
  {
    tag_name: "plugin-v1.4.0-beta",
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
  await makoCard.getByRole("button", { name: "Details", exact: true }).click();

  // Every card on the page also has its own "Installed: —" line, so scope
  // assertions to the modal itself rather than the whole (iframe) document.
  const modal = app.locator(".steam-modal");
  await expect(modal.getByText("Installed: —", { exact: true })).toBeVisible();
  await expect(modal.getByLabel("Version")).toHaveValue("plugin-v1.3.0");
  await expect(modal.getByRole("button", { name: "Download", exact: true })).toBeVisible();
  await expect(modal.getByRole("button", { name: "Release Page", exact: true })).toBeVisible();

  await modal.getByLabel("Version").selectOption({ label: "vplugin-v1.2.3" });
  await expect(modal.getByLabel("Version")).toHaveValue("plugin-v1.2.3");

  await modal.getByRole("button", { name: "Close", exact: true }).click();
  await expect(modal).toBeHidden();
});

test("Discover's Details modal channel picker updates the card's Channel label", async ({ page }) => {
  await page.route("https://api.github.com/repos/eugeniosegala/MAKO/releases?per_page=20", (route) => route.fulfill({ json: makoReleases }));
  await page.goto("/?preview=/deckyhub/discover&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  const makoCard = app.getByRole("heading", { name: "MAKO Decky" }).locator("..");

  await expect(makoCard.getByText("Channel: Stable", { exact: true })).toBeVisible();

  try {
    await makoCard.getByRole("button", { name: "Details", exact: true }).click();
    await app.getByLabel("Update Channel").selectOption({ label: "Pre-releases" });
    await expect(app.getByLabel("Version")).toHaveValue("plugin-v1.4.0-beta");

    await app.getByRole("button", { name: "Close", exact: true }).click();
    await expect(makoCard.getByText("Channel: Pre-release", { exact: true })).toBeVisible();
  } finally {
    // save_repo_settings persists to the real (shared) settings.json via the
    // dev bridge — round-trip it back to the default directly so this test
    // doesn't leave MAKO's channel overridden for later tests/runs.
    await page.evaluate(async () => {
      const bridge = "http://127.0.0.1:8643";
      const call = (route: string, ...args: unknown[]) =>
        fetch(bridge, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ route, args }) }).then((res) => res.json());
      await call("save_repo_settings", "eugeniosegala/MAKO", { channel: "stable", assetFilter: [] });
    });
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
