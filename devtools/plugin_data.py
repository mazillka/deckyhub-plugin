"""What the pages are built from: the registry's published data, its download counts, and the paired-devices info file."""

import json
import sys
import urllib.request

from scan_format import external_results, scan_kind

REGISTRY_RAW = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/"


STATS_URL = REGISTRY_RAW + "release-index/stats.json"


RELEASES_URL = REGISTRY_RAW + "release-index/releases.json"


SCANS_URL = REGISTRY_RAW + "virus-scans/plugins.json"


METADEFENDER_URL = REGISTRY_RAW + "metadefender-reports/reports.json"


VIRUSTOTAL_URL = REGISTRY_RAW + "virustotal-reports/reports.json"


# What the audit's warnings are called and mean (id: (label, hint)); the app and the installer say the same.
WARNINGS = {
    "blocked": ("Blocked by audit", "The audit found malware or a broken archive. Not recommended for installation."),
    "private-data": (
        "Reads private data",
        "Its code reads Steam login data, SSH keys or secrets from the environment.",
    ),
    "persistence": (
        "Changes system startup",
        "It edits shell profiles, preloads libraries, loads kernel modules or adds device rules, which keep working outside Decky.",
    ),
    "not-in-source": (
        "Very high risk: Download includes code that is not in GitHub",
        "The downloaded release contains code the audit could not match to the published source. This could hide malicious changes. Review the release before installing; a mismatch does not prove malware.",
    ),
    "obfuscated": ("Hidden code", "It contains encoded or packed code that's hard to read."),
    "no-tls-check": (
        "Skips HTTPS checks",
        "It turns off certificate checks, so what it downloads could be tampered with.",
    ),
    "runs-downloads": ("Runs downloaded scripts", "It downloads a script and runs it straight away."),
    "vulnerable": ("Known vulnerabilities", "It bundles libraries with published security flaws."),
}


def fetch(url: str) -> str | None:
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "deckyhub-site"}), timeout=60
        ) as response:
            return response.read().decode("utf-8")
    except Exception as error:  # noqa: BLE001 - the pages go out without that data
        print(f"warning: {url}: {error}", file=sys.stderr)
        return None


def fetch_json(url: str, key: str) -> dict:
    text = fetch(url)
    try:
        return (json.loads(text).get(key) or {}) if text else {}
    except (ValueError, AttributeError):
        return {}


MAX_SAFE_COUNT = 2**53 - 1


def valid_count(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= MAX_SAFE_COUNT


def store_activity(stats: dict) -> int | None:
    """New counters require both valid lists; fall back to the legacy store download count."""
    store = stats.get("store") or {}
    activity = store.get("activity") or {}
    downloads, updates = activity.get("downloads"), activity.get("updates")
    if valid_count(downloads) and valid_count(updates) and valid_count(downloads + updates):
        return downloads + updates
    legacy = store.get("downloads")
    return legacy if valid_count(legacy) else None


def total_downloads(stats: dict) -> int | None:
    """Approximate GitHub + store downloads/updates; repeat activity is not a unique-install count."""
    github = stats.get("downloads")
    github = github if valid_count(github) else None
    store = store_activity(stats)
    if github is None and store is None:
        return None
    total = (github or 0) + (store or 0)
    return total if valid_count(total) else None


def load_data() -> dict:
    """What the pages are built from: stats, scans, MetaDefender reports and the audit warnings' labels."""
    return {
        "stats": fetch_json(STATS_URL, "plugins"),
        "scans": fetch_json(SCANS_URL, "plugins"),
        "reports": fetch_json(METADEFENDER_URL, "reports"),
        "vt": fetch_json(VIRUSTOTAL_URL, "reports"),
        "releases": fetch_json(RELEASES_URL, "releases"),
        "warnings": WARNINGS,
    }


def plugin_info(apps: list[dict], data: dict) -> dict:
    """What the Paired devices page shows for each installed plugin it can match to the registry: one compact record
    per repository (lowercase owner/name) with its numbers, badges and virus scan, plus the audit warnings' labels."""
    stats, scans, reports, vt = data["stats"], data["scans"], data["reports"], data.get("vt")
    plugins = {}
    for app in apps:
        key = app["repo"].casefold()
        stat, scan = stats.get(key) or {}, scans.get(key) or {}
        record: dict = {"id": app["id"], "name": app["name"]}
        for field in ("downloads", "stars", "updated", "root", "fork"):
            if stat.get(field) not in (None, False, ""):
                record[field] = stat[field]
        store = stat.get("store") or {}
        if valid_count(store.get("downloads")):
            record["storeDownloads"] = store["downloads"]
        activity = store.get("activity") or {}
        if valid_count(activity.get("downloads")) and valid_count(activity.get("updates")):
            record["storeActivity"] = {"downloads": activity["downloads"], "updates": activity["updates"]}
        if stat.get("ai"):
            record["ai"] = True
        if stat.get("rust"):
            record["rust"] = True
        for field in ("warnings", "prereleaseWarnings"):
            if stat.get(field):
                record[field] = list(stat[field])
        stable = next(
            (item for item in (data.get("releases") or {}).get(key) or [] if not item.get("prerelease")), None
        )
        if stable and stable.get("tag_name"):
            record["latest"] = stable["tag_name"]
        for channel_name in ("stable", "prerelease"):
            channel = scan.get(channel_name)
            if channel and channel.get("clamav"):
                found = {
                    "tag": channel.get("tag", ""),
                    "kind": scan_kind(channel, reports, vt),
                    "prerelease": channel_name == "prerelease",
                }
                for name, item in (("clamav", channel.get("clamav")), ("yara", channel.get("yara"))):
                    if item:
                        found[name] = item.get("result")
                for name, flagged, total in external_results(channel, reports, vt):
                    found["virusTotal" if name == "VirusTotal" else "metaDefender"] = [flagged, total]
                record["scan"] = found
                break
        plugins[key] = record
    return {"warnings": {code: list(pair) for code, pair in data["warnings"].items()}, "plugins": plugins}
