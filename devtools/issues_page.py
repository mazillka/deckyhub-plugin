"""The Known issues page: plugins with audit warnings, scan findings or a version that differs from the source."""

import re
from html import escape

from catalog_pages import by_downloads
from page_shell import SITE, PageSpec, json_ld, page
from plugin_data import WARNINGS
from scan_format import SCAN_LABELS, scan_state, source_mismatch


def prerelease_only(releases: list) -> bool:
    """True when the release index lists releases for a plugin and none of them is stable, as the app's hydrate() decides."""
    listed = [item for item in releases if isinstance(item, dict) and not item.get("draft")]
    return bool(listed) and all(item.get("prerelease") for item in listed)


def version_number(text: str) -> str:
    """The version in a tag or version string, as the app's displayVersion() reads it: "Release-0.7.6" -> "0.7.6"."""
    match = re.search(r"(\d+(?:\.\d+)+)(-[0-9A-Za-z.-]+)?", text)
    return match.group(0) if match else text.strip().removeprefix("v").removeprefix("V")


def version_mismatch(releases: list) -> tuple[str, str] | None:
    """(tag, ZIP version) when the newest stable release's tag and the version its ZIP installs as
    (pluginVersion, which the registry's release index reads from the ZIP) differ."""
    release = next(
        (item for item in releases if isinstance(item, dict) and not item.get("draft") and not item.get("prerelease")),
        None,
    )
    tag, inside = (release or {}).get("tag_name"), (release or {}).get("pluginVersion")
    if isinstance(tag, str) and isinstance(inside, str) and inside and version_number(tag) != version_number(inside):
        return tag, inside
    return None


def issues_page(shell: dict[str, str], apps: list[dict], data: dict) -> str:
    """plugins/known-issues.html: every plugin with a scan finding or an audit warning, grouped by issue."""
    groups: dict[str, list[str]] = {}
    listed: set[str] = set()
    for app in by_downloads(apps, data):
        key = app["repo"].casefold()
        stats, scans = data["stats"].get(key) or {}, data["scans"].get(key) or {}

        # The note goes inside the card's link: text after it would spill under the next card.
        def add(group: str, note: str = "") -> None:
            items = groups.setdefault(group, [])
            if note == "Pre-release only" and any(f'/{app["id"]}.html"' in item for item in items):
                return  # the stable release already has it
            items.append(
                f'<a href="/plugins/{escape(app["id"])}.html">{escape(app["name"])}'
                + (f"<small>{escape(note)}</small>" if note else "")
                + "</a>"
            )
            listed.add(app["id"])

        for channel, note, warning_key in (
            (scans.get("stable"), "", "warnings"),
            (scans.get("prerelease"), "Pre-release only", "prereleaseWarnings"),
        ):
            if source_mismatch(channel or {}) and "not-in-source" not in (stats.get(warning_key) or []):
                add("not-in-source", note)
            if (
                channel
                and channel.get("clamav")
                and (kind := scan_state(channel, data.get("reports"), data.get("vt"))) != "clean"
            ):
                add(kind, note)
        stable = stats.get("warnings") or []
        for warning in [*stable, *(w for w in stats.get("prereleaseWarnings") or [] if w not in stable)]:
            add(warning, "" if warning in stable else "Pre-release only")
        if mismatch := version_mismatch((data.get("releases") or {}).get(key) or []):
            add("version-mismatch", f"Tagged {mismatch[0]}, its ZIP says {mismatch[1]}")
    issues = [
        (
            kind,
            *SCAN_LABELS[kind],
            "A virus scanner (ClamAV, YARA, VirusTotal or MetaDefender) flagged its ZIP."
            if kind == "infected"
            else "Not every scanner could finish on its ZIP.",
        )
        for kind in ("infected", "partial")
    ]
    issues += [(key, label, "stale" if key == "blocked" else "warn", hint) for key, (label, hint) in WARNINGS.items()]
    issues.append(
        (
            "version-mismatch",
            "Version mismatch",
            "warn",
            "Its newest release is tagged with one version, but the plugin in its ZIP reports another, so an update check that reads the tag can offer the same update again after you install it.",
        )
    )
    sections = "".join(
        f'<h2 id="{key}"><span class="badge {css}">{escape(label)}</span> {len(groups[key])}</h2><p>{escape(hint)}</p><ul class="list">'
        + "".join(f"<li>{item}</li>" for item in groups[key])
        + "</ul>"
        for key, label, css, hint in issues
        if groups.get(key)
    )
    flagged = len(listed)
    body = f"""<p class="crumbs"><a href="/">DeckyHub</a> › <a href="/plugins/">Plugins</a> › Known issues</p>
<h1>Known plugin issues</h1>
<p class="lead">{flagged} of {len(apps)} Decky Loader plugins have a virus scan finding, a warning from <a href="https://decky-extended-plugins.beallio.com/audit">Decky Extended Plugins' audit</a> or a version mismatch. DeckyHub shows the scan and audit notes in the app before you install; they inform and never block.</p>
<p class="note">A warning isn't proof a plugin is harmful, and no warning isn't proof it's safe. Open a plugin's page for its scans, and check its repository before installing. Updated daily.</p>
{sections or "<p>No known issues right now.</p>"}"""
    trail = json_ld(
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "DeckyHub", "item": SITE},
                {"@type": "ListItem", "position": 2, "name": "Plugins", "item": f"{SITE}plugins/"},
                {"@type": "ListItem", "position": 3, "name": "Known issues"},
            ],
        }
    )
    title = "Known Decky plugin issues and warnings | DeckyHub"
    summary = f"{flagged} Decky Loader plugins with virus scan findings or audit warnings, such as code not in its repo or reading private data. Check before you install."
    return page(shell, PageSpec(title, summary, "plugins/known-issues.html", body, [trail]))
