# DeckyHub

DeckyHub is a Decky Loader plugin for Steam Deck (and other Decky-compatible handhelds) that helps you discover, install, and update other plugins and tools straight from Gaming Mode — no Desktop Mode browsing required to find them.

It ships with a small curated list of popular Steam Deck tools, and you can add any GitHub repository you like.

> **A note on how this is made.** Most of DeckyHub's code was written with the help of AI tools (Claude and Codex). That doesn't mean it ships untested — every release is verified on real hardware before it goes out. We're telling you this upfront so you know exactly what you're installing and how it got built.

## What it does

- **Discover** — browse a curated list of Steam Deck plugins/tools, search GitHub for more, and add any repository you want to track.
- **Updates** — see which of your tracked, installed tools have a newer release available, and download updates in one tap. You'll also get a toast notification when new updates show up.
- **Settings** — change the download folder, toggle SHA-256 verification and overwriting existing files, manage your custom repository list, and check for DeckyHub's own updates.
- **Repository settings** — per-repository overrides: release channel, download folder, and asset keyword filter, plus a manual registry refresh.

DeckyHub only **downloads** files — it never installs or runs anything automatically. After a download finishes, you install it yourself from Desktop Mode via Decky → Developer → Install Plugin from ZIP. This keeps you in control of what actually runs on your system.

## Installing DeckyHub

1. Make sure [Decky Loader](https://decky.xyz/) is installed.
2. Download the latest `DeckyHub-v*.zip` from the [Releases page](https://github.com/mazillka/deckyhub-plugin/releases).
3. In Gaming Mode, open the Quick Access Menu → Decky → Developer → **Install Plugin from ZIP**, and select the downloaded file.
4. Open Quick Access Menu → Decky → **DeckyHub**.

## Using DeckyHub

### Discover

Browse the bundled list or search GitHub for a specific repository. Use the search box and category dropdown to narrow things down. Tap **Download latest** on any card to grab the recommended release asset, or **Choose asset** to pick a specific file from that release.

To track a repository that isn't in the curated list, go to **Settings → Add GitHub repository**, search for it, and add it — it'll show up in Discover from then on.

### Updates

Shows every tracked tool that's installed and has a newer release available, along with its installed and latest version. Use **Download all updates** to queue every pending update at once, or download them one at a time.

### Downloads

Downloads are saved to `/home/deck/Downloads/plugins` by default (or `/home/deck/Downloads`, if you change that in Settings, or a per-repository override in Repository settings). Each card shows progress, file size, and a **Cancel** button while downloading. If a download is interrupted, no partial file is left behind.

When GitHub provides a checksum for a release asset, DeckyHub verifies it by default — turn off **Verify SHA256 when available** in Settings if you don't want that check. By default, downloading a file again overwrites the previous copy; turn off **Overwrite existing files** in Settings if you'd rather keep both.

### Managing your repository list

- **Settings → Add GitHub repository**: search GitHub by name and add a result to Discover.
- **Export repository list**: saves your custom (non-curated) repositories to `DeckyHub-repositories.json` in `/home/deck/Downloads`, so you can back them up or share them.
- **Import repository list**: reads that same file from `/home/deck/Downloads` and adds any new repositories from it.
- Any repository you've added can be removed again from Settings. The curated repositories that ship with DeckyHub stay available and can't be removed.
- Prefer a bigger screen? The [Registry Editor](https://mazillka.github.io/deckyhub-plugin/) is a browser-based tool for building or editing a repository list file before importing it.

### Repository settings

Open **Repository settings** for per-repository controls: switch a repository between stable and pre-release, filter which release assets show up (comma-separated keywords), or send its downloads to a different folder than your global default. Use **Refresh registry from GitHub** to re-pull the curated list.

### Keeping DeckyHub itself updated

Settings includes a **Check for DeckyHub updates** option that looks for new stable releases (or pre-releases, if you opt in) of DeckyHub itself and downloads the ZIP to `/home/deck/Downloads`. Install it the same way as any other plugin ZIP.

## Good to know

- DeckyHub talks to GitHub without needing you to log in, so very heavy use in a short time may hit GitHub's public rate limit — release info will just take a bit longer to refresh if that happens.
- Release information is cached for 15 minutes, so pulling to refresh right after checking won't always show something new.
- Downloads only ever happen over HTTPS.

## Getting help

If something isn't working, please open an issue on the [GitHub repository](https://github.com/mazillka/deckyhub-plugin/issues) with a description of what happened.

Want to build DeckyHub from source or contribute a change? See [CONTRIBUTING.md](CONTRIBUTING.md).
