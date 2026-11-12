// Takes the Remote Install manual's screenshots: a real Deck (Gaming Mode) and a browser on this
// computer go through pairing and one request, for real.
//   DECK=192.168.1.209:8081 node devtools/deck/remote-screenshots.mjs [out-dir] [plugin-id]
// Needs devtools/decky-mock's packages (npm ci there) and its Chromium (npx playwright install chromium).
// Writes PNGs to out-dir (default devtools/deck/screenshots/remote/); turn them into the JPGs in
// screenshots/ with `python devtools/deck/screenshots_to_jpg.py <out-dir> remote`.
// It turns Pair mode on, pairs this browser, sends an install request for plugin-id and REJECTS it,
// then removes the pairing and puts Pair mode back: nothing is installed and nothing stays paired.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "../decky-mock/node_modules/@playwright/test/index.mjs";
import { connect, resetFocus, sleep, TARGETS, waitFor } from "./cdp.mjs";

const SITE = process.env.SITE ?? "https://deckyhub.com/develop/";
const out = new URL(
  `file:///${(process.argv[2] ?? new URL("./screenshots/remote/", import.meta.url).pathname).replace(/^\//, "").replace(/\/?$/, "/")}`,
);
const pluginId = process.argv[3] ?? "simpledeckytdp";
mkdirSync(out, { recursive: true });
const TAB_ID = 0x444855; // src/components/QuickAccessTab.tsx
const BROWSER_NAME = "Chrome on my laptop";

const shared = await connect(TARGETS.shared);
const main = await connect(TARGETS.main);
const startPath = await shared.eval("location.pathname.slice('/routes'.length)");
const callPlugin = (method, ...args) =>
  shared
    .eval(
      `DeckyBackend.call("loader/call_plugin_method", "DeckyHub", ${JSON.stringify(method)}, ${args.map((arg) => JSON.stringify(arg)).join(", ")}).then((result) => JSON.stringify(result ?? null))`,
    )
    .then(JSON.parse);
const status = () => callPlugin("get_remote_install_status");
const until = async (what, test, timeout = 60000) => {
  const end = Date.now() + timeout;
  for (;;) {
    const found = test(await status());
    if (found) return found;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(500);
  }
};
// The Quick Access panel is its own window: the main screen behind it and the panel are joined by
// screenshots_to_jpg.py, as for the menu screenshot. `top` is the text the panel is scrolled to.
const panelShot = async (name, top) => {
  const panel = await connect(TARGETS.quickAccess);
  await panel.eval(
    `(() => { const el = [...document.querySelectorAll("div, span")].filter((x) => x.children.length === 0 && x.textContent.trim().startsWith(${JSON.stringify(top)})).at(-1); el?.scrollIntoView({ block: "start" }); return !!el; })()`,
  );
  await sleep(1500);
  writeFileSync(new URL(`${name}-background.png`, out), await main.screenshot());
  writeFileSync(new URL(`${name}-panel.png`, out), await panel.screenshot());
  panel.close();
  console.log("saved", name);
};

const before = await status();
const pairedBefore = new Set(before.devices.map((device) => device.id));
let browser;
try {
  const on = before.enabled ? before : await callPlugin("set_remote_install_enabled", true);
  const ready = on.active
    ? on
    : await until("the listener", (now) => (now.error ? Promise.reject(new Error(now.error)) : now.active && now));
  await resetFocus(shared, "/library/home");
  await shared.eval(`DFL.Navigation.OpenQuickAccessMenu(${TAB_ID}); true`);
  await sleep(4000);
  const title = await (async () => {
    const panel = await connect(TARGETS.quickAccess);
    const found = await waitFor(
      panel,
      `[...document.querySelectorAll("div")].map((x) => x.children.length === 0 && x.textContent.trim()).find((text) => text && /^Remote Install/.test(text)) || null`,
      20000,
    );
    panel.close();
    return found;
  })();
  // Pair browser draws the QR code (turning Pair mode on by hand does that by itself).
  const qr = await connect(TARGETS.quickAccess);
  await qr.eval(
    `(() => { const onTop = (b) => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && b.contains(e); }; [...document.querySelectorAll("button, .DialogButton")].find((b) => b.textContent.trim() === "Pair browser" && onTop(b))?.click(); return true; })()`,
  );
  await waitFor(qr, `!!document.querySelector('img[src^="data:image"]')`, 15000).catch(() => {});
  qr.close();
  await sleep(1500);
  await panelShot("remote-pair-mode", "Pair mode");

  // A pairing link of our own, like the one behind the QR code.
  const ticket = await callPlugin("begin_remote_pairing");
  const link = new URLSearchParams({
    device: new URL(ready.address).host,
    fingerprint: ready.fingerprint,
    pair: ticket.pairingToken,
    ...(ready.deviceName && { name: ready.deviceName }),
  });
  browser = await chromium.launch({ args: ["--disable-features=LocalNetworkAccessChecks"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.grantPermissions(["local-network-access"]).catch(() => {});
  const page = await context.newPage();
  // The page calls itself "Browser"; the manual shows a friendlier name. Set while the page is
  // parsed, before its script pairs with the link.
  await page.addInitScript((name) => {
    new MutationObserver((_, observer) => {
      const input = document.querySelector("#remote-name");
      if (!input) return;
      input.value = name;
      input.setAttribute("value", name);
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  }, BROWSER_NAME);
  await page.goto(`${SITE}paired-devices/#${link}`);
  const pairing = await until("the pairing request", (now) => now.pairings[0]);
  await panelShot("remote-pairing-request", title);
  await callPlugin("decide_remote_pairing", pairing.id, true);
  await page.waitForSelector("#remote-plugins li", { timeout: 60000 });
  // The preview site's banner isn't part of what a user of the live site sees.
  const hideBanner = () =>
    page.evaluate(() => [...document.body.children].find((el) => el.textContent.startsWith("Preview build"))?.remove());
  await hideBanner();
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(1000);
  await page.screenshot({ path: new URL("remote-paired-devices.png", out).pathname.replace(/^\/(\w:)/, "$1") });
  console.log("saved remote-paired-devices");

  await page.goto(`${SITE}plugins/${pluginId}.html`);
  await page.waitForSelector("#remote-request:not([hidden]):not([disabled])", { timeout: 60000 });
  await hideBanner();
  await page.locator("#remote-install").scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, -260));
  await sleep(800);
  await page.screenshot({ path: new URL("remote-send-to-device.png", out).pathname.replace(/^\/(\w:)/, "$1") });
  console.log("saved remote-send-to-device");
  await page.click("#remote-request");
  const request = await until("the install request", (now) => now.requests[0]);
  await panelShot("remote-request", title);
  await callPlugin("decide_remote_request", request.id, false);
  await page.waitForFunction(
    () => /rejected/i.test(document.querySelector("#remote-status")?.textContent ?? ""),
    null,
    {
      timeout: 30000,
    },
  );
} finally {
  await browser?.close().catch(() => {});
  const after = await status().catch(() => null);
  for (const pending of after?.pairings ?? [])
    await callPlugin("decide_remote_pairing", pending.id, false).catch(() => {});
  for (const pending of after?.requests ?? [])
    await callPlugin("decide_remote_request", pending.id, false).catch(() => {});
  for (const device of after?.devices ?? [])
    if (!pairedBefore.has(device.id)) await callPlugin("revoke_remote_device", device.id).catch(() => {});
  if (!before.enabled) await callPlugin("set_remote_install_enabled", false).catch(() => {});
  await shared.eval(`DFL.Navigation.CloseSideMenus?.(); true`).catch(() => {});
  await resetFocus(shared, startPath || "/library/home").catch(() => {});
  shared.close();
  main.close();
}
