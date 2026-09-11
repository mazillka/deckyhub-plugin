# DeckyHub

DeckyHub is a Decky Loader plugin for Steam Deck (and other Decky-compatible handhelds) that helps you discover, install, and update other plugins and tools straight from Gaming Mode — no Desktop Mode browsing required to find them.

It ships with a small curated list of popular Steam Deck tools, and you can add any GitHub repository you like.

> **A note on how this is made.** Most of DeckyHub's code was written with the help of AI tools (Claude and Codex). That doesn't mean it ships untested — every release is verified on real hardware before it goes out. I'm telling you this upfront so you know exactly what you're installing and how it got built.

## What it does

- **Discover** — browse a curated list of Steam Deck plugins/tools, filter by search or installed status, and see release info at a glance, color-coded by status.
- **Updates** — see which of your tracked, installed tools have a newer release available, and download updates in one tap. You'll also get a toast notification when new updates show up.
- **Repositories** — two tabs: **Add & Manage** to search GitHub, add or remove tracked repositories, and export/import your list; **Repository Settings** for per-repository overrides (release channel, download folder, asset keyword filter) plus a manual registry refresh.
- **Settings** — change the global download folder, toggle SHA-256 verification and overwriting existing files, and check for DeckyHub's own updates.

DeckyHub only **downloads** files — it never installs or runs anything automatically. After a download finishes, you install it yourself from Desktop Mode via Decky → Developer → Install Plugin from ZIP. This keeps you in control of what actually runs on your system.

## Bundled repositories

DeckyHub ships tracking these repositories out of the box — no setup needed, they show up in Discover immediately:

| Tool | Category | Repository |
| --- | --- | --- |
| MAKO Decky | Frame Generation | [eugeniosegala/MAKO](https://github.com/eugeniosegala/MAKO) |
| Decky LSFG-VK | Frame Generation | [xXJSONDeruloXx/decky-lsfg-vk](https://github.com/xXJSONDeruloXx/decky-lsfg-vk) |
| Unifideck | Game Libraries | [mubaraknumann/unifideck](https://github.com/mubaraknumann/unifideck) |
| Decky Framegen | Frame Generation | [xXJSONDeruloXx/Decky-Framegen](https://github.com/xXJSONDeruloXx/Decky-Framegen) |
| Nexus Mods | Mod Managers | [RedRanger14/decky-nexus](https://github.com/RedRanger14/decky-nexus) |

Add any other GitHub repository from **Repositories → Add & Manage**.

## Installing DeckyHub

1. Make sure [Decky Loader](https://decky.xyz/) is installed.
2. Download the latest `DeckyHub-v*.zip` from the [Releases page](https://github.com/mazillka/deckyhub-plugin/releases).
3. In Gaming Mode, open the Quick Access Menu → Decky → Developer → **Install Plugin from ZIP**, and select the downloaded file.
4. Open Quick Access Menu → Decky → **DeckyHub**.

## Using DeckyHub

### Discover

Browse the bundled list or search within it, and filter by **Status** — All, Installed, or Not Installed. Each card is color-coded (green once it's up to date, yellow when an update is available, red on an error) so you can spot what needs attention at a glance. Tap **Download Latest** on any card to grab the recommended release asset, or one of the other listed assets from that release.

To track a repository that isn't in the curated list, go to **Repositories**, search for it, and add it — it'll show up in Discover from then on.

### Updates

Shows every tracked tool that's installed and has a newer release available, along with its installed and latest version. Use **Download All Updates** to queue every pending update at once, or download them one at a time.

### Downloads

Downloads are saved to `/home/deck/Downloads/plugins` by default (or `/home/deck/Downloads`, if you change that in Settings, or a per-repository override in Repositories → Repository Settings). Each card shows progress, file size, and a **Cancel** button while downloading. If a download is interrupted, no partial file is left behind.

When GitHub provides a checksum for a release asset, DeckyHub verifies it by default — turn off **Verify SHA256 When Available** in Settings if you don't want that check. By default, downloading a file again overwrites the previous copy; turn off **Overwrite Existing Files** in Settings if you'd rather keep both.

### Repositories

Two tabs:

- **Add & Manage** — search GitHub for a repository and tap **Add** (repositories you already track show **Already Added** instead, so you can tell at a glance). Results page five at a time. Export your custom repositories to `DeckyHub-repositories.json` in `/home/deck/Downloads` to back them up or share them, or import that file back in. Any repository you've added can be removed again here; the curated repositories that ship with DeckyHub stay available and can't be removed. Prefer a bigger screen? The [Registry Editor](https://mazillka.github.io/deckyhub-plugin/) is a browser-based tool for building or editing a repository list file before importing it.
- **Repository Settings** — per-repository controls: switch a repository between stable and pre-release, filter which release assets show up (comma-separated keywords), or send its downloads to a different folder than your global default. Use **Refresh Registry From GitHub** to re-pull the curated list.

### Keeping DeckyHub itself updated

Settings includes a **Check DeckyHub Update** option that looks for new stable releases (or pre-releases, if you opt in) of DeckyHub itself and downloads the ZIP to `/home/deck/Downloads`. Install it the same way as any other plugin ZIP.

## Good to know

- DeckyHub talks to GitHub without needing you to log in, so very heavy use in a short time may hit GitHub's public rate limit — release info will just take a bit longer to refresh if that happens.
- Release information is cached for 3 minutes, so pulling to refresh right after checking won't always show something new.
- Downloads only ever happen over HTTPS.

## Disclaimer

DeckyHub is only a discovery and download tool. All rights to the plugins and tools listed in its registry belong to their respective authors; DeckyHub does not own, endorse, or take responsibility for any third-party repository or its content.

## Getting help

If something isn't working, please open an issue on the [GitHub repository](https://github.com/mazillka/deckyhub-plugin/issues) with a description of what happened.

Want to build DeckyHub from source or contribute a change? See [CONTRIBUTING.md](CONTRIBUTING.md).
