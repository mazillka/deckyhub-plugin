// Runs DeckyHub on a real Deck through many setups and audits every screen in each
// (audit.js: text cut off or off screen, rows out of line, unnamed controls, low
// contrast). Your DeckyHub settings and saved layout come back exactly as they were.
//   DECK=192.168.1.209:8081 node devtools/deck/scenarios.mjs [scenario …]
import { readFileSync } from "node:fs";
import { connect, goTo, resetFocus, sleep, TARGETS, waitFor } from "./cdp.mjs";
import { BUTTON, explore, press } from "./navigation.mjs";

const AUDIT = readFileSync(new URL("./audit.js", import.meta.url), "utf8");
const LANGUAGES = [
  "en",
  "uk",
  "ru",
  "es",
  "de",
  "fr",
  "pt",
  "pt-PT",
  "it",
  "pl",
  "tr",
  "nl",
  "cs",
  "ja",
  "ko",
  "zh",
  "zh-TW",
];
const PAGES = ["discover", "updates", "search", "settings"];
const TAB_ID = 0x444855;

const shared = await connect(TARGETS.shared);
const main = await connect(TARGETS.main);
const quickAccess = await connect(TARGETS.quickAccess);
const backend = (method, ...args) =>
  shared.eval(
    `DeckyBackend.call("loader/call_plugin_method", "DeckyHub", ${JSON.stringify(method)}${args.map((arg) => `, ${JSON.stringify(arg)}`).join("")})`,
  );
const audit = (page, root) => page.eval(`JSON.stringify((${AUDIT})(${JSON.stringify(root)}))`).then(JSON.parse);
const local = (key, value) =>
  shared.eval(
    value === null
      ? `localStorage.removeItem(${JSON.stringify(key)}); true`
      : `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)}); true`,
  );

const startPath = await shared.eval("location.pathname.slice('/routes'.length)");
const original = await backend("get_settings");
const originalLocal = JSON.parse(
  await shared.eval(
    `JSON.stringify({ layout: localStorage.getItem("deckyhub-layout"), welcome: localStorage.getItem("deckyhub-welcome") })`,
  ),
);

// Saves settings and has every open DeckyHub view pick them up (I18nProvider listens).
const settings = async (changes) => {
  await backend("save_settings", { ...(await backend("get_settings")), ...changes });
  await shared.eval(`window.dispatchEvent(new Event("deckyhub-locale-changed")); true`);
  await sleep(800);
};

const results = {};
const record = (scenario, where, problems) => {
  if (!problems.length) return;
  results[scenario] ??= {};
  results[scenario][where] = problems;
};

async function auditPages(scenario, pages = PAGES) {
  for (const name of pages) {
    await goTo(shared, "/library/home");
    await sleep(500);
    await goTo(shared, `/deckyhub/${name}`);
    await waitFor(main, `!!document.querySelector(".deckyhub-motion")`, 30000);
    await sleep(2500);
    if (name === "settings") {
      await press(shared, BUTTON.DOWN, 500);
      for (let tab = 0; tab < 6; tab++) {
        const id = await main.eval(
          `[...document.querySelectorAll("[class^=deckyhub-settings-]")].map((e) => e.className).find((c) => /^deckyhub-settings-(general|github|downloads|repositories|troubleshoot|about)$/.test(c)) ?? "tab" + ${tab}`,
        );
        record(scenario, id.replace("deckyhub-", ""), await audit(main, ".deckyhub-motion"));
        await press(shared, 6, 1000); // R1
      }
    } else record(scenario, name, await audit(main, ".deckyhub-motion"));
  }
}

async function auditQuickAccess(scenario) {
  await shared.eval(`DFL.Navigation.OpenQuickAccessMenu(${TAB_ID}); true`);
  await sleep(1800);
  record(scenario, "quick-access", await audit(quickAccess, ".deckyhub-motion"));
  await shared.eval(`DFL.Navigation.CloseSideMenus(); true`);
  await sleep(500);
}

async function auditAllPlugins(scenario) {
  // From another page, so Discover opens on its shelves, not where it was left.
  await goTo(shared, "/library/home");
  await sleep(800);
  await goTo(shared, "/deckyhub/discover");
  await waitFor(main, `!!document.querySelector(".deckyhub-category-chips")`, 30000);
  await sleep(1500);
  await main.eval(
    `[...document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton")][1].click(); true`,
  );
  await waitFor(main, `!!document.querySelector(".deckyhub-back-button")`);
  await sleep(2000);
  // Filters open, a category picked from its chip.
  await main.eval(
    `[...document.querySelectorAll(".deckyhub-motion button, .deckyhub-motion .DialogButton")].find((b) => b.getAttribute("aria-expanded") === "false" && b.querySelector("svg"))?.click(); true`,
  );
  await sleep(1200);
  record(scenario, "all-plugins (a category, Filters open)", await audit(main, ".deckyhub-motion"));
}

// DeckyHub's windows (a window of the main screen, opened from a Quick Access button): each must fit the
// 1280x800 screen without being cut, and pass the same audit as a page. A window that is only a few controls
// (mustFit) must not scroll at all: its content opens scrolled to the middle otherwise (the pairing window
// did, with its title and QR code off the top). Long content (release notes) may scroll inside its window.
const FIT = (mustFit) => `(() => {
  const modal = document.querySelector(".ModalOverlayContent.active");
  if (!modal) return ["no window open"];
  const problems = [];
  if (${mustFit}) for (const el of modal.querySelectorAll("*")) if (/auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2) problems.push("scrolls: " + el.scrollHeight + "px of content in a " + el.clientHeight + "px window");
  const scrolls = (el) => { for (let n = el; n && n !== modal; n = n.parentElement) if (/auto|scroll/.test(getComputedStyle(n).overflowY)) return true; return false; };
  for (const el of modal.querySelectorAll("button, .DialogButton, img, h1, h2, h3, strong, span, div")) {
    const r = el.getBoundingClientRect();
    const own = el.matches("button, .DialogButton, img") || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own || r.width < 2 || r.height < 2 || scrolls(el)) continue;
    if (r.top < -1 || r.bottom > innerHeight + 1) problems.push("off screen vertically: " + (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\\s+/g, " ").slice(0, 40));
  }
  return problems.slice(0, 6);
})()`;
const WINDOWS = [
  ["Pair a device", "the pairing window", true],
  ["Support Development", "the Support window", true],
  ["Manage", "the DeckyHub update window", false],
];
// Opens a window the way a player does: into DeckyHub's Quick Access panel with Right, Down to the button, A.
async function openWithDpad(label) {
  const focusIn = `document.querySelector(".deckyhub-motion .gpfocus")`;
  for (let i = 0; i < 4 && !(await quickAccess.eval(`!!${focusIn}`)); i++) await press(shared, BUTTON.RIGHT, 700);
  // Focus starts where the last window left it, so look down the panel and then back up it.
  for (const [direction, steps] of [
    [BUTTON.DOWN, 25],
    [BUTTON.UP, 50],
  ]) {
    for (let i = 0; i < steps; i++) {
      const text = await quickAccess.eval(`${focusIn}?.textContent?.trim() ?? ""`);
      if (text.startsWith(label)) {
        await press(shared, BUTTON.OK, 1500);
        return true;
      }
      await press(shared, direction, 350);
    }
  }
  return false;
}

async function auditWindows(scenario) {
  for (const [button, label, mustFit] of WINDOWS) {
    await resetFocus(shared, "/library/home");
    await shared.eval(`DFL.Navigation.OpenQuickAccessMenu(${TAB_ID}); true`);
    await sleep(3000);
    const clicked = await openWithDpad(button);
    if (!clicked) {
      record(scenario, label, [
        `the D-pad never reached "${button}" in Quick Access (is Remote access on, and DeckyHub's tab shown?)`,
      ]);
      continue;
    }
    await waitFor(main, `!!document.querySelector(".ModalOverlayContent.active")`, 15000).catch(() => {});
    await sleep(4000);
    record(scenario, label, [
      ...JSON.parse(await main.eval(`JSON.stringify(${FIT(mustFit)})`)),
      ...(await audit(main, ".ModalOverlayContent.active")),
    ]);
    // The D-pad reaches every button in it, and B closes it.
    const { missed } = await explore(shared, main, { root: ".ModalOverlayContent.active" });
    record(scenario, `${label}: D-pad`, missed);
    await press(shared, BUTTON.BACK, 1200);
    const stillOpen = await main.eval(`!!document.querySelector(".ModalOverlayContent.active")`);
    record(scenario, `${label}: B`, stillOpen ? ["B did not close it"] : []);
    await main.eval(
      `[...document.querySelectorAll(".ModalOverlayContent.active button, .ModalOverlayContent.active .DialogButton")].filter((b) => ["Close", "Cancel"].includes(b.textContent.trim())).forEach((b) => b.click()); true`,
    );
    await sleep(800);
  }
}

const SCENARIOS = {
  async windows() {
    await auditWindows("windows");
  },
  async languages() {
    for (const language of LANGUAGES) {
      await settings({ language });
      await auditPages(`language ${language}`);
      await auditQuickAccess(`language ${language}`);
    }
    await settings({ language: original.language });
  },
  async grid() {
    for (const columnsPerRow of [1, 4]) {
      await local("deckyhub-layout", "grid");
      await settings({ columnsPerRow });
      await auditPages(`grid, ${columnsPerRow} per row`, ["discover", "updates", "search"]);
      await auditAllPlugins(`grid, ${columnsPerRow} per row`);
    }
    await local("deckyhub-layout", originalLocal.layout);
    await settings({ columnsPerRow: original.columnsPerRow });
  },
  async list() {
    await local("deckyhub-layout", "list");
    await auditAllPlugins("list");
    await local("deckyhub-layout", originalLocal.layout);
  },
  async compact() {
    await settings({ density: "compact" });
    await auditPages("compact");
    await auditQuickAccess("compact");
    await settings({ density: original.density });
  },
  async welcome() {
    await local("deckyhub-welcome", null);
    await auditPages("first launch (welcome)", ["discover"]);
    await local("deckyhub-welcome", originalLocal.welcome);
  },
  async noResults() {
    await goTo(shared, "/deckyhub/search");
    await waitFor(main, `!!document.querySelector(".deckyhub-motion input")`, 30000);
    await main.eval(
      `(() => { const input = document.querySelector(".deckyhub-motion input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "zzqqxx no such decky plugin"); input.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`,
    );
    await main.eval(
      `[...document.querySelectorAll(".deckyhub-motion button, .deckyhub-motion .DialogButton")].find((b) => b.textContent.trim() === "Search").click(); true`,
    );
    await sleep(5000);
    record("search with no results", "search", await audit(main, ".deckyhub-motion"));
  },
};

const chosen = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS);
try {
  if ((await main.screenshot()).length < 15000)
    throw new Error("The Deck's screen is off: wake it and keep it awake while testing.");
  for (const name of chosen) {
    console.log(`… ${name}`);
    // A scenario that breaks is a finding too; the rest still run.
    await SCENARIOS[name]().catch((error) => record(name, "run", [String(error.message ?? error).slice(0, 200)]));
  }
} finally {
  // Everything back as it was.
  await backend("save_settings", original).catch((error) => console.error("Couldn't restore settings:", error));
  await local("deckyhub-layout", originalLocal.layout).catch(() => {});
  await local("deckyhub-welcome", originalLocal.welcome).catch(() => {});
  await shared.eval(`window.dispatchEvent(new Event("deckyhub-locale-changed")); true`).catch(() => {});
  await resetFocus(shared, startPath || "/library/home").catch(() => {});
  shared.close();
  main.close();
  quickAccess.close();
}

console.log(Object.keys(results).length ? JSON.stringify(results, null, 2) : "No problems in any scenario.");
process.exitCode = Object.keys(results).length ? 1 : 0;
