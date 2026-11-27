// DeckyHub on a real Steam Deck, driven through Steam's debugger (see cdp.mjs).
//   DECK=192.168.1.209:8081 node --test devtools/deck/
// Read-only: it opens pages and menus but installs, changes and saves nothing, and
// puts the Deck back on the screen it was on. Assumes Steam and DeckyHub are in English.
// Screenshots of every step land in devtools/deck/screenshots/.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { connect, DECKY_PLUGINS, goTo, resetFocus, sleep, TARGETS, waitFor } from "./cdp.mjs";
import { BUTTON, explore, isV2, press, toV2Section } from "./navigation.mjs";

const TAB_ID = 0x444855; // src/components/QuickAccessTab.tsx
const PAGES = ["discover", "installed", "updates", "search", "settings", "repositories"];
const SETTINGS_TABS = ["general", "github", "downloads", "repositories", "troubleshoot", "about"];
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
  [shared, main, quickAccess] = await Promise.all([
    connect(TARGETS.shared),
    connect(TARGETS.main),
    connect(TARGETS.quickAccess),
  ]);
  startPath = await shared.eval("location.pathname.slice('/routes'.length)");
  // With the screen off Steam draws nothing and ignores the D-pad; a black frame is a tiny PNG.
  await awake();
  // Decky's plugins run in SharedJSContext: keep its errors that come from DeckyHub.
  await shared.send("Runtime.enable");
  shared.on(({ method, params }) => {
    const text =
      method === "Runtime.exceptionThrown"
        ? (params.exceptionDetails.exception?.description ?? params.exceptionDetails.text)
        : method === "Runtime.consoleAPICalled" && params.type === "error"
          ? params.args.map((arg) => arg.value ?? arg.description).join(" ")
          : null;
    if (text && /deckyhub/i.test(text + JSON.stringify(params.stackTrace ?? params.exceptionDetails?.stackTrace ?? "")))
      errors.push(text);
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
const awake = async () => {
  if ((await main.screenshot()).length < 15000) throw new Error(SCREEN_OFF);
};

const openPage = async (name) => {
  await awake();
  await goTo(shared, `/deckyhub/${name}`);
  await waitFor(
    main,
    `!!document.querySelector(".deckyhub-motion") && !document.querySelector(".deckyhub-motion .Throbber, .deckyhub-motion [class*=Spinner]")`,
    30000,
  );
  await sleep(1500);
};

// From another page, so V2's Settings starts afresh (opening the same route keeps its section and focus).
const openV2Settings = async () => {
  await goTo(shared, "/library/home");
  await sleep(800);
  await openPage("settings");
};

const openQuickAccess = async (tab) => {
  await awake();
  await shared.eval(
    `SteamUIStore.WindowStore.GamepadUIMainWindowInstance.MenuStore.OpenQuickAccessMenu(${tab ?? ""}); true`,
  );
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
    // Not what sits in a strip that scrolls sideways on purpose (Experimental's category tiles).
    let strip = false;
    for (let n = el.parentElement; n && n !== root && !strip; n = n.parentElement)
      strip = /auto|scroll/.test(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1;
    if (r.right > width + 1 && !strip) problems.push("off screen: " + (el.textContent || el.tagName).trim().slice(0, 60));
  }
  for (const button of root.querySelectorAll("button, .DialogButton")) {
    if (!visible(button)) continue;
    const label = button.textContent.trim();
    const style = getComputedStyle(button);
    // Lines of text, not height: Experimental's tiles stack an icon, a title and a count on purpose.
    const rows = new Set();
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const box of range.getClientRects()) rows.add(Math.round(box.top / 4));
    }
    const lines = rows.size;
    if (button.scrollWidth > button.clientWidth + 1 && style.textOverflow !== "ellipsis") problems.push("cut off: " + label.slice(0, 60));
    if (label && lines > 2 && !button.querySelector("img, h3")) problems.push("wraps: " + label.slice(0, 60));
  }
  return [...new Set(problems)];
})()`;

test("DeckyHub is loaded by Decky", async () => {
  const plugin = await shared.eval(
    `${DECKY_PLUGINS}.then((plugins) => JSON.stringify(plugins.find((p) => p.name === "DeckyHub") ?? null))`,
  );
  assert.ok(JSON.parse(plugin), "DeckyHub isn't in Decky's plugin list");
  if (process.env.DECKYHUB_VERSION) assert.equal(JSON.parse(plugin).version, process.env.DECKYHUB_VERSION);
});

test("Quick Access: DeckyHub's tab has its icon, and a dot exactly while updates wait", async () => {
  await openQuickAccess(TAB_ID);
  const state = JSON.parse(
    await waitFor(
      quickAccess,
      `(() => {
    const icon = document.querySelector(".deckyhub-tab-icon");
    const buttons = [...document.querySelectorAll("button, .DialogButton")].map((b) => b.textContent.trim());
    return icon && buttons.some((b) => b.startsWith("Discover")) && JSON.stringify({ dot: !!document.querySelector(".deckyhub-tab-dot"), buttons });
  })()`,
    ),
  );
  await save(quickAccess, "quick-access");
  for (const label of ["Discover", "Search", "Settings"])
    assert.ok(
      state.buttons.some((b) => b.startsWith(label)),
      `no ${label} button`,
    );
  const updates = state.buttons.some((b) => /^Updates\s*\d+/.test(b));
  assert.equal(state.dot, updates, updates ? "updates wait but there's no dot" : "a dot with no updates");
});

test("Quick Access: the dot sits on the icon's corner, inside the tab button", async () => {
  await openQuickAccess(TAB_ID);
  const boxes = JSON.parse(
    await waitFor(
      quickAccess,
      `(() => {
    const icon = document.querySelector(".deckyhub-tab-icon");
    const dot = document.querySelector(".deckyhub-tab-dot");
    if (!icon) return null;
    const box = (el) => el && el.getBoundingClientRect().toJSON();
    return JSON.stringify({ svg: box(icon.querySelector("svg")), dot: box(dot), tab: box(icon.parentElement) });
  })()`,
    ),
  );
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
  const v2 = await isV2(main);
  const state = JSON.parse(
    await main.eval(`JSON.stringify({
    disclaimer: !!document.querySelector(".deckyhub-disclaimer"),
    chips: document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton").length,
    cards: document.querySelectorAll(".deckyhub-motion h3, .deckyhub-v2-row").length,
  })`),
  );
  assert.ok(state.disclaimer, "no install disclaimer");
  // V2 picks a category from a menu, not chips.
  if (!v2) assert.ok(state.chips >= 2, "no category chips");
  assert.ok(state.cards >= 3, "no plugin cards");
});

test("Discover: category chips are one line each, whole name and count showing", async (t) => {
  await openPage("discover");
  if (await isV2(main)) return t.skip("V2 has no category chips");
  const chips = JSON.parse(
    await main.eval(`JSON.stringify([...document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton")].map((chip) => {
    const count = chip.lastElementChild.getBoundingClientRect();
    const name = chip.firstElementChild;
    return { label: chip.textContent.trim(), height: Math.round(chip.getBoundingClientRect().height), countShown: count.right <= chip.getBoundingClientRect().right, nameShown: name.scrollWidth <= name.clientWidth };
  }))`),
  );
  assert.equal(new Set(chips.map((chip) => chip.height)).size, 1, `chip heights differ: ${JSON.stringify(chips)}`);
  assert.deepEqual(
    chips.filter((chip) => !chip.countShown || !chip.nameShown),
    [],
  );
});

test("Discover: All plugins lists every plugin, and Back returns home", async (t) => {
  await openPage("discover");
  if (await isV2(main)) return t.skip("V2 has no All plugins view: Discover is the whole list");
  await main.eval(
    `[...document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton")].find((b) => b.textContent.trim().startsWith("All plugins")).click(); true`,
  );
  await waitFor(main, `!!document.querySelector(".deckyhub-back-button")`);
  await sleep(1500);
  await save(main, "discover-all");
  assert.ok(
    (await main.eval(`document.querySelectorAll(".deckyhub-motion h3").length`)) >= 9,
    "the list has few cards",
  );
  assert.deepEqual(await main.eval(layoutProblems(".deckyhub-motion")), []);
  await main.eval(
    `document.querySelector(".deckyhub-back-button button, .deckyhub-back-button .DialogButton").click(); true`,
  );
  await waitFor(main, `!!document.querySelector(".deckyhub-category-chips")`);
});

test("Discover: a plugin's Manage window opens and fits", async () => {
  await openPage("discover");
  await main.eval(
    `[...document.querySelectorAll(".deckyhub-motion button, .deckyhub-motion .DialogButton")].find((b) => b.textContent.trim() === "Manage").click(); true`,
  );
  await waitFor(main, `!!document.querySelector(".deckyhub-details")`);
  await sleep(1500);
  await save(main, "manage");
  assert.deepEqual(await main.eval(layoutProblems(".deckyhub-details")), []);
  await main.eval(
    `[...document.querySelectorAll("button, .DialogButton")].find((b) => b.textContent.trim() === "Close")?.click(); true`,
  );
});

test("Discover: the D-pad opens a plugin's details and reads its release notes to the end", async (t) => {
  const focused = () =>
    main
      .eval(
        `(() => { const a = document.activeElement; const n = document.querySelector(".deckyhub-details-notes"); return JSON.stringify({ text: (a?.getAttribute("aria-label") || a?.textContent || "").trim().slice(0, 40), inNotes: !!(n && n.contains(a)), bottom: a ? Math.round(a.getBoundingClientRect().bottom) : 0, height: innerHeight }); })()`,
      )
      .then(JSON.parse);
  // Down the page to a Manage button, then A: no clicks, like a player. A plugin without release notes has nothing to read:
  // close its window (a window left open would break every test after this one) and try the next one.
  let hasNotes = false;
  let page = "";
  // Updates first: every card there has release notes ("What's new"). Discover's first plugins often have none.
  for (const name of ["updates", "discover"]) {
    if (hasNotes) break;
    page = name;
    await openPage(page);
    hasNotes = await openFirstManageWithNotes(focused);
  }
  async function openFirstManageWithNotes(focused) {
    let found = false;
    for (let tries = 0; tries < 12 && !found; tries++) {
      found = await tryNextManage(focused);
    }
    return found;
  }
  // V2: Manage is in the details pane. Down onto a row, then Right into the pane: Right lands on its header,
  // so Down to the buttons and Right past Install / Update.
  async function toV2Manage(focused) {
    const onRow = () => main.eval(`!!document.querySelector(".gpfocus")?.closest(".deckyhub-v2-row")`);
    for (let step = 0; step < 12 && !(await onRow()); step++) await press(shared, BUTTON.DOWN, 600);
    if (!(await onRow())) return;
    await press(shared, BUTTON.RIGHT, 700);
    for (let step = 0; step < 4 && (await focused()).text !== "Manage"; step++)
      await press(shared, step % 2 ? BUTTON.DOWN : BUTTON.RIGHT, 600);
  }
  async function toCardManage(focused) {
    for (let step = 0; step < 60 && (await focused()).text !== "Manage"; step++) {
      await press(shared, BUTTON.DOWN, 250);
      // A row's first control can be its Install / Update button (Experimental): Manage is the next one along.
      if (/^(Install|Update)\b/.test((await focused()).text)) {
        await press(shared, BUTTON.RIGHT, 250);
        if ((await focused()).text !== "Manage") await press(shared, BUTTON.LEFT, 250);
      }
    }
  }
  async function tryNextManage(focused) {
    const v2 = await isV2(main);
    await (v2 ? toV2Manage : toCardManage)(focused);
    if ((await focused()).text !== "Manage") {
      // Updates may have no cards; Discover always has them, so a D-pad that can't reach Manage there is a bug.
      assert.notEqual(page, "discover", "the D-pad never reached a Manage button");
      return false;
    }
    await press(shared, BUTTON.OK, 1500);
    const showing = () => main.eval(`!!document.querySelector(".deckyhub-details-notes")`);
    let notes = await showing();
    // The folded window keeps its notes in a "What's new" row that is closed until A opens it.
    for (let step = 0; step < 25 && !notes && !/^What.s new/.test((await focused()).text); step++) {
      await press(shared, BUTTON.DOWN, 250);
    }
    if (!notes && /^What.s new/.test((await focused()).text)) {
      await press(shared, BUTTON.OK, 800);
      notes = await showing();
    }
    if (!notes) {
      await press(shared, BUTTON.BACK, 800);
      if (v2) await press(shared, BUTTON.LEFT, 600); // from the pane back to its row
      await press(shared, BUTTON.DOWN, v2 ? 600 : 250); // off this plugin, onto what follows
    }
    return notes;
  }
  // Nothing to read when none of the first plugins has release notes (the registry's data, not the screen).
  if (!hasNotes) return t.skip("none of the first plugins' Manage windows has release notes");
  await sleep(1000);
  const sections = await main.eval(`document.querySelector(".deckyhub-details-notes").children.length`);
  // Which release-note section has focus (-1: none). Entering Experimental's notes column can land past the first
  // section: every section must be reachable going down or back up.
  const section = () =>
    main
      .eval(
        `(() => { const n = document.querySelector(".deckyhub-details-notes"); const a = document.activeElement; const i = [...n.children].findIndex((c) => c === a || c.contains(a)); return JSON.stringify({ i, bottom: i < 0 ? 0 : Math.round(n.children[i].getBoundingClientRect().bottom), height: innerHeight }); })()`,
      )
      .then(JSON.parse);
  // Experimental: the notes are the right column (ExpDetailsLayout.tsx), which Down alone never enters.
  if (await main.eval(`!!document.querySelector(".dh-exp-details-cols")`))
    for (const button of [BUTTON.DOWN, BUTTON.RIGHT]) await press(shared, button, 500);
  const reached = new Set();
  let lastBottom = 0;
  for (const button of [BUTTON.DOWN, BUTTON.UP]) {
    for (let step = 0; step < 80 && reached.size < sections; step++) {
      await press(shared, button, 250);
      const now = await section();
      if (now.i >= 0) {
        reached.add(now.i);
        if (now.i === sections - 1) lastBottom = now.bottom;
      }
    }
  }
  await save(main, "details-notes");
  await press(shared, BUTTON.BACK, 500); // closes the window before any assertion can fail and leave it open
  assert.equal(reached.size, sections, `the D-pad reached ${reached.size} of ${sections} release-note sections`);
  assert.ok(lastBottom <= (await main.eval("innerHeight")), "the last release-note section is below the screen");
});

test("Search: has a search box and a Search button", async () => {
  await openPage("search");
  assert.ok(await main.eval(`!!document.querySelector(".deckyhub-motion input")`), "no search box");
  assert.ok(
    await main.eval(
      `[...document.querySelectorAll(".deckyhub-motion button, .deckyhub-motion .DialogButton")].some((b) => b.textContent.trim() === "Search")`,
    ),
    "no Search button",
  );
});

test("Settings: layout, language and token settings are there", async () => {
  await openPage("settings");
  const text = await main.eval(`document.querySelector(".deckyhub-motion").innerText`);
  // Steam draws tab names in capitals ("GITHUB ACCESS").
  for (const label of ["Language", "GitHub"]) assert.match(text, new RegExp(label, "i"), `no ${label} setting`);
});

// The D-pad, sweeping each page like a player would, reaches every control on it.
for (const name of PAGES.filter((page) => page !== "settings")) {
  test(`${name}: the D-pad reaches every control`, async (t) => {
    await openPage(name);
    if (name === "discover" && (await isV2(main)))
      return t.skip("V2's lazy-loaded list exceeds the sweep's step budget: v2.mjs walks it");
    const { missed } = await explore(shared, main);
    assert.deepEqual(missed, []);
  });
}

// Steam's tabs on Settings switch with R1; Experimental's menu of sections with R2 (there R1 changes the page).
const nextSection = async () => ((await main.eval(`!!document.querySelector(".dh-exp-settings")`)) ? 8 : 6);

// Settings sweeps each tab inside its own content: from the top, Left and Right on
// Steam's tab bar would switch tabs under the sweep. R1 moves to the next tab.
test("settings: the D-pad reaches every control on each tab", async () => {
  await openPage("settings");
  const v2 = await isV2(main);
  const missed = {};
  for (const [index, tab] of SETTINGS_TABS.entries()) {
    console.log(`  Checking Settings: ${tab}`);
    if (v2) {
      // A list of sections: Down to this one, Right into its pane. Each starts afresh, wherever the last sweep ended.
      await openV2Settings();
      assert.ok(await toV2Section(shared, main, index), `Down never reached the ${tab} section`);
      await press(shared, BUTTON.RIGHT, 700);
      const found = await explore(shared, main, { root: ".deckyhub-v2-settings-pane" });
      if (found.missed.length) missed[tab] = found.missed;
      continue;
    }
    // Experimental: focus is on the menu of sections (Down there would change the section): go into the pane first.
    if ((await nextSection()) === 8) await press(shared, BUTTON.RIGHT, 600);
    const found = await explore(shared, main, { root: `.deckyhub-settings-${tab}` });
    if (found.missed.length) missed[tab] = found.missed;
    await press(shared, await nextSection(), 1200);
  }
  assert.deepEqual(missed, {});
});

test("Quick Access: the D-pad reaches every control in DeckyHub's panel", async () => {
  await openQuickAccess(TAB_ID);
  const { missed } = await explore(shared, quickAccess);
  assert.deepEqual(missed, []);
});

// Steam enters a tab at its first control the first time, then where focus last was.
test("Quick Access: Right from DeckyHub's tab moves focus into the panel", async () => {
  await openQuickAccess(TAB_ID);
  const inPanel = `!!document.querySelector(".deckyhub-motion .gpfocus")`;
  for (let i = 0; i < 4 && (await quickAccess.eval(inPanel)); i++) await press(shared, BUTTON.LEFT, 600);
  assert.equal(await quickAccess.eval(inPanel), false, "Left never reached the tab strip");
  await press(shared, BUTTON.RIGHT, 600);
  assert.ok(await quickAccess.eval(inPanel), "Right from the tab didn't enter DeckyHub's panel");
});

test("B leaves a DeckyHub page for the one before it", async () => {
  await openPage("search");
  // A real history entry (Decky's own navigation) for B to go back from; B removes it again.
  await shared.eval(`SteamUIStore.Navigate("/deckyhub/settings"); true`);
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

test("Settings: R1 (V2: Down the section list) walks every tab, each one fitting and passing the audit", async () => {
  await openPage("settings");
  const v2 = await isV2(main);
  // V2: L1 / R1 switch the top-level tabs (v2.mjs checks that).
  if (v2) await openV2Settings();
  else await press(shared, BUTTON.DOWN, 600);
  const seen = [],
    problems = {};
  for (let i = 0; i < 6; i++) {
    if (v2) assert.ok(await toV2Section(shared, main, i), `Down never reached the ${SETTINGS_TABS[i]} section`);
    // The showing tab's content is marked with its id (SettingsPage.tsx).
    const tab = await main.eval(
      `[...document.querySelectorAll("[class^=deckyhub-settings-]")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0 && /^deckyhub-settings-(general|github|downloads|repositories|troubleshoot|about)$/.test(e.className)).map((e) => e.className)[0] ?? "?"`,
    );
    seen.push(tab);
    const found = await audit(main, ".deckyhub-motion");
    if (found.length) problems[tab] = found;
    if (!v2) await press(shared, await nextSection(), 1200);
  }
  assert.equal(new Set(seen).size, 6, `didn't reach six tabs: ${seen.join(", ")}`);
  assert.deepEqual(problems, {});
});

test("Quick Access: all info visible, aligned and accessible", async () => {
  await openQuickAccess(TAB_ID);
  assert.deepEqual(await audit(quickAccess, ".deckyhub-motion"), []);
});

test("Plugin details: every sampled window shows all its info, aligned and accessible, and the D-pad reaches its controls", async (t) => {
  await openPage("discover");
  if (await isV2(main)) return t.skip("samples windows from All plugins, which V2 doesn't have");
  await main.eval(
    `[...document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton")][0].click(); true`,
  );
  await waitFor(main, `!!document.querySelector(".deckyhub-back-button")`);
  await sleep(2000);
  const names = JSON.parse(
    await main.eval(
      `JSON.stringify([...document.querySelectorAll(".deckyhub-motion h3")].map((h) => h.textContent.trim()))`,
    ),
  );
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
      // Steam only scrolls to follow focus: Down alone has to reach the bottom.
      const scroll = `(() => { let el = document.querySelector(".deckyhub-details"); while (el && !(el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement; return el ? el.scrollHeight - el.clientHeight - el.scrollTop : 0; })()`;
      const columns = await main.eval(`!!document.querySelector(".dh-exp-details-cols")`);
      if (columns) {
        // Experimental: the actions on the left (the window's bottom is theirs), the text on the right (Right, then Down).
        // The text column's reach is checked by the release-notes test above.
        for (let i = 0; i < 4; i++) await press(shared, BUTTON.DOWN, 400);
      } else {
        const { missed } = await explore(shared, main, { root: ".deckyhub-details" });
        found.push(...missed.map((label) => `D-pad never reaches: ${label}`));
      }
      for (let i = 0; i < 40 && (await main.eval(scroll)) > 2; i++) await press(shared, BUTTON.DOWN, 400);
      if ((await main.eval(scroll)) > 2) found.push("Down never scrolls to the bottom of the window");
    }
    if (found.length) problems[plugin] = found;
    await press(shared, BUTTON.BACK, 1200);
  }
  assert.deepEqual(problems, {});
});

test("No DeckyHub errors in the console", () => {
  assert.deepEqual(errors, []);
});
