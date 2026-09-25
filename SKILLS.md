# DeckyHub skills

Use these project skills when working in this repository.

## Steam Deck UI

- Keep controller focus explicit for custom layouts with `Focusable` and valid `flow-children` values.
- Add matching `@decky/ui` stand-ins in `devtools/decky-mock/ui.tsx` for every new UI import.
- Verify UI behavior in the mock and on real Steam Deck hardware before release.
- Steam only scrolls to follow focus: text above a page's first focusable control is unreachable by controller. Wrap it in `<Focusable onActivate={() => {}}>` so D-pad up can land on it.
- Clickable non-button elements need both `onActivate` (A button) and `onClick` (touchscreen).
- Anything opened with `showModal()` renders outside `I18nProvider`: pass `t` in as a prop; `useT()` there throws.
- Every new user-facing string needs its key in all 7 `src/i18n/*.ts` files (`en.ts` is the type source `tsc` enforces). Reuse an existing translation when the text already exists.

## Decky Loader

- Loader-global routes are reachable only through `getDeckyBackend()` (`window.DeckyBackend`), not `@decky/api`'s plugin-scoped `call`.
- `utilities/install_plugin` shows Decky's own confirm dialog; `utilities/uninstall_plugin` deletes the plugin and its settings immediately — always confirm first.
- Check route names and behavior in decky-loader's `backend/decky_loader/utilities.py` and `browser.py` before relying on them.

## GitHub API

- Every release lookup goes through `fetchReleases(repo)` in `src/utils.ts` (one shared per-repo cache); don't add separate GitHub fetches.
- Unauthenticated use gets 60 requests/hour per IP: count the requests a change adds. `GET /rate_limit` is free.

## Verification

```bash
pnpm run typecheck
pnpm run build
pnpm run test:backend
cd devtools/decky-mock && npm run test:e2e
```

## Browser tests and the mock

- Mocked GitHub list endpoints (`/releases?per_page=20`, …) must return arrays, like the real API.
- `devtools/decky-mock/.dev-data/settings.json` is shared by the interactive mock and the E2E bridge: tests that depend on settings reset them first and restore them in `finally`. Don't use `--repeat-each` on them (it runs copies in parallel on that file).
- Fake Decky Loader with `page.addInitScript` setting `window.DeckyBackend` to record calls; seed installed plugins as `.dev-data/plugins/<name>/plugin.json` and remove them in `finally`.
- Send keys from a locator inside the mock's iframe (`locator.press`); `page.keyboard` goes to the outer page.
- Wait for async-loaded state (e.g. the saved token appearing) before typing into a field.
- Restart `dev-server.py` after backend changes — it doesn't reload `main.py`, and a stale bridge shows blank pages.
- When timing in the in-app browser pane, use a `MutationObserver`, not `setTimeout` polling: background timers are throttled to ~1 s.

## Security

- Keep the Python backend dependency-free.
- Download only GitHub release assets that belong to the selected repository.
- Treat repository names and imported files as untrusted input; validate them at the backend boundary.
- Preserve SHA-256 verification for DeckyHub self-updates.

## Release

- Create work branches as `<short-kebab-case-topic>`; add an ISO date suffix only when needed for uniqueness. Do not work directly on `main`.
- Bump `version` in `package.json` (the backend reads it at runtime; there is no second copy).
- Split commits by topic; each commit must typecheck on its own.
- Push a `v*` tag only after all checks pass.
- If the release workflow fails after the tag is pushed, fix it and bump to the next rc; never move a published tag.
- Changes to install/download/uninstall behavior also update README, `CONTRIBUTING.md` and `AGENTS.md`, which describe that policy.
- After every release (pre-releases too), replace the auto-generated notes with a human-friendly description via `gh release edit vX.Y.Z --notes-file <file>` — see the Release section of `AGENTS.md`.
