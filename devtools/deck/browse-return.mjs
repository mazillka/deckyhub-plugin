// D-pad only: scroll Discover's All plugins, open a plugin's Manage window and its
// Repository page in Steam's browser, press B, and check the page is as it was left.
// Read-only apart from that; run: DECK=<host>:8081 node devtools/deck/browse-return.mjs
import assert from "node:assert/strict";
import { connect, goTo, resetFocus, sleep, TARGETS, waitFor } from "./cdp.mjs";
import { BUTTON, press } from "./navigation.mjs";

const shared = await connect(TARGETS.shared),
  main = await connect(TARGETS.main);
const state = () =>
  main.eval(`(() => {
  const page = document.querySelector(".deckyhub-motion");
  const box = [...(page?.querySelectorAll("div") ?? [])].find((el) => getComputedStyle(el).overflowY === "auto");
  const f = page?.querySelector(".gpfocus");
  return { title: page?.querySelector("h1,h2")?.textContent?.trim(), cards: page?.querySelectorAll("h3").length, scroll: Math.round(box?.scrollTop ?? -1), focus: f?.textContent?.trim().slice(0, 30), path: location.pathname };
})()`);
const focusedText = async () => (await state()).focus;
try {
  await goTo(shared, "/deckyhub/discover");
  await waitFor(
    main,
    `!!document.querySelector(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton")`,
  );
  await main.eval(
    `[...document.querySelectorAll(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton")].find((b) => b.textContent.trim().startsWith("All plugins")).click(); true`,
  );
  await sleep(1500);
  for (let i = 0; i < 40 && (await focusedText()) !== "Manage"; i++) await press(shared, BUTTON.DOWN, 250);
  for (let i = 0; i < 25; i++) await press(shared, BUTTON.DOWN, 250);
  while ((await focusedText()) !== "Manage") await press(shared, BUTTON.DOWN, 250);
  const before = await state();
  await main.eval(`document.querySelector(".deckyhub-motion").dataset.mark = "x"; true`);
  console.log("before", before);
  assert.ok(before.scroll > 300, "page did not scroll");
  await press(shared, 1, 1500); // A: Manage
  // Down the Manage window to a page link (Release page, Repository or DeckyHub page): all open Steam's browser the same way.
  const link = () =>
    main.eval(
      `[...document.querySelectorAll(".gpfocus")].map((e) => e.textContent.trim()).find((t) => /^(Release page|Repository|DeckyHub page)$/.test(t)) ?? null`,
    );
  for (let i = 0; i < 40 && !(await link()); i++) await press(shared, BUTTON.DOWN, 250);
  assert.ok(await link(), "the D-pad never reached a page link");
  await press(shared, 1, 3000); // A: Repository
  console.log(
    "targets:",
    (await (await fetch(`http://${process.env.DECK}/json`)).json()).map((t) => t.title).join(", "),
  );
  console.log(
    "pages:",
    await shared
      .eval(
        `(() => { const h = window.SteamUIStore?.m_WindowStore?.GamepadUIMainWindowInstance?.m_history; return h?.location.pathname })()`,
      )
      .catch(String),
    await main.eval(`document.querySelector(".deckyhub-motion") ? "deckyhub page mounted" : "no deckyhub page"`),
  );
  await press(shared, BUTTON.BACK, 3000);
  await waitFor(main, `!!document.querySelector(".deckyhub-motion h3")`);
  await sleep(1500);
  const after = await state();
  console.log("after", after);
  assert.equal(after.title, before.title);
  assert.ok(Math.abs(after.scroll - before.scroll) < 100, "scroll position lost");
  assert.ok(after.focus, "no controller focus");
  console.log("remounted:", await main.eval(`!document.querySelector(".deckyhub-motion").dataset.mark`));
  console.log("OK");
} finally {
  await resetFocus(shared, "/deckyhub/discover").catch(() => {});
  process.exit(0);
}
