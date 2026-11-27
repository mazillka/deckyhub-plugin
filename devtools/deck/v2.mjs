// Experimental V2 on a real Deck, driven with the D-pad only: the list, its details pane, More and the tabs.
// Needs DeckyHub's UI Style set to Experimental V2 (the script says so and stops if it isn't). Read-only.
//   DECK=<host>:8081 node devtools/deck/v2.mjs
import { connect, goTo, resetFocus, sleep, TARGETS, waitFor } from "./cdp.mjs";
import { BUTTON, press } from "./navigation.mjs";

// The pane's name, facts line and buttons (about this much) must be on screen; Steam scrolls the rest in when focus enters it.
const HEAD = 150;
const R1 = 6; // Steam's virtual bumper buttons: L1 is 5
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

// The row Steam's focus is on, the plugin the details pane shows, and where that pane is on screen.
const STATE = `(() => {
  const page = document.querySelector(".deckyhub-v2-page");
  if (!page) return null;
  const focus = document.querySelector(".gpfocus");
  const row = focus?.closest(".deckyhub-v2-row");
  const facts = page.querySelector(".deckyhub-v2-facts");
  const pane = facts?.parentElement;
  const box = pane?.getBoundingClientRect();
  const more = [...page.querySelectorAll("button")].find((b) => /\\(\\d+\\)$/.test(b.textContent.trim()));
  return {
    rows: page.querySelectorAll(".deckyhub-v2-row").length,
    focusedRow: row?.querySelector("strong")?.textContent ?? null,
    focusOnMore: !!focus && /\\(\\d+\\)$/.test(focus.textContent.trim()),
    detail: pane?.querySelector("strong")?.textContent ?? null,
    paneTop: box && Math.round(box.top),
    paneBottom: box && Math.round(box.bottom),
    vh: innerHeight,
    moreLabel: more?.textContent.trim() ?? null,
  };
})()`;

// A row's title is "Name by Owner" when another plugin has the same name (titleOf in src/author.ts); the pane shows
// just the name.
const samePlugin = (row, detail) => !!row && !!detail && (row === detail || row.startsWith(`${detail} by `));

const PANE_FOCUSED = `(() => { const f = document.querySelector(".gpfocus"); return !!f && !f.closest(".deckyhub-v2-row") && !!f.closest(".deckyhub-v2-page") && f.getBoundingClientRect().left > innerWidth / 3; })()`;
const shared = await connect(TARGETS.shared);
const main = await connect(TARGETS.main);
const state = () => main.eval(STATE);

async function open(tab) {
  await goTo(shared, `/deckyhub/${tab}`);
  await waitFor(main, `!!document.querySelector(".deckyhub-v2-page, .deckyhub-motion")`, 30000);
  await sleep(1500);
}

try {
  await open("discover");
  const start = await waitFor(main, STATE, 20000).catch(() => null);
  if (!start) {
    console.log(
      "DeckyHub isn't in Experimental V2: set UI Style to Experimental V2 in DeckyHub's Quick Access, then run again.",
    );
    process.exit(2);
  }
  check(
    start.rows > 0 && start.detail !== null,
    `Discover lists plugins (${start.rows}) with a details pane (${start.detail})`,
  );

  // Walk down the list one row at a time: the pane must follow the focused row and stay on screen.
  let last = null;
  for (let step = 0; step < 45; step++) {
    await press(shared, BUTTON.DOWN, 700); // Steam scrolls smoothly after a move
    const now = await state();
    if (!now) break;
    if (now.focusedRow && !samePlugin(now.focusedRow, now.detail)) {
      check(false, `step ${step}: pane shows ${now.detail}, focused row is ${now.focusedRow}`);
      break;
    }
    if (now.paneTop !== null && (now.paneTop < 0 || now.paneTop + HEAD > now.vh)) {
      check(false, `step ${step}: details pane is off screen (${now.paneTop}..${now.paneBottom} of ${now.vh})`);
      break;
    }
    last = now;
  }
  check(last !== null && last.paneTop >= 0, "details pane stays on screen while walking the list");
  check(
    last?.moreLabel !== null || last?.rows >= 30,
    `reached the end of the first batch (rows ${last?.rows}, More ${last?.moreLabel})`,
  );

  // The next batch loads by itself as focus nears the end of the loaded rows (30 at the start).
  const after = await state();
  check(after.rows > start.rows, `walking the list loads more rows (${start.rows} -> ${after.rows})`);
  check(samePlugin(after.focusedRow, after.detail), `focus stays on a row (${after.focusedRow})`);

  // L1 / R1 switch the tabs in place; each page must render and keep a single tab bar.
  for (const [name, hint] of [
    ["Updates", "updates"],
    ["Installed", "installed"],
    ["Search", "search"],
    ["Settings", "settings"],
  ]) {
    await press(shared, R1, 1200);
    const tabs = await main.eval(`document.querySelectorAll(".deckyhub-v2-tab").length`);
    const active = await main.eval(`document.querySelector(".deckyhub-v2-tab.is-active")?.textContent ?? null`);
    check(tabs === 5 && active !== null, `${hint}: one tab bar with 5 tabs, active "${active}"`);
  }

  // Settings (the last tab, reached above): Down walks the sections, each shows its own controls; Right goes in, Left back.
  const SECTION = `(() => { const f = document.querySelector(".gpfocus"); const s = f?.closest(".deckyhub-v2-section"); return s ? s.textContent : null; })()`;
  const PANE = `(() => document.querySelector(".deckyhub-v2-settings-pane > div")?.className ?? null)()`;
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    await press(shared, BUTTON.DOWN, 600);
    const name = await main.eval(SECTION);
    if (name) seen.add(`${name}|${await main.eval(PANE)}`);
  }
  check(seen.size === 6, `Settings: Down walks 6 sections, each with its own pane (${[...seen].join(", ")})`);
  await press(shared, BUTTON.UP, 600); // back to a middle section
  await press(shared, BUTTON.RIGHT, 700);
  const inSettings = await main.eval(
    `(() => { const f = document.querySelector(".gpfocus"); return !!f && !f.closest(".deckyhub-v2-section") && !!f.closest(".deckyhub-v2-settings-pane"); })()`,
  );
  check(inSettings, "Settings: Right goes into the section's controls");
  await press(shared, BUTTON.LEFT, 700);
  check((await main.eval(SECTION)) !== null, "Settings: Left returns to the section list");

  // Right from a row goes into the details pane (its buttons), Left comes back to the list on the same plugin.
  await press(shared, R1, 1500); // R1 wraps from Search to Discover (opening the same route keeps the tab)
  // Focus starts on the tab bar: Down passes the search row and the notices to reach the first plugin.
  for (let i = 0; i < 10 && !(await state())?.focusedRow; i++) await press(shared, BUTTON.DOWN, 600);
  const row = await state();
  check(row.focusedRow !== null, `Down from the tabs reaches the first row (${row.focusedRow})`);
  await press(shared, BUTTON.RIGHT, 700);
  const inPane = await main.eval(PANE_FOCUSED);
  check(inPane, "Right from a row reaches the details pane");
  await press(shared, BUTTON.LEFT, 700);
  const back = await state();
  check(
    samePlugin(back.focusedRow, back.detail),
    `Left returns to the list on a row (${back.focusedRow}) with the pane on it (${row.focusedRow} before)`,
  );

  // Installed: walk every row; the pane follows each one and stays on screen.
  await press(shared, R1, 1500);
  await press(shared, R1, 1500); // Discover -> Updates -> Installed
  let walked = 0;
  for (let step = 0; step < 40; step++) {
    await press(shared, BUTTON.DOWN, 600);
    const now = await state();
    if (!now?.focusedRow) continue;
    walked++;
    // Right reaches the pane from every row (a short pane has nothing level with a row far down the page), Left returns.
    await press(shared, BUTTON.RIGHT, 600);
    const reached = await main.eval(PANE_FOCUSED);
    await press(shared, BUTTON.LEFT, 600);
    const returned = await state();
    if (!reached || returned?.focusedRow !== now.focusedRow) {
      check(
        false,
        `Installed ${now.focusedRow}: Right ${reached ? "reached" : "did not reach"} the pane, Left returned to ${returned?.focusedRow}`,
      );
      break;
    }
    if (!samePlugin(now.focusedRow, now.detail) || now.paneTop < 0 || now.paneTop + HEAD > now.vh) {
      check(
        false,
        `Installed step ${step}: pane ${now.detail} at ${now.paneTop}..${now.paneBottom}, row ${now.focusedRow}`,
      );
      break;
    }
  }
  check(walked > 0, `Installed: the pane follows ${walked} rows and stays on screen`);

  // B on a V2 page leaves DeckyHub in one press (the tabs switch in place, they add no history).
  await press(shared, BUTTON.BACK, 1200);
  const left = await shared.eval(`SteamUIStore.WindowStore.GamepadUIMainWindowInstance.m_history.location.pathname`);
  check(!String(left).startsWith("/deckyhub"), `B leaves DeckyHub in one press (now ${left})`);
} catch (error) {
  check(false, `script error: ${error?.stack ?? error}`);
} finally {
  await resetFocus(shared, "/deckyhub/discover").catch(() => {});
  process.exit(failures.length ? 1 : 0);
}
