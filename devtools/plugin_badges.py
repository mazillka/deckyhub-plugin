"""Badges and card flags for a plugin: root, fork, AI, Rust, audit warnings and the scan's verdict."""

import re
from html import escape

from page_text import compact
from plugin_data import store_activity, valid_count
from scan_format import SCAN_LABELS, SCAN_RESULTS, external_results, scan_kind, source_mismatch

NOT_REVIEWED = "DeckyHub is not the Decky store and nobody reviews these plugins, DeckyHub included. A clean scan only means no known malware was found."


def badges_of(
    stats: dict, scans: dict, warnings: dict, reports: dict | None = None, vt_reports: dict | None = None
) -> list[str]:
    items = []
    if stats.get("root"):
        items.append(
            '<li><span class="badge root">Runs as root</span> Its plugin.json asks Decky Loader to run its backend as root, with full access to the device. Many plugins need that for real reasons; install it only if you trust the author.</li>'
        )
    if stats.get("fork"):
        items.append(
            f'<li><span class="badge fork">Fork</span> A fork of <a href="https://github.com/{escape(stats["fork"])}">{escape(stats["fork"].split("/")[1])}</a> by <a href="https://github.com/{escape(stats["fork"].split("/")[0])}">{escape(stats["fork"].split("/")[0])}</a>: its code started as a copy of that project.</li>'
        )
    if stats.get("store") and store_activity(stats) is not None:
        activity = (stats.get("store") or {}).get("activity") or {}
        has_activity = valid_count(activity.get("downloads")) and valid_count(activity.get("updates"))
        metric = "downloads + updates" if has_activity else "downloads"
        items.append(
            f'<li><span class="badge store">In Decky store</span> The <a href="https://plugins.deckbrew.xyz/plugins">Decky store</a> lists a plugin with this name ({compact(store_activity(stats))} {metric}). The store matches by name, so check that it is this repository. These counts include repeat activity and are not unique installs. The store is where Decky installs it from; DeckyHub installs from GitHub.</li>'
        )
    if stats.get("rust"):
        items.append(
            '<li><span class="badge rust">Rust</span> Its repository has Rust code, so part of the plugin is written in Rust. That says nothing about its quality or safety.</li>'
        )
    if stats.get("ai"):
        items.append(
            f"<li><span class=\"badge ai\">AI</span> Its repository has instructions for AI coding assistants, or its README says it's made with AI ({escape(', '.join(stats['ai']))}), so it's likely developed with AI help. That says nothing about its quality or safety.</li>"
        )
    for key, prefix in [
        *((key, "") for key in stats.get("warnings") or []),
        *(
            (key, "Pre-release: ")
            for key in stats.get("prereleaseWarnings") or []
            if key not in (stats.get("warnings") or [])
        ),
    ]:
        if key in warnings:
            label, hint = warnings[key]
            items.append(
                f'<li><span class="badge {"stale" if key in ("blocked", "not-in-source") else "warn"}">{escape(prefix + label)}</span> {escape(hint)} (from <a href="https://decky-extended-plugins.beallio.com/audit">Decky Extended Plugins\' audit</a>)</li>'
            )
    for channel, channel_name, prefix in (
        (scans.get("stable"), "Stable", ""),
        (scans.get("prerelease"), "Pre-release", "Pre-release: "),
    ):
        if not channel:
            continue
        mismatch = source_mismatch(channel)
        channel_warning_key = "warnings" if channel_name == "Stable" else "prereleaseWarnings"
        already_warned = "not-in-source" in (stats.get(channel_warning_key) or [])
        if mismatch and not already_warned:
            label, hint = warnings.get(
                "not-in-source",
                (
                    "Very high risk: Download includes code that is not in GitHub",
                    "The release contains code the audit could not match to the repository. This can hide malicious changes; review the release and source before installing. An automated mismatch does not prove malware.",
                ),
            )
            release_identity = f"{channel_name} ZIP {channel['file']} ({channel['tag']})"
            items.append(
                f'<li><span class="badge stale">{escape(prefix + label)}</span> {escape(hint)} Applies to {escape(release_identity)}.</li>'
            )
        if not channel.get("clamav"):
            continue
        kind = scan_kind(channel, reports, vt_reports)
        if prefix and (scans.get("stable") or {}).get("clamav") and kind == "clean":
            continue
        label, css = SCAN_LABELS[kind]
        results = "; ".join(
            f"{name}: {SCAN_RESULTS.get(scan['result'], scan['result'])}"
            + (f" ({', '.join(scan['found'])})" if scan.get("found") else "")
            for name, scan in (("ClamAV", channel.get("clamav")), ("YARA", channel.get("yara")))
            if scan
        )
        results += "".join(
            f"; {name}: {flagged} of {total} engines flagged it"
            for name, flagged, total in external_results(channel, reports, vt_reports)
        )
        items.append(
            f'<li><span class="badge {css}">{escape(prefix + label)}</span> Virus scan of <code>{escape(channel.get("file", ""))}</code> ({escape(channel.get("tag", ""))}): {escape(results)}. A clean scan isn\'t proof of safety.</li>'
        )
    return items


BADGE_LABEL = re.compile(r'<span class="badge ([a-z ]+)">([^<]+)</span>')


def safety_chips(badges: list[str]) -> str:
    """The labels of the safety list as coloured chips, the short answer before the explanations."""
    chips = [
        f'<li class="chip {match.group(1)}">{match.group(2)}</li>'
        for item in badges
        if (match := BADGE_LABEL.search(item))
    ]
    return (
        f'<ul class="chips-row">{"".join(chips)}</ul>'
        if chips
        else '<p class="chips-row"><span class="chip clean">No known issues</span></p>'
    )


def flags_of(
    stats: dict, scans: dict, reports: dict | None = None, vt_reports: dict | None = None, store_only: bool = False
) -> str:
    """Small markers on a card: AI help, root, audit warnings, and the virus scan's verdict. A store-only plugin gets just In Decky store."""
    flags = []
    if store_only:
        return '<span class="flag-store">In Decky store</span>' if stats.get("store") else ""
    if stats.get("ai"):
        flags.append('<span class="flag-ai">✦ AI</span>')
    if stats.get("rust"):
        flags.append('<span class="flag-rust">Rust</span>')
    if stats.get("store"):
        flags.append('<span class="flag-store">In Decky store</span>')
    if stats.get("root"):
        flags.append('<span class="flag-warn">⚠ Root</span>')
    channels = (scans.get("stable"), scans.get("prerelease"))
    source_mismatch_found = any(channel and source_mismatch(channel) for channel in channels)
    if (
        source_mismatch_found
        or "not-in-source" in (stats.get("warnings") or [])
        or "not-in-source" in (stats.get("prereleaseWarnings") or [])
    ):
        flags.append('<span class="flag-bad">⚠ Very high risk</span>')
    elif stats.get("warnings") or stats.get("prereleaseWarnings"):
        flags.append('<span class="flag-warn">⚠ Warning</span>')
    channel = scans.get("stable") or {}
    if channel.get("clamav"):
        kind = scan_kind(channel, reports, vt_reports)
        flags.append(
            {
                "clean": '<span class="flag-ok">✓ Scanned</span>',
                "infected": '<span class="flag-bad">✖ Threat found</span>',
                "partial": '<span class="flag-warn">⚠ Not fully scanned</span>',
            }[kind]
        )
    return "".join(flags)
