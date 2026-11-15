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
