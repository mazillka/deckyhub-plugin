# DeckyHub

DeckyHub is a local-first plugin for Decky Loader. It starts with a small curated list and also tracks GitHub repositories that you add or import.

## What it does

- Controller-navigable fullscreen **Updates**, **Installed**, **Discover**, and **Settings** pages with clear page descriptions, retry states, and download progress.
- Loads the curated list immediately, then queries GitHub Releases directly from Steam's UI process. Release results are cached in `localStorage` for 15 minutes; a GitHub failure affects only that app card.
- Detects curated and manually managed repositories that are installed as Decky plugins.
- Compares semantic versions for managed repositories.
- Offers only matching ZIP assets: the recommended ZIP as **Download latest**, plus individual ZIP assets under **Choose asset**.
- Downloads HTTPS assets to `/home/deck/Downloads/plugins` by default, or `/home/deck/Downloads` when selected in Settings; each repository card shows its download progress, size, status, and Cancel action. Downloads use `*.part`, atomically rename on success, and verify SHA-256 when GitHub provides an asset digest. Existing files are overwritten by default; disable **Overwrite existing files** in Settings to keep both files.
- Checks for DeckyHub stable releases or pre-releases from this repository and downloads only validated DeckyHub ZIP release assets to `/home/deck/Downloads`. Install the downloaded ZIP through Decky → Developer → Install Plugin from ZIP.

DeckyHub intentionally **does not install or run downloaded files**. The user reviews and installs them in Desktop Mode.

## Managed repositories

Open **Settings → Add GitHub repository** to search GitHub and add a repository to Discover. You can also import a list from `/home/deck/Downloads`. The [Registry Editor](https://mazillka.github.io/deckyhub-plugin/) remains available as a standalone GitHub Pages editor for repository JSON files.

## Repository layout

- `main.py` and `plugin.json` stay at the repository root because Decky Loader reads them from the plugin package.
- `backend/` contains the backend support modules; `src/` contains the Decky React UI.
- `registry/apps.json` contains the bundled default repositories; `tests/` covers the Python backend.
- `docs/` is the static GitHub Pages registry editor. It remains separate from the runtime UI and needs no build dependencies.

Users can also open **Settings → Add GitHub repository**, search GitHub, and add a result to their local Discover list. These custom entries are saved in DeckyHub settings and use the repository's latest GitHub Release.

Any user-managed repository can be removed; bundled default repositories remain available. DeckyHub does not scan installed official Decky plugins or add their repositories to Discover.

Use **Export repository list** to save custom repositories as `DeckyHub-repositories.json` in `/home/deck/Downloads`. **Import repository list** accepts that JSON format from `/home/deck` and merges only new valid GitHub `owner/repo` entries.

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

Registry entries are trusted project data. Download URLs must be HTTPS and filenames are reduced to a basename. Normal downloads verify a SHA-256 checksum when GitHub exposes one; DeckyHub self-updates require one. GitHub API access is unauthenticated, so users may encounter GitHub's public API rate limit.
