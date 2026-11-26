import { expect, test } from "@playwright/test";

test("The Ko-fi button opens a window with a QR code and an Open button for the page", async ({ page, context }) => {
  // The real page is never loaded: only the address the Open button asks for is checked.
  await context.route("https://ko-fi.com/**", (route) => route.fulfill({ body: "<title>Ko-fi</title>" }));
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = page.frameLocator("iframe");
  await app.getByRole("button", { name: "Support Development & Maintenance" }).click();

  const modal = app.locator(".steam-modal");
  await expect(modal.getByText("Support DeckyHub")).toBeVisible();
  await expect(modal.locator("img")).toBeVisible();
  await expect(modal.getByText("ko-fi.com/mazillka")).toBeVisible();

  const popup = page.waitForEvent("popup");
  await modal.getByRole("button", { name: "Open" }).click();
  expect((await popup).url()).toBe("https://ko-fi.com/mazillka");
  await expect(app.locator(".steam-modal")).toHaveCount(0);
});

test("The Ko-fi window closes with Close and opens nothing", async ({ page }) => {
  await page.goto("/?bridge=http://127.0.0.1:8643");
  const app = page.frameLocator("iframe");
  await app.getByRole("button", { name: "Support Development & Maintenance" }).click();
  await app.locator(".steam-modal").getByRole("button", { name: "Close" }).click();
  await expect(app.locator(".steam-modal")).toHaveCount(0);
});

test("Settings can hide the support button, and Remote Control while it's off", async ({ page }) => {
  // The bridge only answers its own page's origin.
  const save = (settings: object) =>
    page.request.post("http://127.0.0.1:8643", {
      headers: { Origin: "http://127.0.0.1:5183" },
      data: { route: "save_settings", args: [settings] },
    });
  const app = page.frameLocator("iframe");
  const support = app.getByRole("button", { name: "Support Development & Maintenance" });
  const remote = app.getByLabel("Remote access");
  try {
    expect((await save({})).ok()).toBe(true);
    await page.goto("/?bridge=http://127.0.0.1:8643");
    await expect(support).toBeVisible();
    await expect(remote).toBeVisible();

    await save({ hideSupport: true, hideRemoteWhenOff: true });
    await page.reload();
    await expect(app.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
    await expect(support).toHaveCount(0);
    await expect(remote).toHaveCount(0);
  } finally {
    await save({});
  }
});
