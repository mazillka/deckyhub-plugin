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

test("Repository tabs switch without leaving the page", async ({ page }) => {
  await page.goto("/?preview=/deckyhub/repositories&bridge=http://127.0.0.1:8643");
  const app = mock(page);

  await app.getByRole("button", { name: "Repository Settings", exact: true }).click();
  await expect(app.getByText("Per-repo release, folder, and asset overrides.")).toBeVisible();

  await app.getByRole("button", { name: "Add & Manage", exact: true }).click();
  await expect(app.getByLabel("Search GitHub")).toBeVisible();
  await expect(page).toHaveURL(/preview=\/deckyhub\/repositories/);
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
  await expect(app.locator(":focus")).not.toHaveText("Refresh");
  await app.locator(":focus").press("ArrowLeft");
  await expect(app.locator(":focus")).toBeVisible();
  await app.locator(":focus").press("ArrowUp");
  await expect(app.locator(":focus")).toBeVisible();
});
