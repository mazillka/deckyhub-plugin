import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const bridge = "http://127.0.0.1:8643";
const cache = new URL("../.dev-data/settings/registry-cache.json", import.meta.url);

test("catalog and install staging recover after a network outage", async ({ page, request }) => {
  const before = existsSync(cache) ? readFileSync(cache) : null;
  const call = async (route: string, ...args: unknown[]) => {
    const response = await request.post(bridge, {
      headers: { Origin: "http://127.0.0.1:5183" },
      data: { route, args },
    });
    const result = await response.json();
    expect(result.ok).toBe(true);
    return result.result;
  };
  const asset = { name: "fixture.zip", url: "https://github.com/example/fixture-app/releases/download/v1/fixture.zip" };
  try {
    await call("mock_network_mode", "fixture");
    await call("refresh_registry");
    expect((await call("get_apps")).registryStatus.source).toBe("network");
    await call("mock_network_mode", "offline");
    await call("refresh_registry");
    const cached = (await call("get_apps")).registryStatus;
    expect(cached.source).toBe("cache");
    expect(cached.updatedAt).toBeGreaterThan(0);
    expect((await call("stage_install", asset, "example/fixture-app", "offline-job")).error).toContain(
      "network outage",
    );
    await page.route("https://**/*", (route) => route.fulfill({ json: {} }));
    await page.goto(`/?preview=/deckyhub/discover&bridge=${bridge}`);
    await expect(page.frameLocator("iframe").getByRole("status")).toContainText("Official catalog loaded from cache");
    await call("mock_network_mode", "fixture");
    await call("refresh_registry");
    expect((await call("get_apps")).registryStatus.source).toBe("network");
    expect((await call("stage_install", asset, "example/fixture-app", "online-job")).path).toContain("fixture.zip");
    await page.reload();
    await expect(page.frameLocator("iframe").getByRole("status")).toContainText("Official catalog updated online");
  } finally {
    await call("mock_network_mode", "normal");
    if (before) writeFileSync(cache, before);
    else if (existsSync(cache)) unlinkSync(cache);
    await call("mock_reload_cached_registry");
  }
});
