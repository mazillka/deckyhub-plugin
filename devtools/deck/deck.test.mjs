// DeckyHub on a real Steam Deck, driven through Steam's debugger (see cdp.mjs).
//   DECK=192.168.1.209:8081 node --test devtools/deck/
// Read-only: it opens pages and menus but installs, changes and saves nothing, and
// puts the Deck back on the screen it was on. Assumes Steam and DeckyHub are in English.
// Screenshots of every step land in devtools/deck/screenshots/.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { connect, sleep, TARGETS, waitFor } from "./cdp.mjs";

const TAB_ID = 0x444855; // src/components/QuickAccessTab.tsx
const PAGES = ["discover", "updates", "search", "settings", "repositories"];
const shots = new URL("./screenshots/", import.meta.url);
mkdirSync(shots, { recursive: true });

let shared, main, quickAccess, startPath;
const errors = [];

before(async () => {
  [shared, main, quickAccess] = await Promise.all([connect(TARGETS.shared), connect(TARGETS.main), connect(TARGETS.quickAccess)]);
  startPath = await shared.eval("location.pathname.replace(/^\\/routes/, '')");
  // Decky's plugins run in SharedJSContext: keep its errors that come from DeckyHub.
  await shared.send("Runtime.enable");
  shared.on(({ method, params }) => {
    const text = method === "Runtime.exceptionThrown" ? params.exceptionDetails.exception?.description ?? params.exceptionDetails.text
      : method === "Runtime.consoleAPICalled" && params.type === "error" ? params.args.map((arg) => arg.value ?? arg.description).join(" ") : null;
    if (text && /deckyhub/i.test(text + JSON.stringify(params.stackTrace ?? params.exceptionDetails?.stackTrace ?? ""))) errors.push(text);
  });
});

after(async () => {
  await shared?.eval(`DFL.Navigation.CloseSideMenus?.(); DFL.Navigation.Navigate(${JSON.stringify(startPath || "/library/home")}); true`).catch(() => {});
  for (const page of [shared, main, quickAccess]) page?.close();
});

const save = async (page, name) => writeFileSync(new URL(`${name}.png`, shots), await page.screenshot());

const openPage = async (name) => {
  await shared.eval(`DFL.Navigation.CloseSideMenus?.(); DFL.Navigation.Navigate("/deckyhub/${name}"); true`);
  await waitFor(main, `!!document.querySelector(".deckyhub-motion") && !document.querySelector(".deckyhub-motion .Throbber, .deckyhub-motion [class*=Spinner]")`, 30000);
  await sleep(1500);
};

const openQuickAccess = async (tab) => {
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

test("Discover: category chips are one line each, with their counts showing", async () => {
  await openPage("discover");
  const chips = JSON.parse(await main.eval(`JSON.stringify([...document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton")].map((chip) => {
    const count = chip.lastElementChild.getBoundingClientRect();
    return { label: chip.textContent.trim(), height: Math.round(chip.getBoundingClientRect().height), countShown: count.right <= chip.getBoundingClientRect().right };
  }))`));
  assert.equal(new Set(chips.map((chip) => chip.height)).size, 1, `chip heights differ: ${JSON.stringify(chips)}`);
  assert.deepEqual(chips.filter((chip) => !chip.countShown), []);
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
  for (const label of ["Language", "GitHub"]) assert.match(text, new RegExp(label), `no ${label} setting`);
});

test("No DeckyHub errors in the console", () => {
  assert.deepEqual(errors, []);
});
