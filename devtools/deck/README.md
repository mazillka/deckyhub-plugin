# Testing on a real Steam Deck

Decky Loader turns on Steam's debugger (port 8081) in Gaming Mode, so a computer on the same network can drive the Deck's Steam UI. These scripts use it. Set `DECK` to the Deck's address (default `steamdeck:8081`).

| Script | What it does |
|---|---|
| `node devtools/deck/deploy.mjs` | Builds this checkout, serves the ZIP from this computer and has Decky install it, confirming Decky's dialog. The version gets a `-dev.<time>` suffix. |
| `node --test devtools/deck/deck.test.mjs` | Checks DeckyHub on the Deck: every page renders and fits the screen, the D-pad reaches every control, B goes back, the Quick Access tab and its update dot, and no DeckyHub errors in the console. Screenshots land in `devtools/deck/screenshots/`. Read-only, and it puts the Deck back on the screen it was on. |
| `node devtools/deck/scenarios.mjs [scenario …]` | Audits every screen (pages, each Settings tab, Quick Access) under many setups: every language, Grid at 1 and 4 per row, List, Compact, the first-launch welcome, All plugins with Filters open, and a search with no results. Your DeckyHub settings and saved layout come back as they were. |
| `node devtools/deck/v2.mjs` | Walks Experimental V2 with the D-pad alone: the details pane follows the focused row and stays on screen down the whole list, more rows loading as it nears the end, Right into the pane and Left back, the tabs on L1 / R1, Installed, and B leaving in one press. Needs UI Style set to Experimental V2; read-only. |
| `node devtools/deck/author.mjs` | "More from this author" with the D-pad alone, in whichever UI Style is set (Default, Experimental or V2): plugins say who made them, the button is reachable, and pressing it narrows Discover to that author. Read-only. |
| `node devtools/deck/perf.mjs [seconds]` | Measures what DeckyHub costs the Deck: for each page the frames Steam drew slower than 50 ms, long tasks and page changes, then the backend's answer time after a reload and its long tasks while idle. Reloads DeckyHub once; settings are kept. |
| `node devtools/deck/compare.mjs [page …]` | Lists where the dev mock (`devtools/decky-mock`, running on port 5183) looks different from the Deck: position, size, font and colours of each page's parts. It copies the Deck's installed plugins into the mock for the run, so both show the same cards. |

```bash
DECK=192.168.1.209:8081 node --test devtools/deck/deck.test.mjs
```

The tools open pages without adding to Steam's back history, and finish by letting Steam place focus afresh, so B and the D-pad behave normally afterwards. Keep the Deck awake while testing: with its screen off Steam draws nothing and ignores the D-pad, and the tests stop with a message saying so. They expect Steam and DeckyHub in English.
