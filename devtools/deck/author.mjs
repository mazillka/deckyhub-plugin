// "More from this author" with the D-pad alone, in whichever UI Style DeckyHub is set to (Default, Experimental or V2):
// open Discover, reach a plugin whose author has others, press its "More from ..." button and check the list narrowed
// to that author. Read-only.
//   DECK=<host>:8081 node devtools/deck/author.mjs
import { connect, goTo, resetFocus, sleep, TARGETS, waitFor } from "./cdp.mjs";
import { BUTTON, press } from "./navigation.mjs";

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};
const shared = await connect(TARGETS.shared);
const main = await connect(TARGETS.main);
const label = () =>
  main.eval(
    `(() => { const a = document.querySelector(".gpfocus") || document.activeElement; return (a?.getAttribute("aria-label") || a?.textContent || "").trim().slice(0, 60); })()`,
  );
const searchValue = () =>
  main.eval(
    `(() => { for (const input of document.querySelectorAll("input")) if (input.value.endsWith("/")) return input.value; return null; })()`,
  );
const isV2 = () => main.eval(`!!document.querySelector(".deckyhub-v2-page")`);

try {
  await goTo(shared, "/deckyhub/discover");
  await waitFor(main, `!!document.querySelector(".deckyhub-motion")`, 30000);
  await sleep(2500);
  const v2 = await isV2();
  // Every card or row says who made the plugin.
  const ROWS = ".deckyhub-app-row, .dh-exp-row, .deckyhub-v2-row, .deckyhub-focus-ring";
  check(
    await main.eval(
      `[...document.querySelectorAll(${JSON.stringify(ROWS)})].some((row) => /by [^ ]+/.test(row.textContent))`,
    ),
    "plugins say who made them",
  );
  let author = null;
  if (v2) {
    // The pane's button: Down onto a row, Right into the pane, Down to "More from ...".
    for (
      let i = 0;
      i < 12 && !(await main.eval(`!!document.querySelector(".gpfocus")?.closest(".deckyhub-v2-row")`));
      i++
    )
      await press(shared, BUTTON.DOWN, 600);
    await press(shared, BUTTON.RIGHT, 700);
    for (let i = 0; i < 6 && !/^More from /.test(await label()); i++) await press(shared, BUTTON.DOWN, 500);
  } else {
    // Down the page to a Manage button (a row's Install / Update comes first in Experimental: Manage is next to it).
    for (let tries = 0; tries < 12 && !author; tries++) {
      for (let step = 0; step < 60 && (await label()) !== "Manage"; step++) {
        await press(shared, BUTTON.DOWN, 250);
        if (/^(Install|Update)\b/.test(await label())) {
          await press(shared, BUTTON.RIGHT, 250);
          if ((await label()) !== "Manage") await press(shared, BUTTON.LEFT, 250);
        }
      }
      await press(shared, BUTTON.OK, 1500);
      // Down the window to "More from ..."; a plugin whose author has no others has no such button.
      for (let i = 0; i < 30 && !/^More from /.test(await label()); i++) await press(shared, BUTTON.DOWN, 250);
      if (/^More from /.test(await label())) break;
      await press(shared, BUTTON.BACK, 800);
      await press(shared, BUTTON.DOWN, 250);
    }
  }
  const button = await label();
  check(/^More from .+ \(\d+\)$/.test(button), `D-pad reaches the button (${button})`);
  if (/^More from /.test(button)) {
    author = button.replace(/^More from /, "").replace(/ \(\d+\)$/, "");
    const count = Number(button.match(/\((\d+)\)$/)[1]);
    await press(shared, BUTTON.OK, 2500);
    check(await main.eval(`!document.querySelector(".ModalOverlayContent.active")`), "the Manage window is closed");
    check((await searchValue()) === `${author}/`, `the search is now ${author}/ (${await searchValue()})`);
    const rows = await main.eval(
      `document.querySelectorAll(".deckyhub-v2-row, .deckyhub-app-row, .dh-exp-row").length`,
    );
    check(rows > 0 && rows <= count + 12, `the list narrowed (${rows} rows for ${count} plugins)`);
  }
} catch (error) {
  check(false, `script error: ${error?.stack ?? error}`);
} finally {
  await resetFocus(shared, "/deckyhub/discover").catch(() => {});
  process.exit(failures.length ? 1 : 0);
}
