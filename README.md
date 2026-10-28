<div align="center">

<img src="docs/favicon.svg" width="80" height="80" alt="">

# DeckyHub

**Your Steam Deck's plugin store — right inside Gaming Mode.**

Discover, download and update Decky Loader plugins with your controller.

[![Release](https://img.shields.io/github/v/release/mazillka/deckyhub-plugin?color=1d75cc)](https://github.com/mazillka/deckyhub-plugin/releases/latest)
[![Pre-release](https://img.shields.io/github/v/release/mazillka/deckyhub-plugin?include_prereleases&label=pre-release&color=8a9bb2)](https://github.com/mazillka/deckyhub-plugin/releases)
[![Tests](https://img.shields.io/github/actions/workflow/status/mazillka/deckyhub-plugin/ci.yml?branch=main&label=tests)](https://github.com/mazillka/deckyhub-plugin/actions/workflows/ci.yml)
[![Downloads](https://img.shields.io/github/downloads/mazillka/deckyhub-plugin/total?color=1d75cc)](https://github.com/mazillka/deckyhub-plugin/releases)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE.md)
[![Platform](https://img.shields.io/badge/platform-SteamOS-green)](https://store.steampowered.com/steamos)

[**Download**](https://github.com/mazillka/deckyhub-plugin/releases/latest) · [Website](https://mazillka.github.io/deckyhub-plugin/) · [Plugin catalog](https://mazillka.github.io/deckyhub-registry/) · [Install guide](#installing-deckyhub) · [Report an issue](https://github.com/mazillka/deckyhub-plugin/issues)

<img src="screenshots/discover.jpg" width="800" alt="DeckyHub's Discover screen listing Steam Deck plugins with color-coded status">

<table>
<tr>
<td align="center"><img src="screenshots/menu.jpg" width="260" alt="DeckyHub Menu screen"><br><sub><b>Menu</b></sub></td>
<td align="center"><img src="screenshots/updates.jpg" width="260" alt="DeckyHub Updates screen"><br><sub><b>Updates</b></sub></td>
<td align="center"><img src="screenshots/manage.jpg" width="260" alt="DeckyHub Manage screen"><br><sub><b>Manage</b></sub></td>
</tr>
</table>

</div>

> [!CAUTION]
> **DeckyHub only fetches releases from their authors' GitHub repositories. It doesn't make, review or vouch for these plugins and isn't responsible for anything they do to your device or data. Install at your own risk.**

Tired of tabbing out to Desktop Mode, hunting through GitHub releases, and manually downloading ZIPs every time a plugin updates? DeckyHub brings plugin discovery and updates straight to your controller. Browse a curated catalog of the best Steam Deck tools, track any GitHub repo you want, and get notified the moment an update drops — all without leaving your couch.

> **A note on how this is made.** Most of DeckyHub's code was written with the help of AI tools (Claude and Codex). That doesn't mean it ships untested — every release is verified on real hardware before it goes out. I'm telling you this upfront so you know exactly what you're installing and how it got built.

## Why you'll like it

- **Never miss an update** — DeckyHub checks your installed plugins against their latest GitHub releases and pings you with a toast the moment something new is available.
- **No more zip-hunting** — search, download, and see exactly which release asset you need without opening a browser.
- **Built for the couch** — full gamepad navigation, color-coded status at a glance, and one-tap downloads designed for Gaming Mode, not a desktop browser squeezed onto a small screen.
- **You stay in control** — DeckyHub never installs or runs anything on its own. Nothing touches your system until you say so, and installs go through Decky Loader's own installer and confirmation dialog (see [Manage](#manage)).

## What it does

- **Discover** — browse a curated list of Steam Deck plugins/tools, filter by search or installed status, and see release info at a glance, color-coded by status.
- **Updates** — see which of your tracked, installed tools have a newer release available, and update the Decky plugins among them in one go with **Update All**. You'll also get a toast notification when new updates show up.
- **Repositories** — search GitHub, add or remove tracked repositories, and export/import your list. **Custom Registries** adds other people's app lists. Per-repository release-channel overrides live behind each app's **Manage** button on Discover/Updates instead.
- **Settings** — shows the DeckyHub download folder and the **Overwrite Existing** toggle, lets you add an optional GitHub personal access token to raise the API rate limit, picks the language, and adjusts the display: **Default** or **Compact** density, items per row (1–3) in the app grid, and which Manage-window buttons to hide.
- **Quick Access Menu** — **Discover**, **Search** and **Settings** (**Repositories** opens from Settings), plus **Updates** with a count whenever updates are waiting. Below them: DeckyHub's own version and update check, a **Cleanup** section (shown when the download folder has files) that empties it after confirmation, and **Export Logs** for bug reports.

DeckyHub never installs or runs anything automatically. **Download ZIP** saves a release, which you install yourself via Decky's settings → Developer → Install Plugin from ZIP. For one-tap install, update and uninstall, see [Manage](#manage).

## Curated repositories

No setup, no configuration — the curated list shows up in Discover the moment you install DeckyHub. It lives in [mazillka/deckyhub-registry](https://github.com/mazillka/deckyhub-registry) and refreshes every time DeckyHub starts, so new apps show up without a DeckyHub update. DeckyHub keeps the last list it downloaded for offline use; a fresh install needs to reach GitHub once.

- **Browse it:** the [plugin catalog](https://mazillka.github.io/deckyhub-registry/) lists every curated plugin, searchable and by category.
- **Suggest a plugin:** open an [issue](https://github.com/mazillka/deckyhub-registry/issues/new) or a pull request in the registry repository.
- **Want more?** Add any other GitHub repository from **Repositories** in seconds.

## Installing DeckyHub

1. Make sure [Decky Loader](https://decky.xyz/) is installed.
2. Download the latest `DeckyHub-v*.zip` from the [Releases page](https://github.com/mazillka/deckyhub-plugin/releases).
3. In Gaming Mode, open the Quick Access Menu → Decky → settings (gear icon). Turn on **Developer mode** under General if it's off, then go to **Developer** → **Install Plugin from ZIP** and select the downloaded file.
4. Open Quick Access Menu → Decky → **DeckyHub**.

## Using DeckyHub

### Controller buttons

DeckyHub uses the standard Steam Deck controls, plus two extra shortcuts on every **Install** / **Update** button (on Discover and Updates cards, on **Search** results, in the [Manage](#manage) window, and for DeckyHub's own update):

| Button | What it does |
| --- | --- |
| **X** | Download that release's ZIP to `/home/deck/Downloads/deckyhub` instead of installing it. Not shown when **Download ZIP** is hidden in Settings. |
| **Y** | Show the release notes (what that release changes) without installing anything. |

Steam's footer shows the X and Y actions for whichever button is focused.

### Discover

Browse the curated list or search it by name, repository, category or description, and filter by **Status** (All, Installed, or Not Installed) and **Category**, and **Sort** A to Z, Z to A, or Recently added (newest additions to the list first; plugins with an update always come first). Each card is color-coded (green once it's up to date, yellow when an update is available, red on an error) so you can spot what needs attention at a glance, and says **Checking…** while its latest release is still being looked up. A card set to the pre-release **Channel** says so; stable is the default and isn't labelled. Tap **Manage** on any card to pick a channel and version, then download the release asset you want.

To get a plugin that isn't in the curated list, open **Search** from the Quick Access Menu and look it up on GitHub. **Install** adds the repository and installs its latest release through Decky Loader's own installer; **Add** only tracks it, so it shows up in Discover with update checks from then on. Tracked repositories are managed in **Settings** → **Repositories**.

### Updates

Shows every tracked tool that's installed and has a newer release available, along with its installed and latest version. Update a plugin from its [Manage](#manage) window, or, when more than one Decky plugin is waiting, tap **Update All** to hand them all to Decky Loader's installer behind a single confirmation. Plugins that need a fresh install instead of an in-place update (currently Unifideck) are left out of **Update All**; update those from their Manage window. The **Updates** button in the Quick Access Menu shows how many updates are waiting.

### Manage

Tap **Manage** on any card in Discover or Updates to:

- pick the release **channel** and a specific **version**. **Stable** shows only stable releases; **Pre-release** shows every release, newest first, so a stable release that comes out after the last pre-release is still offered;
- **Download ZIP**, open the **Release Page**, or **Check for Updates** for that app;
- for a Decky plugin, **Install** (not installed yet) or **Update** (the selected version is newer than the installed one). DeckyHub downloads the release ZIP (with a progress window, then a spinner until Decky is ready) and hands it to Decky Loader's own installer, the same one the Decky Store uses. Decky asks you to confirm and installs it, verifying the SHA-256 checksum GitHub publishes for the ZIP. Older releases (files uploaded before mid-2025) have no checksum and Decky installs them without that check;
- for an installed Decky plugin, **Uninstall**, which asks you to confirm and then removes the plugin and its settings through Decky Loader.

### Downloads

All downloads are saved to `/home/deck/Downloads/deckyhub`. **Cleanup** → **Empty Folder** in the Quick Access Menu clears that folder after confirmation. Starting a download opens a progress dialog with a **Cancel** button; once it finishes, the same dialog shows where the ZIP was saved and how to install it. If a download is interrupted, no partial file is left behind.

When GitHub provides a checksum for a release asset, DeckyHub always verifies it before keeping the download. By default, downloading a file again overwrites the previous copy; turn off **Overwrite Existing** in Settings if you'd rather keep both.

### Repositories

Search GitHub for a repository and tap **Add** (repositories you already track show **Already Added** instead, so you can tell at a glance). Results page five at a time. Export your custom repositories to `DeckyHub-repositories.json` in `/home/deck/Downloads` to back them up or share them, or import that file back in. Any repository you've added can be removed again here; the curated repositories stay available and can't be removed. Prefer a bigger screen? The [Registry Editor](https://mazillka.github.io/deckyhub-registry/editor.html) is a browser-based tool for building or editing a repository list file before importing it.

To switch a tracked app between stable and pre-release releases, use its [Manage](#manage) window.

Under **Custom Registries**, add someone else's app list by its GitHub `owner/repo` (DeckyHub reads its `registry/apps.json`) or any HTTPS `.json` URL. Its apps join Discover alongside the curated ones; up to 10 registries are allowed, and **Refresh registries** downloads them all again. An added registry can only add apps: it can't change or replace one DeckyHub already lists, including the plugins you have installed.

### Keeping DeckyHub itself updated

The Quick Access Menu shows the installed version (**DeckyHub vX.Y.Z**) and checks for a newer DeckyHub release in the background, with a notification the first time one appears; a note names the new version and an **Update** button installs it straight away, like an app card's. **Manage** opens DeckyHub's update window, where you pick a channel (**Stable releases**, or **Pre-releases** for every release) and a version, then:

- **Update to / Reinstall / Downgrade to vX.Y.Z** — downloads that release (with a progress window) and hands it to Decky Loader's own installer (the same one the Decky Store uses), which verifies its SHA-256 checksum and installs it in place. Only releases with a published checksum are offered.
- **Download ZIP** — the classic path: saves the release ZIP to `/home/deck/Downloads/deckyhub`, which you then install yourself via Decky's settings → Developer → Install Plugin from ZIP.

If automatic update isn't available for some reason (e.g. running inside an older Decky Loader build), fall back to Download ZIP.

## Good to know

- DeckyHub talks to GitHub without needing you to log in, so very heavy use in a short time may still hit GitHub's public rate limit (60 requests/hour) — if it does, the error names it as a rate limit and says roughly how long to wait, rather than just a raw status code. Add a personal access token in **Settings → GitHub Access** (no scopes needed — it only reads public repos and releases) to raise that to 5,000/hour; the token stays on your device and is only ever sent to `api.github.com`.
- Release information is cached for 30 minutes, so opening the same app's Manage window or the DeckyHub update modal again shortly after won't always show something new. Every "Check for Updates" and "Refresh" button bypasses this and asks GitHub directly.
- Downloads only ever happen over HTTPS.

## Disclaimer

DeckyHub is only a discovery and download tool. All rights to the plugins and tools listed in its registry belong to their respective authors; DeckyHub does not own, endorse, or take responsibility for any third-party repository or its content.

## License

GPL-3.0-or-later — see [LICENSE.md](LICENSE.md).

## Getting help

Found a bug or have an idea? Open an issue on the [GitHub repository](https://github.com/mazillka/deckyhub-plugin/issues) with a description of what happened; attaching the ZIP from **Export Logs** (Quick Access Menu → **Troubleshooting**) helps, and it never contains your GitHub token. Feedback and suggestions are always welcome.

Want to build DeckyHub from source or contribute a change? See [CONTRIBUTING.md](CONTRIBUTING.md).
