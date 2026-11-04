---
name: deck-test
description: Test DeckyHub on a real Steam Deck through Steam's CEF debugger - deploy this checkout's build, drive Gaming Mode, take screenshots and run the Deck test suite, including against registry data that isn't published yet. Use when asked to test on the Deck, use the Steam Deck debugger, check a UI change on real hardware, or before a release.
---

# Testing on a real Steam Deck

Decky Loader turns on Steam's debugger on port 8081 in Gaming Mode. The scripts in `devtools/deck/` (see its README) use it: `cdp.mjs` connects to Steam's pages (`SharedJSContext` where Decky and plugins run, `Steam Big Picture Mode` for the screen, `QuickAccess_uid2`), `deploy.mjs` installs this checkout, `deck.test.mjs` checks every page, `scenarios.mjs` and `compare.mjs` go further.

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
- Read state with `main.eval(...)` (DOM queries, counts, text) rather than judging only by screenshots.
- Before calling it done, run the suite (about 9 minutes; read-only, it puts the Deck back where it was):

```bash
DECK=<host>:8081 node --test devtools/deck/deck.test.mjs
```

All tests must pass, including "No DeckyHub errors in the console". Screenshots land in `devtools/deck/screenshots/`.

Long text beside a pill (`pillStyle`) can squeeze it onto several lines; on a Deck it shows at once, in the browser mock it may not. Give such pills `whiteSpace: "nowrap"`.

## Testing against registry data that isn't published yet

DeckyHub reads `apps.json`, `releases.json` and `stats.json` from GitHub. To see a registry change before it ships (a new stats field, say):

1. Build the file in the registry checkout (`GITHUB_TOKEN=$(gh auth token) python scripts/build_release_index.py <scratch>/out`) and serve it from this computer on its LAN address with a tiny Node HTTP server (Node already gets through the firewall for `deploy.mjs`).
2. Point the URL in `src/releases.ts` (or `REMOTE_REGISTRY_URL` in `main.py`) at `http://<this computer>:<port>/<file>` with a `// TEMP` comment, deploy, and put the real URL back right after `deploy.mjs` returns: `git diff src/releases.ts` must be empty again (`git checkout -- src/releases.ts` if only line endings changed).
3. Test, then deploy once more from the clean source, so the Deck doesn't keep a build that reads from this computer, and stop the server.

## When you're done

The Deck runs a normal build of this checkout (or the release it had, via Decky's store), no temporary URLs remain in the source, and you've told the user which version is on their Deck now.
