// DeckyHub on a real Steam Deck, driven through Steam's debugger (see cdp.mjs).
//   DECK=192.168.1.209:8081 node --test devtools/deck/
// Read-only: it opens pages and menus but installs, changes and saves nothing, and
// puts the Deck back on the screen it was on. Assumes Steam and DeckyHub are in English.
// Screenshots of every step land in devtools/deck/screenshots/.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { connect, goTo, resetFocus, sleep, TARGETS, waitFor } from "./cdp.mjs";
import { BUTTON, explore, press } from "./navigation.mjs";

const TAB_ID = 0x444855; // src/components/QuickAccessTab.tsx
const PAGES = ["discover", "updates", "search", "settings", "repositories"];
const shots = new URL("./screenshots/", import.meta.url);
// What a player can't read or reach under a root: see audit.js.
const AUDIT = readFileSync(new URL("./audit.js", import.meta.url), "utf8");
const audit = (page, root) => page.eval(`JSON.stringify((${AUDIT})(${JSON.stringify(root)}))`).then(JSON.parse);
// Plugin details windows to open from All plugins: every this-many-th card.
const DETAILS_EVERY = Number(process.env.DETAILS_EVERY ?? 10);
mkdirSync(shots, { recursive: true });

let shared, main, quickAccess, startPath;
const errors = [];

before(async () => {
  [shared, main, quickAccess] = await Promise.all([connect(TARGETS.shared), connect(TARGETS.main), connect(TARGETS.quickAccess)]);
  startPath = await shared.eval("location.pathname.slice('/routes'.length)");
  // With the screen off Steam draws nothing and ignores the D-pad; a black frame is a tiny PNG.
  await awake();
  // Decky's plugins run in SharedJSContext: keep its errors that come from DeckyHub.
  await shared.send("Runtime.enable");
  shared.on(({ method, params }) => {
    const text = method === "Runtime.exceptionThrown" ? params.exceptionDetails.exception?.description ?? params.exceptionDetails.text
      : method === "Runtime.consoleAPICalled" && params.type === "error" ? params.args.map((arg) => arg.value ?? arg.description).join(" ") : null;
    if (text && /deckyhub/i.test(text + JSON.stringify(params.stackTrace ?? params.exceptionDetails?.stackTrace ?? ""))) errors.push(text);
  });
});

after(async () => {
  if (shared) await resetFocus(shared, startPath || "/library/home").catch(() => {});
  for (const page of [shared, main, quickAccess]) page?.close();
});

const save = async (page, name) => writeFileSync(new URL(`${name}.png`, shots), await page.screenshot());

// Steam doesn't count our virtual presses as activity, so the screen can go off
// mid-run; with it off Steam ignores the D-pad. Say so instead of failing oddly.
const SCREEN_OFF = "The Deck's screen is off: wake it (press a button) and keep it awake while testing.";
const awake = async () => { if ((await main.screenshot()).length < 15000) throw new Error(SCREEN_OFF); };

const openPage = async (name) => {
  await awake();
  await goTo(shared, `/deckyhub/${name}`);
  await waitFor(main, `!!document.querySelector(".deckyhub-motion") && !document.querySelector(".deckyhub-motion .Throbber, .deckyhub-motion [class*=Spinner]")`, 30000);
  await sleep(1500);
};

const openQuickAccess = async (tab) => {
  await awake();
  await shared.eval(`DFL.Navigation.OpenQuickAccessMenu(${tab ?? ""}); true`);
  await sleep(1500);
};

// Layout problems in what's on screen under `root`: things wider than the screen,
// button labels cut off without "…", and buttons whose label wraps to more lines.
const layoutProblems = (root) => `(() => {
  const root = document.querySelector(${JSON.stringify(root)});
  if (!root) return ["no " + ${JSON.stringify(root)}];
  const problems = [];
  const width = document.documentElement.clientWidth;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  for (const el of root.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > width + 1) problems.push("off screen: " + (el.textContent || el.tagName).trim().slice(0, 60));
  }
  for (const button of root.querySelectorAll("button, .DialogButton")) {
    if (!visible(button)) continue;
    const label = button.textContent.trim();
    const style = getComputedStyle(button);
    const lines = button.getBoundingClientRect().height / (parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2);
    if (button.scrollWidth > button.clientWidth + 1 && style.textOverflow !== "ellipsis") problems.push("cut off: " + label.slice(0, 60));
    if (label && lines > 2.6 && !button.querySelector("img, h3")) problems.push("wraps: " + label.slice(0, 60));
  }
  return [...new Set(problems)];
})()`;

test("DeckyHub is loaded by Decky", async () => {
  const plugin = await shared.eval(`JSON.stringify(DeckyPluginLoader.plugins.find((p) => p.name === "DeckyHub") ?? null)`);
  assert.ok(JSON.parse(plugin), "DeckyHub isn't in Decky's plugin list");
  if (process.env.DECKYHUB_VERSION) assert.equal(JSON.parse(plugin).version, process.env.DECKYHUB_VERSION);
});

test("Quick Access: DeckyHub's tab has its icon, and a dot exactly while updates wait", async () => {
  await openQuickAccess(TAB_ID);
  const state = JSON.parse(await waitFor(quickAccess, `(() => {
    const icon = document.querySelector(".deckyhub-tab-icon");
    const buttons = [...document.querySelectorAll("button, .DialogButton")].map((b) => b.textContent.trim());
    return icon && buttons.some((b) => b.startsWith("Discover")) && JSON.stringify({ dot: !!document.querySelector(".deckyhub-tab-dot"), buttons });
  })()`));
  await save(quickAccess, "quick-access");
  for (const label of ["Discover", "Search", "Settings"]) assert.ok(state.buttons.some((b) => b.startsWith(label)), `no ${label} button`);
  const updates = state.buttons.some((b) => /^Updates\s*\d+/.test(b));
  assert.equal(state.dot, updates, updates ? "updates wait but there's no dot" : "a dot with no updates");
});

test("Quick Access: the dot sits on the icon's corner, inside the tab button", async () => {
  await openQuickAccess(TAB_ID);
  const boxes = JSON.parse(await waitFor(quickAccess, `(() => {
    const icon = document.querySelector(".deckyhub-tab-icon");
    const dot = document.querySelector(".deckyhub-tab-dot");
    if (!icon) return null;
    const box = (el) => el && el.getBoundingClientRect().toJSON();
    return JSON.stringify({ svg: box(icon.querySelector("svg")), dot: box(dot), tab: box(icon.parentElement) });
  })()`));
  if (!boxes.dot) return; // no updates: covered above
  assert.ok(boxes.dot.top >= boxes.tab.top && boxes.dot.right <= boxes.tab.right, "dot clipped by the tab button");
  assert.ok(boxes.dot.bottom > boxes.svg.top && boxes.dot.left < boxes.svg.right, "dot isn't on the icon's corner");
});

test("Quick Access: DeckyHub's panel fits", async () => {
  await openQuickAccess(TAB_ID);
  assert.deepEqual(await quickAccess.eval(layoutProblems(".deckyhub-motion")), []);
});

for (const name of PAGES) {
  test(`${name} page renders and fits the screen`, async () => {
    await openPage(name);
    await save(main, name);
    const text = await main.eval(`document.querySelector(".deckyhub-motion").innerText`);
    assert.doesNotMatch(text, /Something went wrong|TypeError|undefined|NaN/);
    assert.deepEqual(await main.eval(layoutProblems(".deckyhub-motion")), []);
  });
}

test("Discover: disclaimer, categories and plugin cards", async () => {
  await openPage("discover");
  const state = JSON.parse(await main.eval(`JSON.stringify({
    disclaimer: !!document.querySelector(".deckyhub-disclaimer"),
    chips: document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton").length,
    cards: document.querySelectorAll(".deckyhub-motion h3").length,
  })`));
  assert.ok(state.disclaimer, "no install disclaimer");
  assert.ok(state.chips >= 2, "no category chips");
  assert.ok(state.cards >= 3, "no plugin cards");
});

test("Discover: category chips are one line each, whole name and count showing", async () => {
  await openPage("discover");
  const chips = JSON.parse(await main.eval(`JSON.stringify([...document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton")].map((chip) => {
    const count = chip.lastElementChild.getBoundingClientRect();
    const name = chip.firstElementChild;
    return { label: chip.textContent.trim(), height: Math.round(chip.getBoundingClientRect().height), countShown: count.right <= chip.getBoundingClientRect().right, nameShown: name.scrollWidth <= name.clientWidth };
  }))`));
  assert.equal(new Set(chips.map((chip) => chip.height)).size, 1, `chip heights differ: ${JSON.stringify(chips)}`);
  assert.deepEqual(chips.filter((chip) => !chip.countShown || !chip.nameShown), []);
});

test("Discover: All plugins lists every plugin, and Back returns home", async () => {
  await openPage("discover");
  await main.eval(`[...document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton")].find((b) => b.textContent.trim().startsWith("All plugins")).click(); true`);
  await waitFor(main, `!!document.querySelector(".deckyhub-back-button")`);
  await sleep(1500);
  await save(main, "discover-all");
  assert.ok(await main.eval(`document.querySelectorAll(".deckyhub-motion h3").length`) >= 9, "the list has few cards");
  assert.deepEqual(await main.eval(layoutProblems(".deckyhub-motion")), []);
  await main.eval(`document.querySelector(".deckyhub-back-button button, .deckyhub-back-button .DialogButton").click(); true`);
  await waitFor(main, `!!document.querySelector(".deckyhub-category-chips")`);
});

test("Discover: a plugin's Manage window opens and fits", async () => {
  await openPage("discover");
  await main.eval(`[...document.querySelectorAll(".deckyhub-motion button, .deckyhub-motion .DialogButton")].find((b) => b.textContent.trim() === "Manage").click(); true`);
  await waitFor(main, `!!document.querySelector(".deckyhub-details")`);
  await sleep(1500);
  await save(main, "manage");
  assert.deepEqual(await main.eval(layoutProblems(".deckyhub-details")), []);
  await main.eval(`[...document.querySelectorAll("button, .DialogButton")].find((b) => b.textContent.trim() === "Close")?.click(); true`);
});

test("Search: has a search box and a Search button", async () => {
  await openPage("search");
  assert.ok(await main.eval(`!!document.querySelector(".deckyhub-motion input")`), "no search box");
  assert.ok(await main.eval(`[...document.querySelectorAll(".deckyhub-motion button, .deckyhub-motion .DialogButton")].some((b) => b.textContent.trim() === "Search")`), "no Search button");
});

test("Settings: layout, language and token settings are there", async () => {
  await openPage("settings");
  const text = await main.eval(`document.querySelector(".deckyhub-motion").innerText`);
  // Steam draws tab names in capitals ("GITHUB ACCESS").
  for (const label of ["Language", "GitHub"]) assert.match(text, new RegExp(label, "i"), `no ${label} setting`);
});

// The D-pad, sweeping each page like a player would, reaches every control on it.
for (const name of PAGES) {
  test(`${name}: the D-pad reaches every control`, async () => {
    await openPage(name);
    const { missed } = await explore(shared, main);
    assert.deepEqual(missed, []);
  });
}

test("Quick Access: the D-pad reaches every control in DeckyHub's panel", async () => {
  await openQuickAccess(TAB_ID);
  const { missed } = await explore(shared, quickAccess);
  assert.deepEqual(missed, []);
});

// Steam enters a tab at its first control the first time, then where focus last was.
test("Quick Access: Right from DeckyHub's tab moves focus into the panel", async () => {
  await openQuickAccess(TAB_ID);
  const inPanel = `!!document.querySelector(".deckyhub-motion .gpfocus")`;
  for (let i = 0; i < 4 && await quickAccess.eval(inPanel); i++) await press(shared, BUTTON.LEFT, 600);
  assert.equal(await quickAccess.eval(inPanel), false, "Left never reached the tab strip");
  await press(shared, BUTTON.RIGHT, 600);
  assert.ok(await quickAccess.eval(inPanel), "Right from the tab didn't enter DeckyHub's panel");
});

test("B leaves a DeckyHub page for the one before it", async () => {
  await openPage("search");
  // A real history entry (Decky's own navigation) for B to go back from; B removes it again.
  await shared.eval(`DFL.Navigation.Navigate("/deckyhub/settings"); true`);
  await waitFor(shared, `location.pathname.endsWith("/deckyhub/settings")`);
  await sleep(1000);
  await press(shared, BUTTON.BACK, 1500);
  assert.match(await shared.eval("location.pathname"), /\/deckyhub\/search$/);
});

// Everything readable (nothing cut off or off screen), rows aligned, controls named,
// text with enough contrast.
for (const name of PAGES) {
  test(`${name}: all info visible, aligned and accessible`, async () => {
    await openPage(name);
    assert.deepEqual(await audit(main, ".deckyhub-motion"), []);
  });
}

test("Settings: R1 walks every tab, each one fitting and passing the audit", async () => {
  await openPage("settings");
  await press(shared, BUTTON.DOWN, 600);
  const seen = [], problems = {};
  for (let i = 0; i < 6; i++) {
    // The showing tab's content is marked with its id (SettingsPage.tsx).
    const tab = await main.eval(`[...document.querySelectorAll("[class^=deckyhub-settings-]")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0 && /^deckyhub-settings-(general|github|downloads|repositories|troubleshoot|about)$/.test(e.className)).map((e) => e.className)[0] ?? "?"`);
    seen.push(tab);
    const found = await audit(main, ".deckyhub-motion");
    if (found.length) problems[tab] = found;
    await press(shared, 6, 1200); // R1
  }
  assert.equal(new Set(seen).size, 6, `R1 didn't reach six tabs: ${seen.join(", ")}`);
  assert.deepEqual(problems, {});
});

test("Quick Access: all info visible, aligned and accessible", async () => {
  await openQuickAccess(TAB_ID);
  assert.deepEqual(await audit(quickAccess, ".deckyhub-motion"), []);
});

test("Plugin details: every sampled window shows all its info, aligned and accessible, and the D-pad reaches its controls", async () => {
  await openPage("discover");
  await main.eval(`[...document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton")][0].click(); true`);
  await waitFor(main, `!!document.querySelector(".deckyhub-back-button")`);
  await sleep(2000);
  const names = JSON.parse(await main.eval(`JSON.stringify([...document.querySelectorAll(".deckyhub-motion h3")].map((h) => h.textContent.trim()))`));
  const problems = {};
  for (const [index, plugin] of names.entries()) {
    if (index % DETAILS_EVERY) continue;
    await main.eval(`(() => {
      const isManage = (b) => b.textContent.trim() === "Manage" || b.getAttribute("aria-label") === "Manage";
      let card = [...document.querySelectorAll(".deckyhub-motion h3")].find((h) => h.textContent.trim() === ${JSON.stringify(plugin)});
      while (card && ![...card.querySelectorAll("button, .DialogButton")].some(isManage)) card = card.parentElement;
      [...card.querySelectorAll("button, .DialogButton")].find(isManage).click();
      return true;
    })()`);
    await waitFor(main, `!!document.querySelector(".deckyhub-details")`);
    await sleep(1500);
    const found = await audit(main, ".deckyhub-details");
    if (index === 0) {
      await save(main, "details");
      const { missed } = await explore(shared, main, { root: ".deckyhub-details" });
      found.push(...missed.map((label) => `D-pad never reaches: ${label}`));
      // Steam only scrolls to follow focus: Down alone has to reach the bottom.
      const scroll = `(() => { let el = document.querySelector(".deckyhub-details"); while (el && !(el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement; return el ? el.scrollHeight - el.clientHeight - el.scrollTop : 0; })()`;
      for (let i = 0; i < 20 && await main.eval(scroll) > 2; i++) await press(shared, BUTTON.DOWN, 400);
      if (await main.eval(scroll) > 2) found.push("Down never scrolls to the bottom of the window");
    }
    if (found.length) problems[plugin] = found;
    await press(shared, BUTTON.BACK, 1200);
  }
  assert.deepEqual(problems, {});
});

test("No DeckyHub errors in the console", () => {
  assert.deepEqual(errors, []);
});
