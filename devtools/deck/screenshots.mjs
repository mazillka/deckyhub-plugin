// Takes the README's and website's screenshots on a real Deck (1280x800, Gaming Mode):
//   DECK=192.168.1.209:8081 node devtools/deck/screenshots.mjs [out-dir]
// Writes PNGs to out-dir (default devtools/deck/screenshots/readme/); turn them into the
// JPGs in screenshots/ with `python devtools/deck/screenshots_to_jpg.py <out-dir>`.
// For a stable-looking version label deploy first with DECKYHUB_VERSION=3.2.0 (see deploy.mjs).
// Opens pages with goTo (no clicks on anything that changes state); nothing is installed.
import { mkdirSync, writeFileSync } from "node:fs";
import { connect, resetFocus, sleep, TARGETS, waitFor } from "./cdp.mjs";

const out = new URL(`file:///${(process.argv[2] ?? new URL("./screenshots/readme/", import.meta.url).pathname).replace(/^\//, "").replace(/\/?$/, "/")}`);
mkdirSync(out, { recursive: true });
const TAB_ID = 0x444855; // src/components/QuickAccessTab.tsx
const shared = await connect(TARGETS.shared);
const main = await connect(TARGETS.main);
const startPath = await shared.eval("location.pathname.slice('/routes'.length)");
const shot = async (name) => { writeFileSync(new URL(`${name}.png`, out), await main.screenshot()); console.log("saved", name); };
const click = (label, root = "body") => main.eval(`(() => { const b = [...document.querySelectorAll("${root} button, ${root} .DialogButton")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)})); b?.click(); return !!b; })()`);
const closeWindows = () => main.eval(`[...document.querySelectorAll("button, .DialogButton")].filter((b) => b.textContent.trim() === "Close").forEach((b) => b.click()); true`);
// DeckyHub's settings, for the stable list and release channel while shooting (the public images
// show neither the pre-release registry nor its extra plugins); the originals come back at the end.
const callPlugin = (method, ...args) => shared.eval(`DeckyBackend.call("loader/call_plugin_method", "DeckyHub", ${JSON.stringify(method)}, ${args.map((arg) => JSON.stringify(arg)).join(", ")}).then((result) => JSON.stringify(result))`).then(JSON.parse);
const original = await callPlugin("get_settings");
const page = async (name) => {
  await closeWindows();
  // Through the library home first, so Steam's own search box isn't left focused at the top.
  await resetFocus(shared, `/deckyhub/${name}`);
  await waitFor(main, `!!document.querySelector(".deckyhub-motion") && !document.querySelector(".deckyhub-motion .Throbber, .deckyhub-motion [class*=Spinner]")`, 30000);
  await sleep(3000);
};

const layout = await main.eval(`localStorage.getItem("deckyhub-layout")`);
try {
  // Also the grid layout and default density, as a first-time user sees them (list + compact come back at the end).
  await callPlugin("save_settings", { ...original, registryChannel: "stable", updateChannel: "stable", density: "default" });
  await main.eval(`localStorage.setItem("deckyhub-layout", "grid"); true`);
  await sleep(15000); // the stable list loads in the background
  await page("discover");
  await shot("discover");
  // The promo images' Discover: scrolled to the category chips and the popular cards.
  await main.eval(`document.querySelector(".deckyhub-category-chips").scrollIntoView({ block: "start" }); true`);
  await sleep(1200);
  await shot("discover-promo");

  await click("All plugins", ".deckyhub-category-chips");
  await waitFor(main, `!!document.querySelector(".deckyhub-back-button")`);
  await sleep(2500);
  await shot("all-plugins");

  // Manage of the first plugin with scans: Decky LSFG-VK, found through the search box.
  await main.eval(`(() => { const i = document.querySelector(".deckyhub-motion input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "lsfg"); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  await sleep(2500);
  await main.eval(`(() => { const h = [...document.querySelectorAll(".deckyhub-motion h3")].find((x) => /LSFG-VK/i.test(x.textContent)); let card = h; const isM = (b) => b.textContent.trim() === "Manage" || b.getAttribute("aria-label") === "Manage"; while (card && ![...card.querySelectorAll("button, .DialogButton")].some(isM)) card = card.parentElement; [...card.querySelectorAll("button, .DialogButton")].find(isM).click(); return true; })()`);
  await waitFor(main, `!!document.querySelector(".deckyhub-details") && !!document.querySelector(".deckyhub-virus-scan .deckyhub-scan-clamav")`, 30000);
  await sleep(2500);
  await shot("manage");
  // The full scan report window over it, then both close.
  await click("Scan report", ".deckyhub-virus-scan");
  await waitFor(main, `document.body.innerText.includes("Virus scan report")`, 15000);
  await sleep(1500);
  await shot("scan-report");
  await main.eval(`[...document.querySelectorAll("button, .DialogButton")].filter((b) => ["OK", "Close"].includes(b.textContent.trim())).forEach((b) => b.click()); true`);
  await sleep(800);
  await closeWindows();

  await page("updates");
  await shot("updates");

  await page("search");
  await main.eval(`(() => { const i = document.querySelector(".deckyhub-motion input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "frame generation"); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  await click("Search", ".deckyhub-motion");
  await waitFor(main, `document.querySelector(".deckyhub-motion").innerText.includes("In DeckyHub")`, 40000);
  await sleep(2000);
  await shot("search");

  await page("settings");
  await shot("settings");

  await closeWindows();
  await resetFocus(shared, "/library/home");
  await shared.eval(`DFL.Navigation.OpenQuickAccessMenu(${TAB_ID}); true`);
  await sleep(3000);
  // The panel is its own window: the main screen behind it and the panel are joined by screenshots_to_jpg.py.
  await shot("menu-background");
  const quickAccess = await connect(TARGETS.quickAccess);
  writeFileSync(new URL("menu-panel.png", out), await quickAccess.screenshot());
  quickAccess.close();
} finally {
  await callPlugin("save_settings", original).catch(() => {});
  await main.eval(`${layout === null ? 'localStorage.removeItem("deckyhub-layout")' : `localStorage.setItem("deckyhub-layout", ${JSON.stringify(layout)})`}; true`).catch(() => {});
  await resetFocus(shared, startPath || "/library/home").catch(() => {});
  shared.close();
  main.close();
}
