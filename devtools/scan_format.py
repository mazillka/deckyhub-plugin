"""What each virus scanner said about a release, as one verdict, and the security scans section of a plugin page."""

import re
import time
from html import escape

from page_text import nice_date

SCAN_LABELS = {
    "clean": ("Nothing flagged", "clean"),
    "infected": ("Threat found", "stale"),
    "partial": ("Not fully scanned", "warn"),
}


SCAN_RESULTS = {
    "clean": "no threats found",
    "infected": "threat found",
    "incomplete": "only partly scanned",
    "error": "couldn't be scanned",
}


# What a VirusTotal or MetaDefender report says before it has a result; the app says the same.
EXTERNAL_STATUS = {
    "pending": "Scan pending",
    "waiting": "Scan pending",
    "error": "Couldn't be scanned",
    "unsupported": "Too large for VirusTotal",
}


def source_mismatch(channel: dict) -> bool:
    """Whether this channel's exact release scan record has valid independent source findings."""
    sha = channel.get("sha256") or ""
    if not re.fullmatch(r"[0-9a-fA-F]{64}", sha) or not channel.get("tag") or not channel.get("file"):
        return False
    audit = channel.get("audit") or {}
    source = audit.get("source") if isinstance(audit, dict) else None
    if not isinstance(source, dict) or source.get("result") not in ("complete", "incomplete", "error"):
        return False
    findings = source.get("findings")
    return isinstance(findings, list) and any(
        isinstance(finding, dict)
        and finding.get("rule") in ("source_path_missing", "source_file_differs")
        and isinstance(finding.get("path"), str)
        and 0 < len(finding["path"]) <= 1024
        for finding in findings
    )


def vt_result(vt_reports: dict | None, sha: str) -> tuple[int, int] | None:
    """(flagged, total) from VirusTotal's finished report on this SHA-256, as the app counts it."""
    vt = (vt_reports or {}).get(sha.lower()) or {}
    counts = [(vt.get("stats") or {}).get(key) for key in ("malicious", "suspicious", "harmless", "undetected")]
    if vt.get("state") == "complete" and all(isinstance(n, int) and n >= 0 for n in counts) and sum(counts):
        return counts[0] + counts[1], sum(counts)
    return None


def md_result(reports: dict | None, sha: str) -> tuple[int, int] | None:
    """(flagged, total) from MetaDefender's finished report on this SHA-256."""
    report = (reports or {}).get(sha.lower()) or {}
    flagged, total = report.get("flagged"), report.get("total")
    if (
        report.get("state") == "complete"
        and isinstance(flagged, int)
        and isinstance(total, int)
        and 0 <= flagged <= total
        and total
    ):
        return flagged, total
    return None


def external_results(channel: dict, reports: dict | None, vt_reports: dict | None) -> list[tuple[str, int, int]]:
    sha = channel.get("sha256") or ""
    return [
        (name, *result)
        for name, result in (("VirusTotal", vt_result(vt_reports, sha)), ("MetaDefender", md_result(reports, sha)))
        if result
    ]


SCANNERS = 4  # ClamAV, YARA, VirusTotal and MetaDefender


def scan_results(channel: dict, reports: dict | None = None, vt_reports: dict | None = None) -> list[str]:
    """What each scanner that has reported said about the ZIP: clean, infected, incomplete or error."""
    results = [scan["result"] for scan in (channel.get("clamav"), channel.get("yara")) if scan]
    return results + [
        "infected" if flagged else "clean" for _, flagged, _ in external_results(channel, reports, vt_reports)
    ]


def scan_state(channel: dict, reports: dict | None = None, vt_reports: dict | None = None) -> str:
    """What the scanners that reported said: infected if any flagged it, partial if one couldn't finish, else clean,
    however many have reported. The Known issues page lists these problems; a scan still waiting on VirusTotal or
    MetaDefender is not one."""
    results = scan_results(channel, reports, vt_reports)
    if "infected" in results:
        return "infected"
    return "partial" if any(result != "clean" for result in results) else "clean"


def scan_kind(channel: dict, reports: dict | None = None, vt_reports: dict | None = None) -> str:
    """The badge: infected if any scanner flagged it; clean only once all four have reported and found nothing. Two
    clean reports out of four say less than "Nothing flagged" sounds like, so a release still waiting on VirusTotal
    or MetaDefender is partial."""
    state = scan_state(channel, reports, vt_reports)
    if state != "clean":
        return state
    return "clean" if len(scan_results(channel, reports, vt_reports)) >= SCANNERS else "partial"


def security_scans(scans: dict, reports: dict, vt_reports: dict | None = None) -> str:
    """One table per scanned ZIP (the stable release's, and a pre-release's if it's another file):
    ClamAV and YARA from the registry's own scans, VirusTotal and MetaDefender from the reports
    the registry publishes (it uploads ZIPs they haven't seen yet)."""

    def when(scan: dict) -> str:
        return nice_date(scan["scannedAt"]) if scan.get("scannedAt") else "date unknown"

    tables, seen = [], set()
    for channel, prefix in ((scans.get("stable"), "Stable release"), (scans.get("prerelease"), "Pre-release")):
        if not channel or not channel.get("clamav") or (channel.get("sha256") and channel.get("sha256") in seen):
            continue
        sha = channel.get("sha256") or ""
        valid = bool(re.fullmatch(r"[0-9a-fA-F]{64}", sha))
        seen.add(sha)
        rows = []
        for name, scan in (("ClamAV", channel.get("clamav")), ("YARA", channel.get("yara"))):
            if not scan:
                rows.append(f"<tr><td>{name}</td><td>Not scanned yet</td><td></td></tr>")
                continue
            result = SCAN_RESULTS.get(scan["result"], scan["result"]) + (
                f" ({', '.join(scan['found'])})" if scan.get("found") else ""
            )
            rows.append(
                f"<tr><td>{name}</td><td>{escape(result[:1].upper() + result[1:])}</td><td>{escape(when(scan))}</td></tr>"
            )
        if valid:
            vt_link = f'<a href="https://www.virustotal.com/gui/file/{sha.lower()}">report</a>'
            vt = (vt_reports or {}).get(sha.lower()) or {}
            if found := vt_result(vt_reports, sha):
                scanned = (
                    nice_date(time.strftime("%Y-%m-%d", time.gmtime(vt["scannedAt"])))
                    if isinstance(vt.get("scannedAt"), int)
                    else ""
                )
                rows.append(
                    f"<tr><td>VirusTotal</td><td>{found[0]} of {found[1]} engines flagged this file ({vt_link})</td><td>{escape(scanned)}</td></tr>"
                )
            else:
                status = EXTERNAL_STATUS.get(vt.get("state"), "No report yet")
                # No link: until VirusTotal has a result its page for this file is empty, pending or not.
                rows.append(f"<tr><td>VirusTotal</td><td>{status}</td><td></td></tr>")
            report = (reports or {}).get(sha.lower()) or {}
            if md_result(reports, sha):
                data_id = report.get("dataId")
                link = (
                    f' (<a href="https://metadefender.opswat.com/results/file/{escape(data_id)}/regular/overview">report</a>)'
                    if isinstance(data_id, str) and re.fullmatch(r"[A-Za-z0-9_-]+", data_id)
                    else ""
                )
                rows.append(
                    f"<tr><td>MetaDefender</td><td>{report['flagged']} of {report['total']} engines flagged this file{link}</td><td></td></tr>"
                )
            else:
                status = EXTERNAL_STATUS.get(report.get("state"), "No report yet")
                rows.append(f"<tr><td>MetaDefender</td><td>{status}</td><td></td></tr>")
        detail = (
            f"{escape(prefix)}: <code>{escape(channel.get('file', ''))}</code> ({escape(channel.get('tag', ''))})"
            + (f"<br><small>SHA-256 <code>{sha.lower()}</code></small>" if valid else "")
        )
        tables.append(
            f'<table class="scans"><caption>{detail}</caption><thead><tr><th>Scanner</th><th>Result</th><th>Scanned</th></tr></thead><tbody>{"".join(rows)}</tbody></table>'
        )
    if not tables:
        return "<p>Not scanned yet. The registry scans every ZIP it offers a few times a day, so a new release shows up here soon.</p>"
    return "".join(tables)
