<div align="center">

<img src="docs/favicon.svg" width="80" height="80" alt="">

# DeckyHub

**Your Steam Deck's plugin hub — right inside Gaming Mode.**

Find, install and update Decky Loader plugins with your controller — from DeckyHub's plugin list, or any plugin on GitHub.

**English** · [Українська](README.uk.md)

[![Release](https://img.shields.io/github/v/release/mazillka/deckyhub-plugin?color=1d75cc)](https://github.com/mazillka/deckyhub-plugin/releases/latest)
[![Pre-release](https://img.shields.io/github/v/release/mazillka/deckyhub-plugin?include_prereleases&label=pre-release&color=8a9bb2)](https://github.com/mazillka/deckyhub-plugin/releases)
[![Tests](https://img.shields.io/github/actions/workflow/status/mazillka/deckyhub-plugin/ci.yml?branch=main&label=tests)](https://github.com/mazillka/deckyhub-plugin/actions/workflows/ci.yml)
[![Downloads](https://img.shields.io/github/downloads/mazillka/deckyhub-plugin/total?color=1d75cc)](https://github.com/mazillka/deckyhub-plugin/releases)
[![ClamAV](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmazillka%2Fdeckyhub-registry%2Fvirus-scans%2Fbadges%2Fmazillka%2Fdeckyhub-plugin%2Fclamav.json)](https://github.com/mazillka/deckyhub-registry#how-it-works)
[![YARA](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmazillka%2Fdeckyhub-registry%2Fvirus-scans%2Fbadges%2Fmazillka%2Fdeckyhub-plugin%2Fyara.json)](https://github.com/mazillka/deckyhub-registry#how-it-works)
[![VirusTotal](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmazillka%2Fdeckyhub-plugin%2Fbadges%2Fvirustotal.json)](https://github.com/mazillka/deckyhub-plugin/releases/latest)
[![MetaDefender](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmazillka%2Fdeckyhub-plugin%2Fbadges%2Fmetadefender.json)](https://github.com/mazillka/deckyhub-plugin/releases/latest)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue)](LICENSE.md)
[![Decky Loader plugin](https://img.shields.io/badge/Decky_Loader-plugin-green)](https://decky.xyz/)

[**Download**](https://github.com/mazillka/deckyhub-plugin/releases/latest) · [Website](https://deckyhub.com/) · [Release notes](https://deckyhub.com/releases.html) · [Plugin catalog](https://deckyhub.com/plugins/) · [Install guide](#installing-deckyhub) · [Report an issue](https://github.com/mazillka/deckyhub-plugin/issues)

<img src="screenshots/hero.jpg" width="800" alt="DeckyHub: Decky plugins, straight from GitHub. Its Discover screen on a Steam Deck, with plugin categories and the most popular plugins.">

<img src="promo/deckyhub.gif" width="800" alt="DeckyHub in action on a Steam Deck: its Quick Access tab with an update dot, Discover, a plugin's details, Updates with what each brings, and Settings tabs.">

<table>
<tr>
<td align="center"><img src="screenshots/menu.jpg" width="260" alt="DeckyHub's own tab in the Quick Access menu, with an update dot"><br><sub><b>Quick Access</b></sub></td>
<td align="center"><img src="screenshots/updates.jpg" width="260" alt="DeckyHub Updates screen"><br><sub><b>Updates</b></sub></td>
<td align="center"><img src="screenshots/manage.jpg" width="260" alt="DeckyHub Manage screen"><br><sub><b>Manage</b></sub></td>
</tr>
<tr>
<td align="center"><img src="screenshots/all-plugins.jpg" width="260" alt="DeckyHub's All plugins list with search and filters"><br><sub><b>All plugins</b></sub></td>
<td align="center"><img src="screenshots/search.jpg" width="260" alt="DeckyHub searching GitHub for Decky plugins"><br><sub><b>Search</b></sub></td>
<td align="center"><img src="screenshots/settings.jpg" width="260" alt="DeckyHub's Settings in tabs: General, GitHub, Downloads, Repositories, Logs and About"><br><sub><b>Settings</b></sub></td>
</tr>
<tr>
<td align="center"><img src="screenshots/discover.jpg" width="260" alt="DeckyHub's Discover screen with category chips and popular plugins, each with its virus scan badge"><br><sub><b>Discover</b></sub></td>
<td align="center"><img src="screenshots/scan-report.jpg" width="260" alt="DeckyHub's virus scan report for a plugin: ClamAV, YARA and VirusTotal results, the file and its SHA-256"><br><sub><b>Virus scan report</b></sub></td>
<td align="center"><img src="screenshots/installed.jpg" width="260" alt="DeckyHub's Installed page: your installed plugins with download counts, stars and security badges"><br><sub><b>Installed</b></sub></td>
</tr>
</table>

</div>

> [!CAUTION]
> **DeckyHub only fetches releases from their authors' GitHub repositories. It doesn't make, review or vouch for these plugins and isn't responsible for anything they do to your device or data. Install at your own risk.**

Tired of tabbing out to Desktop Mode, hunting through GitHub releases, and manually downloading ZIPs every time a plugin updates? DeckyHub brings plugin discovery and updates straight to your controller. Browse a catalog of over 500 Steam Deck plugins, search GitHub for any other Decky plugin and install it on the spot, and get notified when an update drops — all without leaving your couch. It's the first and last plugin you'll ever install from a ZIP.

> **A note on how this is made.** Most of DeckyHub's code was written with the help of AI tools (Claude and Codex). That doesn't mean it ships untested — every release is verified on real hardware before it goes out. I'm telling you this upfront so you know exactly what you're installing and how it got built.

**Contents:** [Why you'll like it](#why-youll-like-it) · [What it does](#what-it-does) · [The plugin list](#the-plugin-list) · [Requirements](#requirements) · [Installing](#installing-deckyhub) · [Using DeckyHub](#using-deckyhub) · [Uninstalling](#uninstalling-deckyhub) · [Troubleshooting](#troubleshooting) · [Privacy](#privacy) · [Disclaimer](#disclaimer) · [Getting help](#getting-help)

## Why you'll like it

- **Any plugin on GitHub, one search away** — **Search & Install** finds Decky plugins that aren't in the Decky store or DeckyHub's list and installs them right from Gaming Mode. No Desktop Mode, no browser, no Developer Mode URL pasting.
- **Never miss an update** — DeckyHub checks your installed plugins against their latest GitHub releases every few hours and pings you with a toast when something new is available.
- **Built for the couch** — full gamepad navigation, color-coded status at a glance, and one-tap downloads designed for Gaming Mode, not a desktop browser squeezed onto a small screen.
- **You stay in control** — DeckyHub never installs or runs anything on its own. Nothing touches your system until you say so, and installs go through Decky Loader's own installer and confirmation dialog (see [Manage](#manage)).

## What it does

- **[Discover](#discover)** — browse DeckyHub's list of Steam Deck plugins/tools, filter by search or installed status, and see release info at a glance, color-coded by status.
- **[Search & Install](#search--install)** — search GitHub for Decky plugins and install one in a tap, or add it to track its updates.
- **[Updates](#updates)** — see which of your tracked, installed tools have a newer release available and what each one brings, and update the Decky plugins among them in one go with **Update All**. DeckyHub checks in the background every few hours, so the dot on its icon and a toast tell you when new updates show up, and each card says **Installing…** until Decky finishes, then a toast confirms it.
- **[Settings](#settings)** — language, display, an optional GitHub token, downloads, your tracked repositories and custom registries, and log export.
- **Quick Access Menu** — DeckyHub has its own tab (the four-square DeckyHub icon, with a dot when updates are waiting) in the Quick Access tab strip, next to Decky's, and still opens from Decky's plugin list too. It shows **Discover**, **Search** and **Settings**, plus **Updates** with a count whenever updates are waiting. Below them: DeckyHub's own version and update check, and a **Cleanup** section (shown when the download folder has files) that empties it after confirmation.

If you'd rather install a plugin yourself, **Download ZIP** saves the release instead, and you install it the same way as DeckyHub itself (see [Option 2: Manual ZIP](#option-2-manual-zip)).

## The plugin list

No setup, no configuration — the plugin list shows up in Discover the moment you install DeckyHub. It lives in [mazillka/deckyhub-registry](https://github.com/mazillka/deckyhub-registry) and refreshes every time DeckyHub starts, so new apps show up without a DeckyHub update. DeckyHub keeps the last list it downloaded for offline use; a fresh install needs to reach GitHub once.

**Where the plugins come from:**

- **Suggested:** plugins people suggest through the registry's issues and pull requests.
- **[Decky Extended Plugins](https://decky-extended-plugins.beallio.com/)** by [beallio](https://github.com/beallio): a community catalog of the Decky store plus community plugins, with a [security audit](https://decky-extended-plugins.beallio.com/audit).
- **[Decky Plugins Explorer](https://safetzahirovic.github.io/decky-plugins-explorer/)** by [SafetZahirovic](https://github.com/SafetZahirovic): a nightly crawl of every public GitHub repository with a Decky `plugin.json`.

A daily job checks both catalogs, plus its own search of GitHub for repositories tagged or named like Decky plugins, for plugins that aren't listed yet, skips ones that look unfinished (brand new, nobody using them yet, a placeholder version), and opens a pull request with the ones that qualify. Every plugin, however it was found, has to have a stable GitHub release with exactly one plugin ZIP whose `plugin.json` name matches. These are automatic checks for a working release: nobody reviews the plugins themselves, for safety or anything else; the [catalog](https://deckyhub.com/plugins/) and Discover flag plugins that run as root, haven't had a release in a year, or got a warning from the [security audit](https://decky-extended-plugins.beallio.com/audit) (see [Badges](#badges)).

- **Browse it:** the [plugin catalog](https://deckyhub.com/plugins/) lists every plugin, searchable and by category, with downloads and stars.
- **Suggest a plugin:** open an [issue](https://github.com/mazillka/deckyhub-registry/issues/new) or a pull request in the registry repository.
- **Want more?** Find any other Decky plugin on GitHub with **[Search & Install](#search--install)**.

## Requirements

- A Steam Deck, or another SteamOS device, with [Decky Loader](https://decky.xyz/) 3.x installed.
- An internet connection that can reach GitHub. No GitHub account is needed.

## Installing DeckyHub

There are two ways to install DeckyHub. Pick one:

| | **Desktop installer** (recommended) | **Manual ZIP** |
| --- | --- | --- |
| Where | Desktop Mode | Gaming Mode |
| Decky Loader | Checked, and installed if it's missing | Must already be installed |
| Admin password | Needed | Not needed |
| What you do | Download one file and follow the steps it shows | Download the ZIP and add it in Decky's developer settings, or paste a link |
| Decky Loader setup | None: Decky Loader and DeckyHub are set up in one go | You install Decky Loader first |

Afterward, DeckyHub can install and update plugins from Gaming Mode.

### Option 1: Desktop installer (recommended)

One download sets up **both Decky Loader and DeckyHub**: it checks for [Decky Loader](https://decky.xyz/) first and installs it if your Deck doesn't have it yet, then installs DeckyHub. That saves you installing Decky Loader separately, and the extra steps and commands that takes. Prefer not to use it? [Option 2](#option-2-manual-zip) needs no password.

1. Switch to Desktop Mode (**Steam** → **Power** → **Switch to Desktop**).
2. Put `Install-DeckyHub.desktop` **on the Desktop**; the shortcut only works from there. <!-- choose --> **Download it:** download [`Install-DeckyHub.desktop`](https://github.com/mazillka/deckyhub-plugin/releases/latest/download/Install-DeckyHub.desktop), then open **Downloads** in Dolphin and drag it onto the Desktop (or cut and paste it). If your browser saved it as `Install-DeckyHub.desktop.download` (Firefox does that for shortcut files), rename it to `Install-DeckyHub.desktop` first. <!-- or --> **Or use Konsole:** open **Konsole** and run this command, which saves it on the Desktop under the right name: `curl -fsSL -o ~/Desktop/Install-DeckyHub.desktop https://github.com/mazillka/deckyhub-plugin/releases/latest/download/Install-DeckyHub.desktop && chmod +x ~/Desktop/Install-DeckyHub.desktop`
3. Double-click **Install DeckyHub** on the Desktop and choose **Continue** (or **Execute**) when asked.
4. Read the overview. It lists every step, with Decky Loader first (checked, or installed if it's missing) and DeckyHub only after it, and says why the admin password is needed. Then choose **Install** (or **Update** or **Reinstall**, when DeckyHub is already there). The installer doesn't collect, save or send any information about you or your Deck; it only downloads files from GitHub. It checks that GitHub is reachable, then asks for your Deck's admin password (the one you set for Desktop Mode, not your Steam password). If you've never set one, it offers a temporary one and removes it when it's done, like Decky Loader's own installer.
5. Optionally look at a few hand-picked plugins, one at a time: skip is the default, and you add plugins at your own risk (see "Optional plugins" below).
6. Follow the progress window ("Step 3 of 5: …") until the finish message lists what was done and what to do next. If it reports an error, follow the instructions in the message.
7. Return to Gaming Mode and pick DeckyHub's four-square icon in the Quick Access Menu.

What it does: first it checks that Decky Loader is installed, and if it isn't, runs [Decky Loader's official installer](https://github.com/SteamDeckHomebrew/decky-installer). Only then does it download that release's `DeckyHub-v*.zip` from GitHub, check its SHA-256 against the one the installer was made with (and stop if they differ), put it in Decky's plugins folder and restart Decky. The password is needed because installing and restarting Decky Loader change the Deck itself. The script is [`installer/install-deckyhub.sh`](installer/install-deckyhub.sh); each release attaches it filled in with its own version and checksum, and scans it for malware like the ZIP.

Optional plugins: after the overview, the installer shows a few hand-picked plugins (frame generation, themes and more) **one at a time**. Each card has its version, notes (AI-assisted, runs as root, audit warnings), stars and downloads, and clickable links to its GitHub repository and its page on deckyhub.com with its security scans. **Skip** is the default button, so nothing is added unless you choose **Add this plugin**, and the installer says DeckyHub isn't responsible for what you install: you add plugins at your own risk. The installer doesn't install them: it saves your picks, and the first time you open DeckyHub it lists them again and installs them, with the usual confirmation, only if you agree. Skip it and nothing is saved.

<table>
<tr>
<td align="center"><img src="screenshots/installer-overview.jpg" width="260" alt="The installer's overview: every step, why the admin password is needed, what it does with your data"><br><sub><b>Overview</b></sub></td>
<td align="center"><img src="screenshots/installer-plugins.jpg" width="260" alt="The installer's list of optional plugins: nothing is installed by it, DeckyHub asks you to confirm each one later"><br><sub><b>Optional plugins</b></sub></td>
<td align="center"><img src="screenshots/installer-card.jpg" width="260" alt="One optional plugin's card: version, notes, stars, links to GitHub and its DeckyHub page, and Skip as the default"><br><sub><b>A plugin's card</b></sub></td>
</tr>
<tr>
<td align="center"><img src="screenshots/installer-password.jpg" width="260" alt="The admin password prompt: used only on this Deck, right now, and never saved"><br><sub><b>Password</b></sub></td>
<td align="center"><img src="screenshots/installer-progress.jpg" width="260" alt="The installer's progress bar: Step 5 of 5, restarting Decky Loader"><br><sub><b>Progress</b></sub></td>
<td align="center"><img src="screenshots/installer-done.jpg" width="260" alt="The installer's All done! message: what was installed and what to do next"><br><sub><b>All done</b></sub></td>
</tr>
</table>

### Option 2: Manual ZIP

Decky Loader must already be installed. No admin password is needed.

1. Download the latest `DeckyHub-v*.zip` from the [Releases page](https://github.com/mazillka/deckyhub-plugin/releases).
2. In Gaming Mode, open the Quick Access Menu → Decky → settings (gear icon). Turn on **Developer mode** under General if it's off, then go to **Developer** → **Install Plugin from ZIP** and select the downloaded file.
3. Pick DeckyHub's four-square icon in the Quick Access Menu (or Decky → **DeckyHub**).

#### Alternative: install the ZIP from a URL

If Decky Loader is already installed:

1. Open the Quick Access Menu → **Decky** → settings (gear icon), and turn on **Developer mode** under **General** if it's off.
2. Go to **Developer** → **Install Plugin from URL** and enter this link, which always points to the newest DeckyHub release:

   `https://github.com/mazillka/deckyhub-plugin/releases/latest/download/DeckyHub.zip`

   <img src="docs/install-link-qr.svg" width="140" alt="QR code of the link above">

   Scan the QR code to have the link on your phone while you type it.
3. Pick DeckyHub's four-square icon in the Quick Access Menu (or Decky → **DeckyHub**).

## Using DeckyHub

### Controller buttons

DeckyHub uses the standard Steam Deck controls, plus extra shortcuts on every **Install** / **Update** button (on Discover and Updates cards, on **Search** results, in the [Manage](#manage) window, and for DeckyHub's own update):

| Button | What it does |
| --- | --- |
| **X** | Download that release's ZIP to `/home/deck/Downloads/deckyhub` instead of installing it. Not shown when **Download ZIP** is hidden in Settings. |
| **Y** | Show the release notes (what that release changes) without installing anything. |
| **Menu** (☰) | Open the plugin's GitHub page. Not on DeckyHub's own update. |

Steam's footer shows these actions for whichever button is focused.

### Discover

Discover opens on three shelves, **Most popular**, **Recently updated** and **New in DeckyHub**, under a row of category chips with how many plugins each holds. Tap a chip, or **See all** on a shelf, to browse the whole list: as a compact list of every plugin (the default), or as a **Grid** of cards a page at a time (**L1** / **R1** turn the page). **Updates** and **Search** have the same **Grid** / **List** switch, and DeckyHub remembers your choice. The first time, a short welcome above the shelves says what DeckyHub does and how to stay safe.

Each card is color-coded (green once it's up to date, yellow when an update is available, red on an error) so you can spot what needs attention at a glance, and says **Checking…** while its latest release is still being looked up. Listed plugins also show their all-time downloads, GitHub stars and when they were last updated; the page header shows the total downloads. A card set to the pre-release **Channel** says so; stable is the default and isn't labelled. Tap **Manage** on any card to pick a channel and version, then download the release asset you want.

#### Search, filters and sorting

Search the list by name, repository, category or description, and open **Filters** to narrow it:

- **Status:** All, Installed, or Not Installed.
- **Category:** any of the list's categories.
- **Sort:** A to Z, Z to A, Most downloaded, Most stars, Recently updated, or Recently added (newest additions to the list first). Plugins with an update always come first, and **Then by** orders plugins the first sort leaves tied.

Every **Status** and **Category** option shows how many plugins it would list.

#### Badges

Cards can carry these badges. **More** on the "What the badges on plugins mean" notice at the top of Discover explains them in the app too.

| Badge | What it means |
| --- | --- |
| **Runs as root** | Its backend runs as root, with full access to the system. Install only if you trust the author. |
| **No release in a year** | No new release for over a year, so it may be abandoned. |
| **Fork** | A fork that carries a plugin on after its original stopped. DeckyHub lists it only while it's the active one. |
| **AI** | Its repository has instructions for AI coding assistants (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md` and similar), so it's likely developed with AI help. It says nothing about quality or safety, and no badge doesn't mean no AI was used. |
| **No threats** / **Threat found** / **Not fully scanned** | The virus scans of the release you'd install (ClamAV and YARA; the badge shows the worse of the two): nothing found, something flagged (it may be a false positive; open **Manage** for the report and decide), or it couldn't scan all of it (**Manage** says why). No badge until it's been scanned. The registry also looks up each public ZIP on MetaDefender by SHA-256 and uploads it there if it has no report. New, pending, failed, or unsupported scans may not have a result yet. A clean scan isn't proof of safety. |

These warnings come from Decky Extended Plugins' automated [security audit](https://decky-extended-plugins.beallio.com/audit) of the release you'd install. Routine findings like `sudo`, `mount` or `systemctl` aren't shown. A warning isn't proof of harm, and no warning isn't proof of safety.

| Warning | What the audit found |
| --- | --- |
| **Blocked by audit** | Malware or a broken archive. Not recommended for installation. |
| **Reads private data** | It reads Steam login data, SSH keys or secrets from the environment. |
| **Changes system startup** | It edits shell profiles, preloads libraries, loads kernel modules or adds device rules, which keep working outside Decky. |
| **Code not in its repo** | The release has scripts or programs that aren't in its GitHub source, so you can't read what they do. |
| **Hidden code** | It contains encoded or packed code that's hard to read. |
| **Skips HTTPS checks** | It turns off certificate checks, so what it downloads could be tampered with. |
| **Runs downloaded scripts** | It downloads a script and runs it straight away. |
| **Known vulnerabilities** | It bundles libraries with published security flaws. |

A warning about a newer pre-release is labelled **Pre-release:**. Download counts, stars and warnings come from the registry, refreshed every hour.

### Search & Install

Not every Decky plugin is in the Decky store or DeckyHub's list. Open **Search** from the Quick Access Menu, type what you're after, and DeckyHub looks it up on GitHub, right from Gaming Mode.

- **Only Decky plugins** — results are limited to repositories that are actually Decky plugins, so awesome-lists, guides and unrelated projects don't get in the way.
- **Install** — adds the repository to your tracked list and hands its latest release to Decky Loader's own installer, behind the usual confirmation. From then on it shows up in Discover with update checks, like any listed plugin.
- **Add** (the **+** beside Install) — only tracks the repository, so you can look at it in Discover and install it later. Results already in DeckyHub say **In DeckyHub**.
- **Y** on a result's **Install** shows that release's notes, and **X** downloads its ZIP instead.

> [!WARNING]
> Search results come straight from GitHub and nobody has reviewed them: not DeckyHub, not the Decky store. A plugin can do anything on your Deck, so only install plugins from authors you trust.

Tracked repositories are listed in **Settings** → **Repositories**, where you can remove them or export and import the list.

### Updates

Shows every tracked tool that's installed and has a newer release available, along with its installed and latest version. Update a plugin from its [Manage](#manage) window, or, when more than one Decky plugin is waiting, tap **Update All** to hand them all to Decky Loader's installer behind a single confirmation. A few plugins can't be updated in place because of a Decky Loader bug: **Update All** leaves them out, and their Manage window explains that DeckyHub removes the installed version before Decky installs the new one. The **Updates** button in the Quick Access Menu shows how many updates are waiting.

### Manage

Tap **Manage** on any card in Discover or Updates to:

- pick the release **channel** and a specific **version**. **Stable** shows only stable releases; **Pre-release** shows every release, newest first, so a stable release that comes out after the last pre-release is still offered;
- **Download ZIP**, open the **Release Page**, or **Check for Updates** for that app;
- for a Decky plugin, **Install** (not installed yet) or **Update** (the selected version is newer than the installed one). DeckyHub downloads the release ZIP (with a progress window, then a spinner until Decky is ready) and hands it to Decky Loader's own installer, the same one the Decky store uses. Decky asks you to confirm and installs it, verifying the SHA-256 checksum GitHub publishes for the ZIP. Older releases (files uploaded before mid-2025) have no checksum and Decky installs them without that check;
- for an installed Decky plugin, **Uninstall**, which asks you to confirm and then removes the plugin and its settings through Decky Loader;
- check the **Virus scan** of the selected version's ZIP: **No threats found**, **Threat found** (with what was matched), or **Couldn't be scanned** (with the reason), or **Not scanned yet**, and when it was scanned. Each scanner gets its own line: **ClamAV** and **YARA**. **Scan report** shows the full report: the file, its SHA-256, each scanner's version, signatures or rules, and date. **VirusTotal** opens [VirusTotal](https://www.virustotal.com/)'s page for the ZIP's SHA-256 in Steam's browser; nothing is uploaded, so it only has results if someone sent VirusTotal the same file before. **Copy ZIP link** puts the ZIP's download link on the clipboard, and **Scan link on VirusTotal** copies it too and opens VirusTotal's URL scan page to paste it into (VirusTotal mainly rates the link itself, so it may not check what's inside the ZIP). The scan never stops you installing: read the report and decide for yourself. DeckyHub's registry [scans every plugin ZIP it offers](https://github.com/mazillka/deckyhub-registry#repositories) every few hours with [ClamAV](https://www.clamav.net/), an open-source antivirus, and the files inside it with [YARA](https://virustotal.github.io/yara/) and [YARA Forge](https://github.com/YARAHQ/yara-forge)'s community rules, many written for Linux malware, so a brand-new release may not have a report yet. A clean scan isn't proof of safety.

### Settings

Settings is split into tabs; **L1** / **R1** switch between them.

| Tab | What's in it |
| --- | --- |
| **General** | The language, and the display: **Grid** or **List**, **Default** or **Compact** density, items per row, haptics, whether DeckyHub has its own tab in Quick Access, and which Manage-window buttons to hide. |
| **GitHub** | An optional personal access token that raises GitHub's rate limit (see [Troubleshooting](#troubleshooting)). Type it, or load it from a text file in Downloads. |
| **Downloads** | The download folder and the **Overwrite Existing** toggle (see [Downloads](#downloads)). |
| **Repositories** | Your tracked repositories, export and import, and **Custom Registries** (see [Repositories](#repositories)). |
| **Logs** | **Export Logs**, for bug reports. |
| **About** | What DeckyHub is, and the catalogs it builds on. |

DeckyHub comes in English, Ukrainian, Russian, Spanish, German, French, Portuguese (Brazil and Portugal), Italian, Polish, Turkish, Dutch, Czech, Japanese, Korean, and Chinese (Simplified and Traditional). Translations other than English are made automatically, so they may have mistakes; corrections are welcome.

A tracked app's release channel isn't set here: use its [Manage](#manage) window.

### Downloads

All downloads are saved to `/home/deck/Downloads/deckyhub`. **Cleanup** → **Empty Folder** in the Quick Access Menu clears that folder after confirmation. Starting a download opens a progress dialog with a **Cancel** button; once it finishes, the same dialog shows where the ZIP was saved and how to install it. If a download is interrupted, no partial file is left behind.

When GitHub provides a checksum for a release asset, DeckyHub always verifies it before keeping the download. By default, downloading a file again overwrites the previous copy; turn off **Overwrite Existing** in Settings if you'd rather keep both.

### Repositories

Repositories is a tab in **Settings**. Add a repository from **Search** with the **+** beside a result's **Install** (results already in DeckyHub say **In DeckyHub** instead). Export your custom repositories to `DeckyHub-repositories.json` in `/home/deck/Downloads` to back them up or share them, or import that file back in. Any repository you've added can be removed again here; the plugins in DeckyHub's own list stay available and can't be removed. Prefer a bigger screen? The [Registry Editor](https://deckyhub.com/contribute/editor.html) is a browser-based tool for building or editing a repository list file before importing it.

Under **Custom Registries**, add someone else's app list by its GitHub `owner/repo` (DeckyHub reads its `registry/apps.json`) or any HTTPS `.json` URL. Its apps join Discover alongside DeckyHub's own; up to 10 registries are allowed, and **Refresh registries** downloads them all again. An added registry can only add apps: it can't change or replace one DeckyHub already lists, including the plugins you have installed.

### Keeping DeckyHub itself updated

The Quick Access Menu shows the installed version (**DeckyHub vX.Y.Z**) and checks for a newer DeckyHub release in the background, with a notification the first time one appears; a note names the new version and an **Update** button installs it straight away, like an app card's. **Manage** opens DeckyHub's update window, where you pick a channel (**Stable releases**, or **Pre-releases** for every release) and a version, then:

- **Update to / Reinstall / Downgrade to vX.Y.Z** — downloads that release (with a progress window) and hands it to Decky Loader's own installer (the same one the Decky store uses), which verifies its SHA-256 checksum and installs it in place. Only releases with a published checksum are offered.
- **Download ZIP** — the classic path: saves the release ZIP to `/home/deck/Downloads/deckyhub`, which you then install yourself (see [Option 2: Manual ZIP](#option-2-manual-zip)).

The update window also shows the selected release's **Virus scan** report. Every DeckyHub release is scanned with ClamAV before it's published; the result is stated in its release notes and its scan report is attached to the [release](https://github.com/mazillka/deckyhub-plugin/releases); its Python and TypeScript code is checked by GitHub [CodeQL](https://github.com/mazillka/deckyhub-plugin/actions/workflows/codeql.yml) on every change.

**Registry Channel**, in DeckyHub's own **Manage** window (Quick Access → DeckyHub → **Manage**), picks which version of DeckyHub's own plugin list you see. **Stable** (the default) is what everyone gets. **Pre-release** shows plugins and list changes that are still being tested, and Updates and Discover say **Pre-release registry** while it's on; if that list can't be loaded, DeckyHub uses the stable one. Switching reloads the list straight away.

## Uninstalling DeckyHub

Open Decky's settings (gear icon) → **Plugins**, open the menu next to **DeckyHub** and choose **Uninstall**. Decky removes DeckyHub together with its settings and cached lists. Plugins you installed through DeckyHub stay installed.

Files DeckyHub saved to Downloads aren't removed: release ZIPs in `/home/deck/Downloads/deckyhub`, and any exported repository lists or log ZIPs in `/home/deck/Downloads`. Use **Cleanup** → **Empty Folder** before uninstalling, or delete them in Desktop Mode.

## Troubleshooting

- **"Rate limit" errors.** DeckyHub talks to GitHub without needing you to log in. Release info for DeckyHub's list comes from one file the registry refreshes every hour, so browsing doesn't use up GitHub's public rate limit (60 requests/hour). Searching and repositories you added yourself still ask GitHub directly, so very heavy use may hit it; the error then says roughly how long to wait. To raise the limit to 5,000/hour, add a personal access token in **Settings → GitHub** (no scopes needed; see [Privacy](#privacy) for where it goes).
- **A new release doesn't show up.** Release information is cached for 30 minutes. Every **Check for Updates** and **Refresh** button skips the cache, though a brand-new release can take up to an hour to reach the plugin list's release file.
- **Discover is empty on a fresh install.** DeckyHub needs to reach GitHub once to download the plugin list; after that it works offline from the last copy.
- **Install, Update or DeckyHub's own update doesn't work.** On an older Decky Loader build, one-tap installs may not be available. Use **Download ZIP** and install it from Decky's Developer settings (see [Option 2: Manual ZIP](#option-2-manual-zip)), or update Decky Loader.
- **Anything else.** Open an issue (see [Getting help](#getting-help)) and attach the ZIP from **Export Logs**.

Downloads only ever happen over HTTPS.

## Privacy

DeckyHub has no account, analytics or telemetry, and sends nothing to its author or to any server of its own.

- **What it connects to:** only GitHub — `raw.githubusercontent.com` and `github.com` for the plugin list, release info, virus scan reports and downloads, and `api.github.com` for search and repositories that aren't in the list — plus the HTTPS address of any custom registry you add. GitHub sees these requests as it would any browser's (your IP address and which repositories are looked up), under [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement). Links such as a plugin's repository or the audit page open only when you tap them.
- **What stays on your Deck:** your settings, tracked repositories, custom registries and the cached plugin list and release info. The settings file is readable only by your user.
- **Your GitHub token** is optional, needs no scopes, is only ever sent to `api.github.com`, and is never written to the logs.
- **Logs** never leave the Deck on their own. **Export Logs** saves a ZIP to your Downloads folder with what DeckyHub did and any errors (repository names, file paths, versions); you decide whether to attach it to an issue.

## Disclaimer

Not affiliated with Valve or the Decky Loader project. DeckyHub is a discovery and download tool: plugin information comes from public GitHub repositories, and every plugin belongs to its own authors. DeckyHub doesn't review, own or endorse any third-party plugin or its content, and isn't responsible for what one does. Plugins are installed at your own risk, so look at a plugin's repository before you install it, especially one found through Search.

## License

Copyright © 2026 Andrii Shevchuk-Yuhanets ([mazillka](https://github.com/mazillka)).

GPL-3.0-or-later — see [LICENSE.md](LICENSE.md).

## Getting help

Found a bug or have an idea? Open an issue on the [GitHub repository](https://github.com/mazillka/deckyhub-plugin/issues) with a description of what happened; attaching the ZIP from **Export Logs** (**Settings** → **Logs**) helps. Feedback and suggestions are always welcome.

Want to build DeckyHub from source or contribute a change? See [CONTRIBUTING.md](CONTRIBUTING.md). Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
