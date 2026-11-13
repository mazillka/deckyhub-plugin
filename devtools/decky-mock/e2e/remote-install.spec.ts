import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

// Remote Install in the Quick Access panel and its windows. dev-server.py stands in for the network
// (a fake listener, and a fake paired browser driven through the mock_remote_browser_* routes), so the
// real pairing, approval and request code runs.
const BRIDGE = "http://127.0.0.1:8643";
const mock = (page: Page) => page.frameLocator("iframe");

const bridge = async (page: Page, route: string, ...args: unknown[]) => {
  const response = await page.request.post(BRIDGE, {
    headers: { Origin: "http://127.0.0.1:5183" },
    data: { route, args },
  });
  const body = (await response.json()) as { ok: boolean; result: unknown; error?: string };
  if (!body.ok) throw new Error(body.error);
  return body.result as Record<string, unknown> & { devices?: { id: string }[] };
};

// What Decky Loader would be asked to do, for the install, enable and disable calls.
const recordLoader = (page: Page) =>
  page.addInitScript(() => {
    const calls: unknown[][] = [];
    Object.assign(window, {
      __loaderCalls: calls,
      DeckyBackend: {
        call: async (...args: unknown[]) => void calls.push(args),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  });
const loaderCalls = (page: Page) =>
  page
    .frames()
    .find((candidate) => candidate !== page.mainFrame())!
    .evaluate(() => (window as unknown as { __loaderCalls: unknown[][] }).__loaderCalls);

const settingsDir = new URL("../.dev-data/settings/", import.meta.url);
const pluginDir = new URL("../.dev-data/plugins/e2e-remote-toggle/", import.meta.url);

// Remote access off and no paired browsers, so the next test starts clean.
async function cleanUp(page: Page) {
  const status = await bridge(page, "get_remote_install_status");
  for (const device of status.devices ?? []) await bridge(page, "revoke_remote_device", device.id);
  await bridge(page, "set_remote_install_enabled", false);
  await bridge(page, "mock_remote_browser_forget");
  rmSync(pluginDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  rmSync(new URL("loader.json", settingsDir), { force: true });
}

test.afterEach(async ({ page }) => cleanUp(page));

test("Pairing opens in a window; the panel only has the button", async ({ page }) => {
  await bridge(page, "set_remote_install_enabled", true);
  await page.goto(`/?bridge=${BRIDGE}`);
  const app = mock(page);
  const panel = app.locator(".qam-content");
  await expect(panel.getByRole("button", { name: "Pair a device" })).toBeVisible();
  // Nothing of the pairing (QR code, code, countdown) is crowded into the narrow panel.
  await expect(panel.getByText("Scan to open Paired devices")).toHaveCount(0);

  await panel.getByRole("button", { name: "Pair a device" }).click();
  const modal = app.locator(".steam-modal");
  await expect(modal.getByText("Scan to open Paired devices")).toBeVisible();
  await expect(modal.locator("img")).toBeVisible();
  await expect(modal.getByText(/^\d{6}$/)).toBeVisible();
  await expect(modal.getByText("Both devices must be on the same Wi-Fi.")).toBeVisible();

  await modal.getByRole("button", { name: "Close" }).click();
  await expect(app.locator(".steam-modal")).toHaveCount(0);
});

test("A browser asking to pair is answered inside the window, then listed with Trusted and Remove", async ({
  page,
}) => {
  await bridge(page, "set_remote_install_enabled", true);
  await page.goto(`/?bridge=${BRIDGE}`);
  const app = mock(page);
  await app.locator(".qam-content").getByRole("button", { name: "Pair a device" }).click();
  const modal = app.locator(".steam-modal");
  await expect(modal.locator("img")).toBeVisible();

  await bridge(page, "mock_remote_browser_pair", "E2E phone");
  await expect(modal.getByText("E2E phone wants to pair")).toBeVisible();
  await modal.getByRole("button", { name: "Approve" }).click();
  await expect(modal.getByText("E2E phone is paired.", { exact: false })).toBeVisible();
  await modal.getByRole("button", { name: "Close" }).click();

  await app
    .locator(".qam-content")
    .getByRole("button", { name: /Paired browsers/ })
    .click();
  const browsers = app.locator(".steam-modal");
  await expect(browsers.getByText("E2E phone")).toBeVisible();
  await expect(browsers.getByText("Trusted")).toBeVisible();
  await browsers.getByRole("button", { name: "Remove" }).click();
  await expect(browsers.getByText("No paired browsers yet.")).toBeVisible();
});

test("A remote disable request is approved on the device and switches the plugin off through Decky Loader", async ({
  page,
}) => {
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(new URL("plugin.json", pluginDir), JSON.stringify({ name: "E2E Toggle", version: "1.0.0" }));
  await bridge(page, "set_remote_install_enabled", true);
  await recordLoader(page);
  await page.goto(`/?bridge=${BRIDGE}`);
  const app = mock(page);

  // Pair a browser (approved through the backend), then let it ask for the plugin to be switched off.
  const { pairingId } = (await bridge(page, "mock_remote_browser_pair", "E2E phone")) as { pairingId: string };
  await bridge(page, "decide_remote_pairing", pairingId, true);
  const listed = (await bridge(page, "mock_remote_browser_send", { op: "plugins" })) as {
    plugins: { pluginName: string; disabled: boolean }[];
  };
  expect(listed.plugins.find((plugin) => plugin.pluginName === "E2E Toggle")?.disabled).toBe(false);
  const { requestId } = (await bridge(page, "mock_remote_browser_send", {
    op: "request",
    idempotencyKey: "e2e-disable",
    action: "disable",
    pluginNames: ["E2E Toggle"],
  })) as { requestId: string };

  const panel = app.locator(".qam-content");
  await expect(panel.getByText("Disable · E2E Toggle")).toBeVisible();
  expect(await loaderCalls(page)).toEqual([]);
  // Decky Loader records the choice in its own settings; the mock's stand-in writes it where the backend reads it.
  writeFileSync(new URL("loader.json", settingsDir), JSON.stringify({ disabled_plugins: ["E2E Toggle"] }));
  await panel.getByRole("button", { name: "Approve" }).click();
  const confirm = app.locator(".steam-modal", { hasText: "Disable E2E Toggle?" });
  await confirm.getByRole("button", { name: "Disable", exact: true }).click();

  await expect.poll(() => loaderCalls(page)).toEqual([["utilities/disable_plugin", "E2E Toggle"]]);
  await expect
    .poll(
      async () =>
        ((await bridge(page, "mock_remote_browser_send", { op: "status", requestId })) as { status: string }).status,
    )
    .toBe("disabled");
  const after = (await bridge(page, "mock_remote_browser_send", { op: "plugins" })) as {
    plugins: { pluginName: string; disabled: boolean }[];
  };
  expect(after.plugins.find((plugin) => plugin.pluginName === "E2E Toggle")?.disabled).toBe(true);
});

test("A paired browser reads the updates the device reported", async ({ page }) => {
  await bridge(page, "set_remote_install_enabled", true);
  const { pairingId } = (await bridge(page, "mock_remote_browser_pair", "E2E phone")) as { pairingId: string };
  await bridge(page, "decide_remote_pairing", pairingId, true);
  await bridge(page, "set_remote_updates", [{ name: "E2E Toggle", version: "2.0.0" }]);
  const summary = await bridge(page, "mock_remote_browser_send", { op: "summary" });
  expect(summary.updates).toEqual([{ name: "E2E Toggle", version: "2.0.0" }]);
});
