import { expect, test, type Page } from "@playwright/test";

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
  await app.getByRole("button", { name: "Discover", exact: true }).click();

  await expect(app.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
  await expect(app.getByText("STEAM", { exact: true })).toBeVisible();
  await expect(app.getByRole("heading", { name: "MAKO Decky · Frame Generation" })).toBeVisible();
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

test("Repository tabs switch without leaving the page", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/repositories&bridge=http://127.0.0.1:8643");
  const app = mock(page);

  await app.getByRole("button", { name: "Repository Settings", exact: true }).click();
  await expect(app.getByText("Per-repo release, folder, and asset overrides.")).toBeVisible();

  await app.getByRole("button", { name: "Add & Manage", exact: true }).click();
  await expect(app.getByLabel("Search GitHub")).toBeVisible();
  await expect(page).toHaveURL(/preview=\/deckyhub\/repositories/);
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
  await page.goto("/?preview=/deckyhub/settings&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Clear DeckyHub Downloads", exact: true }).click();

  await expect(app.getByText("Permanently remove all files in /home/deck/Downloads/deckyhub?")).toBeVisible();
  await app.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("DeckyHub hides a matching update package", async ({ page }) => {
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases/latest", (route) =>
    route.fulfill({
      json: {
        tag_name: "v0.4.22",
        html_url: "https://github.com/mazillka/deckyhub-plugin/releases/tag/v0.4.22",
        assets: [{ name: "DeckyHub-v0.4.22.zip", browser_download_url: "https://github.com/mazillka/deckyhub-plugin/releases/download/v0.4.22/DeckyHub-v0.4.22.zip", digest: `sha256:${"a".repeat(64)}` }],
      },
    })
  );
  await page.goto("/?preview=/deckyhub/settings&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Check Update", exact: true }).click();

  await expect(app.getByText("No update available.")).toBeVisible();
  await expect(app.getByRole("button", { name: "Download Update", exact: true })).toBeHidden();
});

test("DeckyHub notifies about an available update", async ({ page }) => {
  await page.route("https://api.github.com/repos/mazillka/deckyhub-plugin/releases/latest", (route) =>
    route.fulfill({
      json: {
        tag_name: "v9.9.9",
        html_url: "https://github.com/mazillka/deckyhub-plugin/releases/tag/v9.9.9",
        assets: [{ name: "DeckyHub-v9.9.9.zip", browser_download_url: "https://github.com/mazillka/deckyhub-plugin/releases/download/v9.9.9/DeckyHub-v9.9.9.zip", digest: `sha256:${"b".repeat(64)}` }],
      },
    })
  );
  await page.goto("/?preview=/deckyhub/settings&bridge=http://127.0.0.1:8643");
  const app = mock(page);
  await app.getByRole("button", { name: "Check Update", exact: true }).click();

  await expect(app.getByText("DeckyHub: DeckyHub update v9.9.9 is available.")).toBeVisible();
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

test("Discover exposes every matching release asset", async ({ page }) => {
  const app = mock(page);
  await app.getByRole("button", { name: "/deckyhub/discover" }).click();

  const makoCard = app.getByRole("heading", { name: "MAKO Decky · Frame Generation" }).locator("..");
  await expect(makoCard.getByRole("button", { name: "mako-decky-5.zip (1 KB)" })).toBeVisible();
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
