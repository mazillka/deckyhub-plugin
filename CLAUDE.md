# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DeckyHub is a [Decky Loader](https://decky.xyz/) plugin for Steam Deck: a Python backend (`main.py`) driving a React/TypeScript frontend (`src/`), packaged so Decky Loader can load it in Gaming Mode. It discovers, downloads, and updates other Decky plugins/tools from tracked GitHub repositories. It only downloads files — it never installs or executes anything.

## Commands

```bash
corepack enable
pnpm install
pnpm run typecheck        # tsc --noEmit
pnpm run build             # rollup -c -> dist/index.js
pnpm run test:backend      # python -m unittest discover -s tests
```

Run a single backend test: `python -m unittest tests.test_plugin_status.PluginStatusTests.test_decky_plugin_detection_reads_manifest_and_package_version`. The backend uses only the Python standard library — no pip install needed.

There is no frontend test suite; `pnpm run typecheck` is the correctness gate for `src/`.

### Local browser preview (no Steam Deck needed)

`devtools/decky-mock/` swaps `@decky/ui`/`@decky/api` for plain `<div>`/`<button>` stand-ins (`devtools/decky-mock/ui.tsx`, `api.ts`) and bridges backend calls to the real, running `main.py`. Two processes, both from that folder: `python dev-server.py` (backend bridge on :8642) and `npm run dev` (frontend on :5183, first run needs `npm install`). This is for exercising layout and logic only — real `@decky/ui` components are scraped at runtime from Steam's own webpack bundle (`findModuleExport()`), so nothing here is pixel-accurate. **Any new `@decky/ui` import used in `src/` needs a matching stand-in added to `devtools/decky-mock/ui.tsx`**, or the mock's build fails with "No matching export in ui.tsx". Always do a final visual/gamepad check on real hardware before shipping a UI change — this mock can't validate Steam's focus/gamepad-nav system at all.

### Releases

Pushing a `v*` tag triggers `.github/workflows/release.yml`: installs, typechecks, builds, runs backend tests, zips `plugin.json` + `main.py` + `backend/` + `dist/` + `registry/` + `LICENSE`, and attaches `DeckyHub-vX.Y.Z.zip` to a GitHub release. Version lives in two places that must be bumped together: `DECKYHUB_VERSION` in `main.py` and `version` in `package.json`.

## Architecture

**Backend (`main.py`, `backend/registry.py`) is one `Plugin` class** exposing async methods Decky calls directly from the frontend via `callable()` (see `src/api.ts` for the full RPC surface — `get_apps`, `download_asset`, `save_settings`, etc.). There's no HTTP API of its own.

- **App identity vs. live state**: an "app" entry (registry or custom) is static metadata — `repo`, `category`, `versionStrategy`, `detect` rule, `asset` include/exclude filters. `get_apps` merges that with `installedVersion` (computed by scanning `$DECKY_HOME/plugins/*/plugin.json`, or running a CLI command's `--version`) but leaves `latestVersion`/`assets`/`updateAvailable` null — the frontend fetches those itself.
- **Registry loading has a two-tier fallback**: `_load_registry()` prefers a previously-cached `registry.json` under `DECKY_PLUGIN_SETTINGS_DIR`; if that's missing/corrupt it falls back to the bundled `registry/apps.json`. `refresh_registry()` re-pulls from GitHub raw and atomically replaces the cache (`.part` + `os.replace`). Custom (user-added) repos are synthesized on the fly in `_custom_apps()` and merged in per-call — they're never written into the registry file.
- **Downloads are queued, not fire-and-forget**: `download_asset`/`install_deckyhub_update` push onto `self.download_queue`, drained one at a time by `_run_download_queue()` → `_download()`. Progress/state lives in `self.downloads[job_id]`, polled by the frontend via `get_download`. Cancellation is cooperative: `cancel_download` just adds the job_id to `self.cancelled`, and the running download loop checks that set. `_download` tries `urllib` first, falls back to system `curl` on `URLError` (some CDNs 403 Python's default UA/TLS stack). SHA-256 verification is opt-out for normal downloads, mandatory for DeckyHub self-updates.
- **Version comparison** happens entirely client-side in `src/utils.ts` (`isUpdate`, `versionNumbers`) — the backend never decides "update available"; it just supplies `installedVersion`, and the frontend fetches `latestVersion`/`publishedAt` directly from the GitHub API and compares, per `app.versionStrategy` (`semver`, `release-date`, or `custom` regex via `versionPattern`).

**Frontend (`src/`) talks to GitHub directly from the browser**, not through the Python backend — `hydrate()` and `latestDeckyHubRelease()` in `src/utils.ts` call `fetchNoCors` from `@decky/api` against `api.github.com`. This means release/version data is unauthenticated and rate-limited by GitHub per-device, cached 3 minutes in `localStorage` (`CACHE_TTL`, keyed per repo+source, bypassed with `force=true` on manual refresh).

- **`Content.tsx`** is the shared list view for both the Updates and Discover routes (`fullPage` prop selects which), including the app grid, search/status filters, and the top-level download-job panel. **`AppCard.tsx`** renders one app's status/version/download UI. **`ManageRepositoriesPage.tsx`** and **`SettingsPage.tsx`** are separate routes registered in `src/index.tsx` via `routerHook.addRoute`.
- **Custom-events-as-pub/sub**: cross-component signals (`REGISTRY_UPDATED` in `api.ts`, `LOCALE_CHANGED` in `i18n/index.tsx`) are plain `window.dispatchEvent`/`addEventListener` `CustomEvent`s, not React context — grep for these constants before assuming a settings change needs prop drilling.
- **i18n** (`src/i18n/`) is a from-scratch key/template system, not a library: `en.ts` is the canonical `MessageKey` type every other locale file must satisfy, `useT()` looks up the current locale's string (falling back to English) and does `{var}` substitution.
- **Gamepad/controller navigation** on Steam Deck depends on wrapping any custom-layout container (e.g. a CSS grid) in `<Focusable>` from `@decky/ui` with the correct `flow-children` value — these are literal Panorama/SteamUI focus-flow keywords (`"right-wrap"` for a wrapping left-to-right grid, etc.), not arbitrary strings; an unrecognized value silently falls back to plain vertical flow with no error. `PanelSection`/`ButtonItem`/`PanelSectionRow` handle focus automatically; a raw `<div>` does not.

## Security boundaries (from CONTRIBUTING.md)

Registry entries are trusted project data. Download URLs must be HTTPS (`download_asset` raises otherwise) and filenames are reduced to a basename (path traversal guard). `import_custom_repos` restricts the source file to a `.json` under `/home/deck`. GitHub API access is unauthenticated, so expect rate-limit errors surfaced as `app.error` under heavy use.
