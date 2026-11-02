# Security policy

## Supported versions

Only the [latest release](https://github.com/mazillka/deckyhub-plugin/releases/latest) receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue:

1. Go to the [Security tab](https://github.com/mazillka/deckyhub-plugin/security/advisories/new) of this repository.
2. Choose **Report a vulnerability** and describe the problem, the affected version, and steps to reproduce it.

You can expect an initial response within a few days. Once a fix is released, the report can be published as a security advisory with credit to you, if you want it.

## How releases are checked

- **Virus scan:** every release ZIP is scanned with [ClamAV](https://www.clamav.net/) and that day's signatures before it's published (`.github/workflows/release.yml`). The scan never holds a release back: its result (no threats, what ClamAV flagged, or that it couldn't scan) is stated in the release notes, and the scan report is attached to each release as `ClamAV-scan-vX.Y.Z.txt`, and DeckyHub's update window shows it too.
- **Code analysis:** GitHub [CodeQL](https://github.com/mazillka/deckyhub-plugin/actions/workflows/codeql.yml) checks the Python and TypeScript code on every push and pull request, and weekly (`.github/workflows/codeql.yml`).
- **Listed plugins:** DeckyHub's registry scans every plugin ZIP it offers with ClamAV every few hours and publishes one report per ZIP, so every listed plugin has one (a failed scan is a report too, with the reason). A plugin's Manage window shows it, and you decide whether to install. A clean scan isn't proof of safety.

## Scope

DeckyHub only downloads release assets from GitHub and hands them to Decky Loader's installer. Issues in third-party plugins listed in its registry, in Decky Loader itself, or in GitHub should be reported to their respective maintainers. The policy DeckyHub follows for downloads and tokens is in [CONTRIBUTING.md](CONTRIBUTING.md#security-boundaries).
