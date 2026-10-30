// Walks a DeckyHub page with the D-pad on a real Deck (Steam's own virtual
// gamepad buttons) and reports which of its controls the D-pad never reaches.
import { sleep } from "./cdp.mjs";

export const BUTTON = { OK: 1, BACK: 2, UP: 9, DOWN: 10, LEFT: 11, RIGHT: 12 };
const DIRECTIONS = [BUTTON.DOWN, BUTTON.RIGHT, BUTTON.UP, BUTTON.LEFT];

// In the main window: tags every visible DeckyHub control with an id, and tells
// which one has Steam's gamepad focus.
const TAG = `(() => {
  const root = document.querySelector(".deckyhub-motion");
  let next = document.querySelectorAll("[data-nav-id]").length;
  const controls = [...root.querySelectorAll("button, input, select, .DialogButton, [role=button]")]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.disabled && !el.closest("[data-nav-id]:not(:scope)"); });
  for (const el of controls) if (!el.dataset.navId) el.dataset.navId = String(next++);
  return controls.map((el) => el.dataset.navId);
})()`;
const FOCUSED = `(() => {
  const el = document.querySelector(".gpfocus");
  const control = el?.closest("[data-nav-id]") ?? el?.querySelector("[data-nav-id]");
  return control ? control.dataset.navId : null;
})()`;
const label = (id) => `(() => { const el = document.querySelector('[data-nav-id="${id}"]'); return (el.getAttribute("aria-label") || el.textContent || el.placeholder || el.tagName).trim().replace(/\\s+/g, " ").slice(0, 40); })()`;

export async function press(shared, button, wait = 350) {
  await shared.eval(`FocusNavController.DispatchVirtualButtonClick(${button}); true`);
  await sleep(wait);
}

// Sweeps the page with the D-pad alone, like a player would: across each row
// (right, then left), then down a row, until Down stops moving. Returns the
// page's controls and the ones the sweep never focused.
export async function explore(shared, main, { maxSteps = 200 } = {}) {
  const all = new Set(await main.eval(TAG));
  // Focus lands on the page once it's ready; nudge it until it does.
  let current = null;
  for (let tries = 0; !current && tries < 10; tries++) {
    await press(shared, tries % 2 ? BUTTON.UP : BUTTON.DOWN, 500);
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
    const moved = to && to !== current;
    if (to) { reached.add(to); current = to; }
    return moved;
  };
  for (let stuck = 0; stuck < 2 && steps < maxSteps;) {
    while (steps < maxSteps && await step(BUTTON.RIGHT));
    while (steps < maxSteps && await step(BUTTON.LEFT));
    stuck = (await step(BUTTON.DOWN)) ? 0 : stuck + 1;
  }
  const missed = [];
  for (const id of all) if (!reached.has(id)) missed.push(await main.eval(label(id)));
  return { controls: all.size, reached: reached.size, missed, steps };
}
