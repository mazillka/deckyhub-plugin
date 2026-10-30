# Testing on a real Steam Deck

Decky Loader turns on Steam's debugger (port 8081) in Gaming Mode, so a computer on the same network can drive the Deck's Steam UI. These scripts use it. Set `DECK` to the Deck's address (default `steamdeck:8081`).

| Script | What it does |
|---|---|
| `node devtools/deck/deploy.mjs` | Builds this checkout, serves the ZIP from this computer and has Decky install it, confirming Decky's dialog. The version gets a `-dev.<time>` suffix. |
| `node --test devtools/deck/deck.test.mjs` | Checks DeckyHub on the Deck: every page renders and fits the screen, the D-pad reaches every control, B goes back, the Quick Access tab and its update dot, and no DeckyHub errors in the console. Screenshots land in `devtools/deck/screenshots/`. Read-only, and it puts the Deck back on the screen it was on. |
| `node devtools/deck/compare.mjs [page …]` | Lists where the dev mock (`devtools/decky-mock`, running on port 5183) looks different from the Deck: position, size, font and colours of each page's parts. It copies the Deck's installed plugins into the mock for the run, so both show the same cards. |

```bash
DECK=192.168.1.209:8081 node --test devtools/deck/deck.test.mjs
```

Keep the Deck awake while testing: with its screen off Steam draws nothing and ignores the D-pad, and the tests stop with a message saying so. They expect Steam and DeckyHub in English.
