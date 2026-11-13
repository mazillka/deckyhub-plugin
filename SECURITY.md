# Security policy

## Supported versions

Only the [latest release](https://github.com/mazillka/deckyhub-plugin/releases/latest) receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue:

1. Go to the [Security tab](https://github.com/mazillka/deckyhub-plugin/security/advisories/new) of this repository.
2. Choose **Report a vulnerability** and describe the problem, the affected version, and steps to reproduce it.

You can expect an initial response within a few days. Once a fix is released, the report can be published as a security advisory with credit to you, if you want it.

## How releases are checked

- **Virus scan:** every release ZIP is scanned with [ClamAV](https://www.clamav.net/) and that day's signatures before it's published (`.github/workflows/scan.yml`, called by `release.yml`). The scan never holds a release back: its result (no threats, what ClamAV flagged, or that it couldn't scan) is stated in the release notes, and the scan report is attached to each release as `ClamAV-scan-vX.Y.Z.txt`, and DeckyHub's update window shows it too.
- **VirusTotal:** DeckyHub's own release ZIP (only DeckyHub's, not the plugins it lists) is also uploaded to [VirusTotal](https://www.virustotal.com/) and checked by its 70+ antivirus engines before it's published. That doesn't hold a release back either: the release notes say how many engines flagged it and link to the full VirusTotal report.
- **MetaDefender:** the same ZIP also goes to [OPSWAT MetaDefender Cloud](https://metadefender.opswat.com/) and its 20+ engines, the same way: the notes give its verdict and report link. The README and the website show the latest stable release's VirusTotal and MetaDefender results as badges.
- **Desktop Mode installer:** `install-deckyhub.sh`, the script that runs as root when you use the Desktop Mode installer, goes through the same three checks (ClamAV, VirusTotal, MetaDefender) before each release is published, together with its small `.desktop` launcher for ClamAV. It's pinned to its release's version and checksum, so it only installs that release's ZIP. It collects, saves and sends no information; its only requests go to GitHub.
- **Code analysis:** GitHub [CodeQL](https://github.com/mazillka/deckyhub-plugin/actions/workflows/codeql.yml) checks the Python and TypeScript code on every push and pull request, and weekly (`.github/workflows/codeql.yml`).
- **Listed plugins:** DeckyHub's registry scans every plugin ZIP it offers with ClamAV, and the files inside it with YARA and YARA Forge's core rules, every few hours and publishes one report per ZIP, so every listed plugin has one (a failed scan is a report too, with the reason). A plugin's Manage window shows it, with a VirusTotal button that looks the ZIP up by its SHA-256 without uploading it, and you decide whether to install. A clean scan isn't proof of safety.

## Remote Install

Remote Install is off until you turn on **Remote access**. It listens on the local network only, over QUIC/WebTransport with a self-made certificate that browsers accept only by its fingerprint, and a browser must be paired with a one-time code or link and approved on the device. A request can only name a registry plugin and release, or an installed plugin to uninstall; it can't send a file, a URL or a command. Every request is approved on the device, except for a paired browser you mark **Trusted** in the Quick Access tab: that can only be switched on from the device, after a warning, and it can be switched off or the browser removed at any time. A paired browser unused for 30 days is forgotten. Paired devices and the certificate are stored in `remote-install.json` in DeckyHub's settings folder (owner-only). Report a weakness privately, as described above.

## Scope

DeckyHub only downloads release assets from GitHub and hands them to Decky Loader's installer. Issues in third-party plugins listed in its registry, in Decky Loader itself, or in GitHub should be reported to their respective maintainers. The policy DeckyHub follows for downloads and tokens is in [CONTRIBUTING.md](CONTRIBUTING.md#security-boundaries).
