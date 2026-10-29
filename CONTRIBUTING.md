# Contributing to DeckyHub

This covers building, testing, and releasing DeckyHub. For what the plugin does as a user, see [README.md](README.md).

## Repository layout

- `main.py` and `plugin.json` stay at the repository root because Decky Loader reads them from the plugin package.
- `main.py` is the backend; `src/` contains the Decky React UI.
- DeckyHub's plugin list lives in [mazillka/deckyhub-registry](https://github.com/mazillka/deckyhub-registry), not here; `tests/` covers the Python backend.
- `docs/` is the static GitHub Pages site: the promo page (`index.html`) and a `404.html`. The registry editor lives in [mazillka/deckyhub-registry](https://github.com/mazillka/deckyhub-registry)'s `docs/`. It remains separate from the runtime UI. `devtools/build-site.py` assembles it at deploy time: it downloads the registry's `apps.json` and writes the catalog into `index.html` and generates WebP screenshots and the link-preview JPEG from `screenshots/` (needs Pillow; CI-only). Preview locally with `python devtools/build-site.py _site` and serve `_site/`. Keep `docs/sitemap.xml` in sync when adding a page.

## Build

On a Linux development machine or Steam Deck Desktop Mode:

```bash
cd deckyhub-plugin
corepack enable
pnpm install
pnpm run typecheck
pnpm run build
pnpm run test:frontend
pnpm run test:backend
```

`pnpm run test:backend` runs `python -m unittest discover -s tests`. `python` is Python 3 on Windows, SteamOS and Arch; on a distribution without that command, run `python3 -m unittest discover -s tests` instead (as CI does).

The build produces `dist/index.js`. Decky Loader requires `plugin.json`, `main.py`, `package.json` and `dist/` together in the plugin folder.

## Local Steam Deck test

1. Install Decky Loader, switch to Desktop Mode, and build the plugin as above.
2. Copy the built plugin files (`dist/`, `main.py`, `package.json` and `plugin.json`) to `~/homebrew/plugins/DeckyHub`, or extract a release ZIP there.
3. Restart/reload Decky Loader, then open the Quick Access Menu → Decky → DeckyHub.
4. In the Quick Access Menu, tap **Manage** under **DeckyHub vX.Y.Z** and confirm the update window lists DeckyHub's releases with the installed one marked. Then open an app's **Manage** window, select an asset and confirm the resulting file is in `/home/deck/Downloads/deckyhub`. Test cancel with a larger asset and ensure no `.part` file remains.

For development, rebuild the frontend after every change to `src/`, then reload the plugin. The backend uses only Python's standard library and needs no pip install.

## Local browser preview

`devtools/decky-mock/` is a standalone tool for iterating on `src/` in a regular browser instead of a Steam Deck — it swaps `@decky/ui`/`@decky/api` for plain stand-ins and bridges backend calls to a real, running `main.py`. It's for exercising layout and logic only, not for visual QA, since the real `@decky/ui` components are scraped from Steam's own webpack bundle at runtime and can't be replicated outside it. See [devtools/decky-mock/README.md](devtools/decky-mock/README.md) for setup and known limitations.

## Adding a registry entry

New repositories go in [mazillka/deckyhub-registry](https://github.com/mazillka/deckyhub-registry)'s `registry/apps.json`. The app downloads that file from `main` at startup (see `REMOTE_REGISTRY_URL` in `main.py`), so a merged change reaches installed DeckyHub copies on their next restart without a release. The last successful download is the offline fallback; a fresh install with no network lists no apps until it can reach GitHub. Each entry needs `id`, `name`, `repo` (`owner/repo`), `category`, a `detect` block matching the plugin's name as Decky reports it, and an `asset` include/exclude filter for picking the right release ZIP. Follow the shape of existing entries. Every released version reads that same file, so keep changes additive; a change older versions can't read must bump `schemaVersion` (they reject it and keep their cached list) rather than reshape version 1. `tests/test_registry_schema.py` pins the version-1 shape; the registry repository's CI runs it against its file (`DECKYHUB_REGISTRY`), and here it's skipped unless that variable is set. Nothing needs syncing back to this repository.

Users can point DeckyHub at their own registries too (**Repositories** → **Custom Registries**), either by `owner/repo` — expanded to the `raw.githubusercontent.com/<owner>/<repo>/HEAD/registry/apps.json` shape — or by pasting any HTTPS `.json` URL. Those lists use the same schema and are validated by `validate_registry_url()` in `main.py`; they can add apps but never override an entry from the official registry, because `_load_registry()` keeps the first source it sees for a given `repo`, `id` or detect name.

## Releases

`develop` is where all new work lands; `main` holds stable releases only. Create work branches from `origin/develop` as `<short-kebab-case-topic>` (add an ISO date suffix only when needed for uniqueness) and open their PRs against `develop`. Do not work directly on `develop` or `main`. A stable release is a PR from `develop` into `main`; pre-releases (`vX.Y.Z-rc.N`) are tagged on `develop`, stable releases (`vX.Y.Z`) on `main`.

Merge feature pull requests into `develop` with **Squash and merge** so it keeps one commit per PR; keep each PR to a single topic and use its title as the commit message.

After each stable release lands on `main`, open a pull request from `main` into `develop` titled `chore: merge main back into develop (X.Y.Z)` and merge it with **Create a merge commit**, the one PR that isn't squashed. A squash into `main` makes a commit `develop` never has, so without this back-merge the next `develop` → `main` PR conflicts even when the files are identical.

The repository's `.githooks/pre-commit` hook blocks commits on `develop` and `main`. Activate it once per checkout with `git config core.hooksPath .githooks`; protected branches on GitHub should enforce the same rule remotely.

To release, bump `version` in `package.json` (the backend reads it at runtime; there is no second copy), then push a `v*` Git tag. The tag starts the GitHub Actions release workflow. It fails unless the tag is `v` plus the `package.json` version. It installs the locked packages, typechecks, builds, runs the frontend and backend tests and the browser E2E suite in `devtools/decky-mock/`, and packages the Decky plugin with a read-only token; a separate publish job then attaches `DeckyHub-v*.zip` to the GitHub release. Release-notes conventions are in the Release section of [AGENTS.md](AGENTS.md).

## Security boundaries

Registry entries are trusted project data. Download URLs must be HTTPS and filenames are reduced to a basename. User-added registries are fetched over HTTPS only, capped at 512 KB, limited to 10 URLs per install, and their entries are held to the same download rules — a registry can only name GitHub release assets of the repository it declares, and can't claim a detect name (so an installed plugin to update) that an earlier source or DeckyHub itself already owns. Normal downloads and Install/Update verify a SHA-256 checksum when GitHub exposes one; DeckyHub self-updates require one. GitHub API access is unauthenticated by default. Release info for repositories in the official registry comes from its release index (one `releases.json`, see AGENTS.md), which doesn't count against GitHub's public API rate limit; repositories users add themselves and Search still call the API, so users may still hit that limit; Settings → GitHub Access lets them add a personal access token (no scopes needed) to raise it. The token is only ever attached to requests to `api.github.com` from the frontend (`githubHeaders()` in `src/github.ts`) — the backend's own network calls (registry refresh, asset downloads) never see or need it.

DeckyHub never installs or runs anything without an explicit tap. Four controls hand releases to Decky Loader's installer: **Install** / **Update** in an app's Manage window, `AppDetailsModal.tsx` (for Decky plugins; when the selected ZIP has no GitHub SHA-256 digest Decky receives an empty hash, which skips its check: Install when not installed yet, named by the registry rule's first detect name; Update when installed — `pluginName` from `get_apps` — and the selected release is newer; see `installAction()` in `src/install.ts`); **Update All** on the Updates page, which sends every pending in-place update in one `utilities/install_plugins` call so Decky shows a single confirmation (fresh-install plugins are left out; see `updateDeckyPlugins()`); **Install** on a **Search & Install** result (`SearchPage.tsx`), which first adds the repository to the tracked list, then installs its latest stable release the same way; and updating **DeckyHub itself** (below). **Uninstall** in the Manage window removes rather than installs (installed Decky plugins other than DeckyHub; Decky Loader's `utilities/uninstall_plugin` deletes immediately without its own dialog, so the window shows a destructive `ConfirmModal` first — see `uninstallDeckyPlugin()`). For DeckyHub's own update, the primary button in `src/components/DeckyHubUpdateModal.tsx` (opened from the "DeckyHub vX.Y.Z" panel in `DeckyHubUpdate.tsx`) first downloads the selected release's ZIP with DeckyHub's own downloader (`stage_install` in `main.py`), then hands its local `file://` path, plugin name, version, and SHA-256 to Decky Loader's own global `utilities/install_plugin` route via `window.DeckyBackend` (not `@decky/api`'s plugin-scoped `call`, which cannot reach it), the same mechanism the Decky Store uses; it and the Manage window's buttons go through `installDeckyPlugin()` in `src/install.ts`. It only ever fires on an explicit tap of that button; the "Download ZIP" button next to it stays as the always-available fallback.

## License

By contributing you agree that your changes are licensed under GPL-3.0-or-later, the same as the rest of the project (see [LICENSE.md](LICENSE.md)).
