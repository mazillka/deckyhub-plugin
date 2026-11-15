---
name: refresh-screenshots
description: Retake DeckyHub's screenshots, promo images and GIF on a real Steam Deck - the README and website screenshots, the Remote Install manual's images, promo/hero.png, social.png and deckyhub.gif - and leave the Deck as it was. Use when the UI changed, before a release, or when asked to update screenshots, promo or the GIF (also for a Reddit or store post that reuses them).
---

# Refreshing the screenshots, promo and GIF

Everything is taken on a real Deck (1280x800, Gaming Mode) through Steam's debugger; see the `deck-test` skill for finding the Deck and the rules for touching it. The website builds its WebP images from `screenshots/` at deploy time, so these files are all there is to update. The browser extension's store images live in its own repository.

## What makes what

| Command (set `DECK=<host>:8081`) | Writes | Then |
| --- | --- | --- |
| `node devtools/deck/screenshots.mjs` | PNGs in `devtools/deck/screenshots/readme/` | `python devtools/deck/screenshots_to_jpg.py devtools/deck/screenshots/readme` makes `screenshots/*.jpg` (the menu joins the main screen and the Quick Access panel, which is its own window) |
| `node devtools/deck/remote-screenshots.mjs` | PNGs in `devtools/deck/screenshots/remote/` | `python devtools/deck/screenshots_to_jpg.py devtools/deck/screenshots/remote remote` makes the five `screenshots/remote-*.jpg` |
| `node devtools/promo/render.mjs devtools/deck/screenshots/readme/discover-promo.png 600+` | `promo/hero.png`, `promo/social.png`, `screenshots/hero.jpg` | |
| `python devtools/promo/make_gif.py` | `promo/deckyhub.gif` (from the JPGs, so run it last) | |

`remote-screenshots.mjs` pairs a real browser (Playwright's Chromium from `devtools/decky-mock`, `npm ci` there once) with the Deck through the preview website (`SITE`, default `https://deckyhub.com/develop/`), so that site must be deployed with the page you want shot. It sends one install request and rejects it, then removes the pairing and puts Remote access back: nothing stays installed or paired.

## Prepare the Deck

1. Deploy a build that looks like a release: `DECK=... DECKYHUB_VERSION=3.4.0 node devtools/deck/deploy.mjs` (no `-dev` suffix in the pictures).
2. The Quick Access shots need DeckyHub's own tab, which is off by default for now. Turn it on with `save_settings` (`quickAccessTab: true`), then **reload Steam's UI** (`Page.reload` on `SharedJSContext`, wait for DeckyHub to load again). Each plugin reload leaves another copy of the tab's icon in the strip (decky-loader#1014), and the pictures must show one; a UI reload clears them.
3. After a UI reload Steam names its windows `QuickAccess_uid6`, `uid7`, ...; `cdp.mjs` matches the name without the number.
4. Remote access must be on for the remote shots (the script turns it on and back).
5. Keep the screen awake. The scripts stop with a message when it is off.

## Look at every picture

Open each image before committing. Things that went wrong before: a window caught while it fades in over the blurred screen (dark and soft: `remote-screenshots.mjs` keeps the sharpest of several frames), duplicate tab icons, a `-dev` version label, the wrong screen behind the panel, a window taller than the screen. They show the user's avatar, clock and recent games: that has always been fine for these pictures, but don't add anything private (a pairing code that is still valid, a token).

## Leave the Deck as it was

Set `quickAccessTab` back to what it was, put the release on it (`DECKYHUB_ZIP=<downloaded release ZIP> DECKYHUB_VERSION=<its version> node devtools/deck/deploy.mjs`) and delete the scratch PNGs you made outside `devtools/deck/screenshots/`. Commit the JPGs, the promo files and any script change together in one PR, and say which build they were taken from.
