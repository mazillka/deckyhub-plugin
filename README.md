# DeckyHub

DeckyHub is a local-first MVP for Decky Loader. It tracks a curated registry of popular GitHub-hosted Steam Deck tools which do not have official Decky integration, then lets the user inspect and download matching release assets.

## What it does

- Controller-navigable **Updates**, **Installed**, **Discover**, and **Settings** tabs.
- Loads the local registry immediately, then queries GitHub Releases or tags directly from Steam's UI process. Release results are cached in `localStorage` for 15 minutes; a GitHub failure affects only that app card.
- Finds installed command-line apps and installed Decky plugins using registry-owned detection rules.
- Compares semantic versions, release dates, or a registry-provided custom version regex.
- Offers the recommended matching asset as **Download latest**, plus individual assets under **Choose asset**.
- Downloads HTTPS assets to `/home/deck/Downloads`; downloads use `*.part`, atomically rename on success, expose progress/cancel, and verify SHA-256 when GitHub provides an asset digest. Existing files are renamed by default; enable **Overwrite existing files** in Settings to replace them.
- Checks for DeckyHub stable releases or pre-releases from this repository and installs only validated DeckyHub ZIP release assets. Choose the update channel in Settings, then reload DeckyHub from the Decky menu after the update finishes.

DeckyHub intentionally **does not install or run downloaded files**. The user reviews and installs them in Desktop Mode.

## Registry

Edit [`registry/apps.json`](registry/apps.json) to add an app; no TypeScript or Python changes are required. Every record needs `id`, `name`, `repo`, `category`, `versionStrategy` (`semver`, `release-date`, or `custom`), `source` (`releases` or `tags`), and `asset` rules. `detect` is optional, but enables the Installed view. For an installed Decky plugin, use `{"type":"decky-plugin","names":["Plugin name"]}`; otherwise use a command and optional `args`. Use optional `releaseTagInclude` when a repository has distinct release streams; DeckyHub selects the first matching release tag.

The [Registry Editor](https://mazillka.github.io/deckyhub-plugin/) is a GitHub Pages tool that runs entirely in the browser. Use its **Repository editor** to add, edit, remove, or cancel a new repository; use **Raw JSON** for advanced fields. It validates the complete registry before import or apply, and **Export JSON** downloads an immediately importable `deckyhub-apps.json` file.

## Repository layout

- `main.py` and `plugin.json` stay at the repository root because Decky Loader reads them from the plugin package.
- `backend/` contains the backend support modules; `src/` contains the Decky React UI.
- `registry/apps.json` is the curated default registry; `tests/` covers the Python backend.
- `docs/` is the static GitHub Pages registry editor. It remains separate from the runtime UI and needs no build dependencies.

Users can also open **Settings → Add GitHub repository**, search GitHub, and add a result to their local Discover list. These custom entries are saved in DeckyHub settings and use the repository's latest GitHub Release.

**Settings → Managed repositories → Scan installed plugins** reads GitHub repository metadata from installed Decky plugins and adds unknown repositories to Discover. A custom repository for an installed plugin cannot be removed until that plugin is uninstalled.

Use **Export repository list** to save custom repositories as `DeckyHub-repositories.json` in `/home/deck/Downloads`. **Import repository list** accepts that JSON format from `/home/deck` and merges only new valid GitHub `owner/repo` entries.

`asset.include` matches all listed lowercase fragments; `asset.exclude` rejects a matching filename. Put the most preferred rule first in the registry, because the first matching release asset is the default for **Download latest**.

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
4. Run **Check for updates**, select an asset, and confirm the resulting file is in `/home/deck/Downloads`. Test cancel with a larger asset and ensure no `.part` file remains.

For development, rebuild the frontend after every change to `src/`, then reload the plugin. The backend uses only Python's standard library and needs no pip install.

## Releases

Pushing a `v*` Git tag starts the GitHub Actions release workflow. It installs the locked packages, typechecks, builds, runs the backend test, packages the Decky plugin, and attaches `DeckyHub-v*.zip` to the GitHub release.

## Security boundaries

Registry entries are trusted project data. Download URLs must be HTTPS; filenames are reduced to a basename; and checksum verification is performed only when GitHub exposes a SHA-256 digest. GitHub API access is unauthenticated in this MVP, so users may encounter GitHub's public API rate limit.
