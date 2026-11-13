---
name: deck-test
description: Test DeckyHub on a real Steam Deck through Steam's CEF debugger - deploy this checkout's build, drive Gaming Mode, take screenshots and run the Deck test suite, including against registry data that isn't published yet. Use when asked to test on the Deck, use the Steam Deck debugger, check a UI change on real hardware, or before a release.
---

# Testing on a real Steam Deck

Decky Loader turns on Steam's debugger on port 8081 in Gaming Mode. The scripts in `devtools/deck/` (see its README) use it: `cdp.mjs` connects to Steam's pages (`SharedJSContext` where Decky and plugins run, `Steam Big Picture Mode` for the screen, `QuickAccess_uid2`: Steam counts the number up after every UI reload, and `connect()` matches the name without it), `deploy.mjs` installs this checkout, `deck.test.mjs` checks every page, `scenarios.mjs` and `compare.mjs` go further.

The Deck is the user's own device with their library and settings on it. Only install DeckyHub builds and read or drive DeckyHub's pages; don't touch other plugins, Steam settings or Decky's settings, and always leave a working DeckyHub build behind.

## 1. Find the Deck

```bash
curl -s -m 5 http://steamdeck:8081/json | grep '"title"'
```

No answer: try its IP (the README's example is `192.168.1.209`) or ask the user for it. It must be in Gaming Mode with Decky Loader and its screen on; Steam ignores the D-pad and draws nothing with the screen off, and the tests stop and say so. Set `DECK=<host>:8081` for every command below.

Note the running version first, to say what you replaced:

```bash
node -e 'const {connect,TARGETS}=await import("./devtools/deck/cdp.mjs"); const s=await connect(TARGETS.shared); console.log(await s.eval(`DeckyPluginLoader.plugins?.find((p) => p.name === "DeckyHub")?.version ?? null`)); process.exit(0)' --input-type=module
```

Give one-off scripts a timeout (`timeout 30 node ...`, or a `setTimeout(() => process.exit(1), ...)`): a WebSocket that never opens otherwise hangs the shell.

## 2. Deploy this checkout

```bash
pnpm typecheck
DECK=<host>:8081 node devtools/deck/deploy.mjs
```

It builds, serves the ZIP from this computer and confirms Decky's install dialog; the version gets a `-dev.<time>` suffix. The computer and the Deck must be on the same network, and the firewall must let Node accept the Deck's connection.

## 3. Look and test

- Screenshots: `(await main.screenshot())` from a `connect(TARGETS.main)` page, written to a scratch folder. Open a page with `goTo(shared, "/deckyhub/discover")` (no extra back history) and wait for `.deckyhub-motion` before reading the DOM.
- **Drive the Deck with the D-pad, always.** Move and press with `press(shared, BUTTON.DOWN | UP | LEFT | RIGHT | OK | BACK)` from `navigation.mjs` (it sends the same virtual button clicks the controller does), and open every page, window and menu that way: Down until the control you want has focus, then OK, and BACK to leave. Don't `.click()` a button or `scrollIntoView()` through `eval`: a window can look fine and still be unreachable with the controller (the release notes in the details window were, with 0 of their sections reachable, while clicks worked). `eval` is for reading state after the D-pad has done the work (which element has focus, what is on screen). Every new test, and every manual check of a UI change, follows this; the older tests that click are being moved over. A test that opens a window closes it with BACK before it asserts, so a failure doesn't leave it open and hang the next run (the first call then times out after 5 s).
- Read state with `main.eval(...)` (DOM queries, counts, text) rather than judging only by screenshots.
- - DeckyHub's own Quick Access tab is off by default for now, so tests and shots that need it must turn `quickAccessTab` on (`save_settings`) and then reload Steam's UI (`Page.reload` on `SharedJSContext`): the tab is added when DeckyHub loads. Every plugin reload leaves one more copy of the tab's icon in the strip (decky-loader#1014); a UI reload clears them. Click the last copy of a panel button if there are several, and put the setting back when you're done.
- Windows (Pair a device, Support, the DeckyHub update window) are checked by `node devtools/deck/scenarios.mjs windows`: each must fit the screen (a short window must not scroll: the pairing window once held 789 px in a 490 px window and opened scrolled to the middle), pass the page audit, have every button reachable with the D-pad and close with B. Run it for any change to a window, and add the window to its list when you add one. Pick the window with `.ModalOverlayContent.active`: the first `.ModalOverlayContent` in the page is an empty container, and an audit of it passes whatever the window looks like. Prove a new audit can fail before trusting it (deploy a build you know is wrong).
- Before calling it done, run the suite (about 9 minutes; read-only, it puts the Deck back where it was):

```bash
DECK=<host>:8081 node --test devtools/deck/deck.test.mjs
```

All tests must pass, including "No DeckyHub errors in the console". Screenshots land in `devtools/deck/screenshots/`.

Long text beside a pill (`pillStyle`) can squeeze it onto several lines; on a Deck it shows at once, in the browser mock it may not. Give such pills `whiteSpace: "nowrap"`.

## Testing against registry data that isn't published yet

DeckyHub reads `apps.json`, `releases.json` and `stats.json` from GitHub. To see a registry change before it ships (a new stats field, say):

1. Build the file in the registry checkout (`GITHUB_TOKEN=$(gh auth token) python scripts/build_release_index.py <scratch>/out`) and serve it from this computer on its LAN address with a tiny Node HTTP server (Node already gets through the firewall for `deploy.mjs`).
2. Point the URL in `src/releases.ts` (or `REMOTE_REGISTRY_URL` in `py_modules/deckyhub/registry.py`) at `http://<this computer>:<port>/<file>` with a `// TEMP` comment, deploy, and put the real URL back right after `deploy.mjs` returns: `git diff src/releases.ts` must be empty again (`git checkout -- src/releases.ts` if only line endings changed).
3. Test, then deploy once more from the clean source, so the Deck doesn't keep a build that reads from this computer, and stop the server.

## When you're done

The Deck runs a normal build of this checkout (or the release it had, via Decky's store), no temporary URLs remain in the source, and you've told the user which version is on their Deck now.
