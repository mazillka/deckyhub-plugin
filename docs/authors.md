<!-- A copy of deckyhub.com/authors.html, made by devtools/html_to_md.py: edit the page, not this file. -->

# DeckyHub for plugin authors

From idea to a listed plugin. Adding one is on the [Contribute](https://deckyhub.com/contribute/) page; what the badges mean is on [Help](https://deckyhub.com/help.html#safety).

- [1. Plan](#1-plan)
- [2. Build](#2-build)
- [3. Avoid what the audit flags](#3-avoid-what-the-audit-flags)
- [4. Test](#4-test)
- [5. Release](#5-release)
- [6. List](#6-list)
- [7. After you ship](#7-after-you-ship)
- [Checklist before you tag a release](#checklist-before-you-tag-a-release)

This is the life of a Decky plugin as DeckyHub sees it: what to do at each stage so your plugin lists cleanly, installs safely and shows no avoidable warnings. DeckyHub lists and installs plugins from their authors' GitHub releases. It does not host, review or vouch for them.

## 1. Plan

- Pick a **unique plugin name**. DeckyHub recognises an installed plugin by the `name` in its `plugin.json`, and two installed plugins with the same name cannot be told apart (installs and updates are then disabled for both).
- Decide where you distribute: GitHub releases (DeckyHub installs from them), the Decky store, or both. A plugin that is also in the Decky store is fine to list.
- Write one sentence on what it does. A plugin without a description gets a **No description** badge.

## 2. Build

Start from the [Decky plugin template](https://github.com/SteamDeckHomebrew/decky-plugin-template), then:

- **`plugin.json`:** a real `name` (exactly what you will list), an `author`, and a `publish` block (tags, description, image) if you use the Decky store.
- **`package.json`:** set `repository` to **your own repository** (`https://github.com/owner/name`) and `version` to the release version. The template's repository in this field says nothing about your plugin, so DeckyHub ignores it. A missing or different repository means DeckyHub cannot verify which project an installed copy is, and it disables installs and updates for it ("Installed plugin identity could not be verified").
- Keep the source readable and ship the code that is in the repository: scripts or programs that are only in the release get the **Code not in its repo** warning.
- Prefer current dependencies. Bundled libraries with published flaws get **Known vulnerabilities**.

## 3. Avoid what the audit flags

DeckyHub's audit reads each release ZIP and shows these warnings. They are information, not a verdict, but each makes people think twice:

| Warning | Triggered by |
| --- | --- |
| Runs as root | the plugin asks for root in its plugin.json flags |
| Reads private data | Steam login data, SSH keys or secrets from the environment |
| Changes system startup | shell profiles, preloaded libraries, kernel modules, device rules |
| Code not in its repo | scripts or programs in the release that are not in its GitHub source |
| Hidden code | encoded or packed code that is hard to read |
| Skips HTTPS checks | turns off certificate verification |
| Runs downloaded scripts | downloads a script and runs it at once |
| Known vulnerabilities | bundled libraries with published security flaws |
| Blocked by audit | malware found, or a broken archive |

If your plugin really needs one of them, say why in its README.

## 4. Test

- Install the ZIP the way users will: Decky's Developer settings (install a plugin from a URL), or through DeckyHub. Test on a **real Steam Deck** in Gaming Mode, not only in a desktop browser.
- Update from the previous release to the new one, then uninstall, and check that nothing is left behind.
- Open the plugin's Quick Access panel with the controller only.

## 5. Release

- **One plugin ZIP per release.** DeckyHub picks the release asset by name. If a release has several ZIPs, the registry entry must name a word only the plugin ZIP has (for example `DeckWarden.zip`).
- The **tag matches the version** inside the ZIP (`v1.2.3` and `1.2.3`). A mismatch is flagged so you can fix it.
- Let GitHub publish the asset's **SHA-256 digest**. DeckyHub checks it; without it the install runs unverified and DeckyHub tells people so.
- Use **pre-releases** (`v1.3.0-rc.1`) for testing: people can opt in to them. A plugin that has only pre-releases is shown as **Pre-release only**.
- Release regularly: a plugin with no release in a year gets **No release in a year**.
- Write plain release notes: what people will notice. DeckyHub shows them in the plugin's details.

## 6. List

- **DeckyHub:** open an issue or a pull request in [deckyhub-registry](https://github.com/mazillka/deckyhub-registry), or use the [registry editor](https://deckyhub.com/contribute/editor.html). The entry needs your repository (`owner/name`), the plugin's name as `plugin.json` reports it, a category and the asset filter. The registry's checks confirm the repository, exactly one matching ZIP per channel, and the name.
- **Decky store:** if you distribute there only, set `"store": true` on your entry. DeckyHub still lists it, shows the Decky install steps and offers no GitHub download.

## 7. After you ship

- The registry scans the newest ZIPs (ClamAV and YARA, plus VirusTotal and MetaDefender reports) and keeps results for the three newest stable and three newest pre-release versions of each plugin. A clean scan means no known malware was found, not that the plugin is safe.
- Watch your plugin's page on deckyhub.com and the [Known issues](https://deckyhub.com/plugins/known-issues.html) page: fix the warnings you can, explain the ones you cannot.
- A plugin can be sent to a device from deckyhub.com (Remote Install) only when the registry can verify it, so the identity and release rules above matter there too.
- To leave DeckyHub, or to move to the Decky store, see the registry README ("Taking a plugin off DeckyHub, or sending it to the Decky store").

## Checklist before you tag a release

- ☐ `plugin.json` name is unique and matches the registry entry
- ☐ `package.json` `repository` is your repo and `version` matches the tag
- ☐ one plugin ZIP on the release, and GitHub shows its SHA-256
- ☐ everything the ZIP runs is in the repository
- ☐ no obfuscated code, no disabled certificate checks, no run-a-downloaded-script
- ☐ installed, updated and uninstalled on a real Deck
- ☐ release notes written
