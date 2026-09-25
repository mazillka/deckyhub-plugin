# Contributing to DeckyHub

This covers building, testing, and releasing DeckyHub. For what the plugin does as a user, see [README.md](README.md).

## Repository layout

- `main.py` and `plugin.json` stay at the repository root because Decky Loader reads them from the plugin package.
- `backend/` contains the backend support modules; `src/` contains the Decky React UI.
- `registry/apps.json` contains the bundled default repositories; `tests/` covers the Python backend.
- `docs/` is the static GitHub Pages registry editor. It remains separate from the runtime UI and needs no build dependencies.

## Build

On a Linux development machine or Steam Deck Desktop Mode:

```bash
cd deckyhub-plugin
corepack enable
pnpm install
pnpm run typecheck
pnpm run build
pnpm run test:backend
```

On Windows, `pnpm run test:backend` uses the `python` launcher. On Steam Deck and Linux it uses the same Python command, so no separate test command is needed.

The build produces `dist/index.js`. Decky Loader requires `plugin.json`, `main.py`, `backend/`, `registry/`, and `dist/` together in the plugin folder.

## Local Steam Deck test

1. Install Decky Loader, switch to Desktop Mode, and build the plugin as above.
2. Copy the built plugin files (`backend/`, `dist/`, `registry/`, `main.py`, `package.json`, and `plugin.json`) to `~/homebrew/plugins/DeckyHub`, or extract a release ZIP there.
3. Restart/reload Decky Loader, then open the Quick Access Menu → Decky → DeckyHub.
4. Run **Check Update**, confirm a newer DeckyHub release shows a notification (and a matching release does not offer a download), then select an asset and confirm the resulting file is in `/home/deck/Downloads/deckyhub`. Test cancel with a larger asset and ensure no `.part` file remains.

For development, rebuild the frontend after every change to `src/`, then reload the plugin. The backend uses only Python's standard library and needs no pip install.

## Local browser preview

`devtools/decky-mock/` is a standalone tool for iterating on `src/` in a regular browser instead of a Steam Deck — it swaps `@decky/ui`/`@decky/api` for plain stand-ins and bridges backend calls to a real, running `main.py`. It's for exercising layout and logic only, not for visual QA, since the real `@decky/ui` components are scraped from Steam's own webpack bundle at runtime and can't be replicated outside it. See [devtools/decky-mock/README.md](devtools/decky-mock/README.md) for setup and known limitations.

## Adding a registry entry

New curated repositories go in `registry/apps.json`. Each entry needs `id`, `name`, `repo` (`owner/repo`), `category`, `versionStrategy`, `source`, a `detect` block matching the plugin's name as Decky reports it, and an `asset` include/exclude filter for picking the right release ZIP. Follow the shape of existing entries.

## Releases

Create work branches as `<short-kebab-case-topic>`; add an ISO date suffix only when needed for uniqueness. Do not work directly on `main`.

The repository's `.githooks/pre-commit` hook blocks commits on `main`. Activate it once per checkout with `git config core.hooksPath .githooks`; protected branches on GitHub should enforce the same rule remotely.

Pushing a `v*` Git tag starts the GitHub Actions release workflow. It installs the locked packages, typechecks, builds, runs the backend test, runs the browser E2E suite in `devtools/decky-mock/`, packages the Decky plugin, and attaches `DeckyHub-v*.zip` to the GitHub release.

## Security boundaries

Registry entries are trusted project data. Download URLs must be HTTPS and filenames are reduced to a basename. Normal downloads verify a SHA-256 checksum when GitHub exposes one; DeckyHub self-updates require one. GitHub API access is unauthenticated by default, so users may encounter GitHub's public API rate limit; Settings → GitHub Access lets them add a personal access token (no scopes needed) to raise it. The token is only ever attached to requests to `api.github.com` from the frontend (`githubHeaders()` in `src/utils.ts`) — the backend's own network calls (registry refresh, asset downloads) never see or need it.

DeckyHub never installs or runs anything without an explicit tap. Two buttons hand a release to Decky Loader's installer: **Install** / **Update** in an app's Manage window, `AppDetailsModal.tsx` (only for Decky plugins whose selected ZIP has a SHA-256 digest: Install when not installed yet, named by the registry rule's first detect name; Update when installed — `pluginName` from `get_apps` — and the selected release is newer; see `installAction()` in `src/utils.ts`), and updating **DeckyHub itself** — the primary button in `src/components/DeckyHubUpdateModal.tsx` (opened from the thin "Current - vX.Y.Z" panel in `DeckyHubUpdate.tsx`) hands the selected release's asset URL, plugin name, version, and SHA-256 to Decky Loader's own global `utilities/install_plugin` route via `window.DeckyBackend` (not `@decky/api`'s plugin-scoped `call`, which cannot reach it), the same mechanism the Decky Store uses; both go through `installDeckyPlugin()` in `src/utils.ts`. It only ever fires on an explicit tap of that button; the "Download ZIP" button next to it stays as the always-available fallback.
