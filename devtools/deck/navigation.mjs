// Walks a DeckyHub page with the D-pad on a real Deck (Steam's own virtual
// gamepad buttons) and reports which of its controls the D-pad never reaches.
import { sleep } from "./cdp.mjs";

export const BUTTON = { OK: 1, BACK: 2, UP: 9, DOWN: 10, LEFT: 11, RIGHT: 12 };
const DIRECTIONS = [BUTTON.DOWN, BUTTON.RIGHT, BUTTON.UP, BUTTON.LEFT];

// In the main window: tags every visible DeckyHub control with an id, and tells
// which one has Steam's gamepad focus.
const tag = (root) => `(() => {
  const root = document.querySelector(${JSON.stringify(root)});
  let next = document.querySelectorAll("[data-nav-id]").length;
  const controls = [...root.querySelectorAll("button, input, select, .DialogButton, [role=button]")]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled && !el.closest("[data-nav-id]:not(:scope)"); });
  for (const el of controls) if (!el.dataset.navId) el.dataset.navId = String(next++);
  return controls.map((el) => el.dataset.navId);
})()`;
const focused = (root) => `(() => {
  const el = document.querySelector(${JSON.stringify(root)} + " .gpfocus");
  if (!el) return null;
  const control = el.closest("[data-nav-id]") ?? el.querySelector("[data-nav-id]");
  if (control) return control.dataset.navId;
  // Focus on the page but not on a control we track (a toggle row, a note): still a
  // stop the sweep can move on from, with its own id.
  el.dataset.navId = "stop-" + document.querySelectorAll("[data-nav-id]").length;
  return el.dataset.navId;
})()`;
// null once the control has left the page (Steam's tab bar switched tabs under the sweep).
const label = (id) => `(() => { const el = document.querySelector('[data-nav-id="${id}"]'); if (!el) return null; return (el.getAttribute("aria-label") || el.textContent || el.placeholder || el.tagName).trim().replace(/\\s+/g, " ").slice(0, 40); })()`;

export async function press(shared, button, wait = 350) {
  await shared.eval(`FocusNavController.DispatchVirtualButtonClick(${button}); true`);
  await sleep(wait);
}

// Sweeps the page with the D-pad alone, like a player would: down the page row by
// row, crossing each row both ways. It runs twice, once ending each row on its
// left and once on its right, so a second column is walked down too. Returns the
// page's controls and the ones the sweeps never focused.
const OPPOSITE = { [BUTTON.UP]: BUTTON.DOWN, [BUTTON.DOWN]: BUTTON.UP, [BUTTON.LEFT]: BUTTON.RIGHT, [BUTTON.RIGHT]: BUTTON.LEFT };

export async function explore(shared, main, { maxSteps = 250, trace = false, root = ".deckyhub-motion" } = {}) {
  const TAG = tag(root), FOCUSED = focused(root);
  const all = new Set(await main.eval(TAG));
  // Focus lands on the page once it's ready (or, from Quick Access's tab strip,
  // after Right); nudge it until it does.
  let current = null;
  const nudges = [BUTTON.DOWN, BUTTON.RIGHT, BUTTON.UP];
  for (let tries = 0; !current && tries < 15; tries++) {
    await press(shared, nudges[tries % nudges.length], 800);
    current = await main.eval(FOCUSED);
  }
  if (!current) return { controls: all.size, reached: 0, missed: ["(focus never reached the page)"], steps: 0 };
  const reached = new Set([current]);
  let steps = 0;
  const step = async (button) => {
    steps++;
    await press(shared, button);
    for (const id of await main.eval(TAG)) all.add(id); // scrolling can show more
    const to = await main.eval(FOCUSED);
    if (trace) console.log(Object.keys(BUTTON).find((key) => BUTTON[key] === button), "->", to && await main.eval(label(to)));
    // Off the page (Quick Access's tab strip, Steam's menus): step back on.
    if (!to) { await press(shared, OPPOSITE[button]); return false; }
    reached.add(to);
    const moved = to !== current;
    current = to;
    return moved;
  };
  const sweep = async (first, last) => {
    for (let stuck = 0; stuck < 2 && steps < maxSteps;) {
      while (steps < maxSteps && await step(first));
      while (steps < maxSteps && await step(last));
      stuck = (await step(BUTTON.DOWN)) ? 0 : stuck + 1;
    }
  };
  await sweep(BUTTON.RIGHT, BUTTON.LEFT);
  while (steps < maxSteps && await step(BUTTON.UP)); // back to the top
  await sweep(BUTTON.LEFT, BUTTON.RIGHT);
  const missed = [];
  for (const id of all) {
    if (reached.has(id)) continue;
    const name = await main.eval(label(id));
    if (name !== null) missed.push(name);
  }
  return { controls: all.size, reached: reached.size, missed, steps };
}
