"""Per-plugin pages for deckyhub.com (plugins/<id>.html), written by build-site.py.

Each page has what the catalog knows about a plugin: description, category, downloads,
stars, latest release, badges (runs as root, fork, AI, audit warnings) and its security scans
(ClamAV and YARA from the registry's scans, VirusTotal by SHA-256, MetaDefender's report),
and how to install it. The data is the registry's apps.json, stats.json, virus-scans
plugins.json and metadefender-reports reports.json; whatever can't be fetched is left out.
The page shell (style, navigation, footer) comes from docs/releases.html so every page
looks the same.
"""

import json
import re
import sys
import time
import urllib.request
from html import escape

import remote_page_uk
import site_shell

SITE = "https://deckyhub.com/"
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
        "Code not in its repo",
        "The release ZIP has scripts or programs that aren't in its GitHub source, so you can't read what they do.",
    ),
    "obfuscated": ("Hidden code", "It contains encoded or packed code that's hard to read."),
    "no-tls-check": (
        "Skips HTTPS checks",
        "It turns off certificate checks, so what it downloads could be tampered with.",
    ),
    "runs-downloads": ("Runs downloaded scripts", "It downloads a script and runs it straight away."),
    "vulnerable": ("Known vulnerabilities", "It bundles libraries with published security flaws."),
}

SCAN_LABELS = {
    "clean": ("No threats", "clean"),
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

EXTRA_STYLE = """
.app{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;text-decoration:none;color:var(--text);display:flex;flex-direction:column;gap:2px}
.app:hover{border-color:var(--accent2)}.app small{color:var(--accent2);font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}
.app p{margin:4px 0 0;color:var(--muted);font-size:.9rem;flex:1}.app .meta{color:var(--dim);font-size:.82rem;margin-top:8px}
.app .flags{display:flex;flex-wrap:wrap;gap:4px 8px;font-size:.78rem;margin-top:4px}.flag-ai{color:#b79cff}.flag-warn{color:var(--warn)}.flag-bad{color:#ff8a8a}.flag-ok{color:#6bcb6b}.flag-store{color:#7cc4ff}
.app[hidden]{display:none}
.catalog{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.filters{display:grid;gap:12px;margin:18px 0 8px}.filters input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);font-size:1rem}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chips button{padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--muted);font-size:.9rem;cursor:pointer}
.chips button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.crumbs{color:var(--dim);font-size:.9rem;margin:28px 0 6px}.crumbs a{color:var(--dim)}
.plugin h1{margin-top:0}.plugin h2{font-size:1.25rem;margin:32px 0 10px}
.lead{font-size:1.15rem;color:var(--muted);margin:0 0 18px}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin:0;padding:0;list-style:none}
.facts li{min-width:0;overflow-wrap:anywhere;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;color:var(--muted);font-size:.9rem}.facts li.wide{grid-column:1/-1}.facts strong{display:block;color:var(--text);font-size:1.05rem}
.badges{display:grid;gap:8px;margin:0;padding:0;list-style:none}.badges li{color:var(--muted)}
.badge{padding:1px 8px;border-radius:999px;border:1px solid currentColor;font-size:.8rem;white-space:nowrap;margin-right:6px}.badge.store{color:#7cc4ff}
.root{color:#ffb35c}.stale{color:#ff8a8a}.warn{color:var(--warn)}.fork{color:var(--muted)}.clean{color:#6bcb6b}.ai{color:#c49bff}
.btn{display:inline-block;padding:11px 18px;border-radius:8px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;margin:4px 8px 4px 0}.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--text)}
.list{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;padding:0;list-style:none}
.list a{display:block;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px;text-decoration:none;color:var(--text);height:100%}
.list a:hover{border-color:var(--accent2)}.list small{display:block;color:var(--muted);margin-top:4px}
.note{color:var(--dim);font-size:.9rem}
table.scans{width:100%;border-collapse:collapse;font-size:.92rem;margin:0 0 18px}.scans caption{text-align:left;color:var(--muted);padding:6px 0}.scans th,.scans td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.scans th{color:var(--dim);font-weight:600}
"""


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


def compact(number: int) -> str:
    for size, suffix in ((1_000_000, "M"), (1_000, "K")):
        if number >= size:
            return f"{number / size:.1f}".rstrip("0").rstrip(".") + suffix
    return str(number)


def nice_date(iso: str | None) -> str:
    if not iso:
        return ""
    day = time.strptime(iso[:10], "%Y-%m-%d")
    return time.strftime("%B ", day) + f"{day.tm_mday}, {day.tm_year}"  # %-d isn't portable


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


def scan_kind(channel: dict, reports: dict | None = None, vt_reports: dict | None = None) -> str:
    results = [scan["result"] for scan in (channel.get("clamav"), channel.get("yara")) if scan]
    results += ["infected" if flagged else "clean" for _, flagged, _ in external_results(channel, reports, vt_reports)]
    return (
        "infected" if "infected" in results else "partial" if any(result != "clean" for result in results) else "clean"
    )


def fit(text: str, limit: int) -> str:
    """text cut at a word boundary to at most `limit` characters, with an ellipsis when it was cut."""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:.-") + "…"


def json_ld(data: dict) -> str:
    # No "<" at all inside the script element, so nothing in a name or description can end it.
    return (
        '<script type="application/ld+json">'
        + json.dumps({"@context": "https://schema.org", **data}, ensure_ascii=False, separators=(",", ":")).replace(
            "<", "\\u003c"
        )
        + "</script>"
    )


NOT_REVIEWED = "DeckyHub is not the Decky store and nobody reviews these plugins, DeckyHub included. A clean scan only means no known malware was found."
STORE_ONLY_NOTE = '<p class="note">Its author distributes it through the <a href="https://plugins.deckbrew.xyz/plugins">Decky store</a>. DeckyHub lists it but offers no GitHub download: install it from the store inside Decky.</p>'


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
    if stats.get("store"):
        items.append(
            f'<li><span class="badge store">In Decky store</span> The <a href="https://plugins.deckbrew.xyz/plugins">Decky store</a> lists a plugin with this name ({compact(stats["store"]["downloads"])} downloads there). The store names no repository, so check that it is this one. The store is where Decky installs it from; DeckyHub installs from GitHub. The download count comes from the Decky store.</li>'
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
                f'<li><span class="badge {"stale" if key == "blocked" else "warn"}">{escape(prefix + label)}</span> {escape(hint)} (from <a href="https://decky-extended-plugins.beallio.com/audit">Decky Extended Plugins\' audit</a>)</li>'
            )
    for channel, prefix in ((scans.get("stable"), ""), (scans.get("prerelease"), "Pre-release: ")):
        if not channel or not channel.get("clamav"):
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
                rows.append(f"<tr><td>VirusTotal</td><td>{status} ({vt_link})</td><td></td></tr>")
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


def shell_of(releases_page: str) -> dict[str, str]:
    """The style of docs/releases.html (with the shared menu style filled in) and the shared footer,
    so the plugin pages match the site."""
    style = re.search(r"<style>(.*?)</style>", site_shell.apply(releases_page), re.DOTALL)
    if not style:
        raise SystemExit("docs/releases.html is missing its style")
    return {"style": style.group(1) + EXTRA_STYLE, "footer": site_shell.FOOTER}


def page(
    shell: dict[str, str],
    title: str,
    description: str,
    path: str,
    body: str,
    data: list[str],
    current: str = "plugins",
    lang: str = "en",
    switch: tuple[str, str, str] | None = None,
) -> str:
    url = SITE + path
    uk = lang == "uk"
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title>
<meta name="description" content="{escape(description)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#10151f">
<meta property="og:type" content="website"><meta property="og:site_name" content="DeckyHub">
<meta property="og:url" content="{url}"><meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(description)}">
<meta property="og:image" content="{SITE}img/og.jpg"><meta name="twitter:card" content="summary_large_image">
{"".join(data)}
<style>{shell["style"]}</style>
</head>
<body>
<a class="skip" href="#main">{"До змісту" if uk else "Skip to content"}</a>
{site_shell.nav(current, lang, switch)}
<main id="main"><div class="wrap plugin">
{body}
</div></main>
{site_shell.FOOTER_UK if uk else shell["footer"]}
</body>
</html>
"""


def remote_device_panel(lang: str = "en") -> str:
    # data-state (set by remote-install.js) picks what the page shows: new, connecting, approve, unreachable,
    # unsupported, error or paired; see remote-install.css.
    html = """<section id="remote-install" class="remote-install remote-device-dashboard" aria-labelledby="remote-title" data-plugin-id="" data-state="new" data-has-devices="false">
<link rel="stylesheet" href="/remote-install.css">
<header class="rd-hero">
<p class="rd-badge">Experimental · fully local</p>
<h2 id="remote-title">Manage your devices from this browser</h2>
<p>Install, update and remove Decky plugins without picking up your device. This page talks straight to your device on your network: nothing is collected or sent anywhere. <a href="/help.html#remote">How it works</a></p>
</header>
<div class="rd-layout">
<aside class="rd-devices" aria-labelledby="rd-devices-title">
<div class="rd-devices-head"><h3 id="rd-devices-title">Your devices</h3><button type="button" id="remote-pair-another" class="btn">+ Add device</button></div>
<ul id="remote-device-cards" class="rd-cards" aria-label="Paired devices"></ul>
<p class="rd-empty">No device yet. Press Add device to connect your first one.</p>
<div class="rd-sr"><label for="remote-device-picker">Selected device</label><select id="remote-device-picker" disabled><option value="">Pair a device</option></select></div>
<details class="rd-multi">
<summary>Using more than one device?</summary>
<ul>
<li><strong>Several Decks in one browser:</strong> press <em>Add device</em> and repeat the steps for each Deck. They all stay in the list above.</li>
<li><strong>One Deck in several browsers:</strong> open this page on your phone and on your laptop and pair each of them with the Deck. Every browser is approved separately on the Deck, and you can remove any of them under Paired browsers in DeckyHub.</li>
</ul>
</details>
</aside>
<div class="rd-main">
<p id="remote-status" role="status" aria-live="polite" class="rd-status">Not connected.</p>
<div class="rd-device">
<p class="remote-actions"><button type="button" id="remote-request" disabled hidden>Send install request</button> <button type="button" id="remote-cancel" disabled>Cancel request</button></p>
</div>
<section class="remote-inventory" aria-labelledby="remote-plugins-title">
<div class="rd-inv-head">
<h3 id="remote-plugins-title">Installed plugins</h3>
<p class="remote-actions"><a class="btn" href="/plugins/">Browse plugins to install</a> <button type="button" id="remote-plugins-refresh" disabled>Refresh list</button></p>
</div>
<p id="remote-plugins-status" role="status" aria-live="polite">Pair a device to see its installed plugins.</p>
<details class="remote-pack" id="remote-pack-box">
<summary>Switch a plugin pack on or off</summary>
<p class="rd-hint">Pick a DeckyHub plugin pack file. Its plugins that are installed on your device are switched together, with one approval on the device. Nothing is installed or removed.</p>
<p><input id="remote-pack" type="file" accept=".json,application/json" aria-label="Plugin pack file" disabled></p>
<p id="remote-pack-info" role="status" aria-live="polite"></p>
<p class="remote-actions"><button type="button" id="remote-pack-enable" disabled>Enable pack</button> <button type="button" id="remote-pack-disable" disabled>Disable pack</button></p>
</details>
<p><input id="remote-plugins-filter" type="search" aria-label="Search installed plugins" placeholder="Search installed plugins" autocomplete="off" hidden></p>
<ul id="remote-plugins" class="remote-plugins"></ul>
</section>
</div>
</div>
<dialog id="remote-add-dialog" class="rd-dialog" aria-labelledby="remote-add-title">
<div class="rd-dialog-head"><h3 id="remote-add-title">Add a device</h3><button type="button" id="remote-add-close" class="rd-close" aria-label="Close">×</button></div>
<div class="rd-dialog-body">
<p id="remote-dialog-status" role="status" aria-live="polite" class="rd-status" hidden></p>
<div class="rd-pairing" id="remote-pairing">
<div class="rd-pairing-head">
<p class="rd-wifi"><span aria-hidden="true">⚑</span> Both devices must be on the <strong>same Wi-Fi</strong> (not mobile data, not a guest network).</p>
</div>
<ol class="rd-steps" aria-label="Pairing steps">
<li>
<span class="rd-dot" aria-hidden="true">1</span>
<div><span class="rd-where">On your Steam Deck</span><strong>Turn on Remote access</strong><small>Open DeckyHub in the Quick Access menu and switch on <em>Remote access</em>. A QR code appears.</small></div>
</li>
<li>
<span class="rd-dot" aria-hidden="true">2</span>
<div><span class="rd-where">On this device</span><strong>Scan the QR code</strong><small>Point the camera at the QR code and open the link. No camera? Paste the link below.</small></div>
</li>
<li>
<span class="rd-dot" aria-hidden="true">3</span>
<div><span class="rd-where">On your Steam Deck</span><strong>Press Approve</strong><small>A pairing request appears under <em>Remote control</em>. Press <em>Approve</em>.</small></div>
</li>
</ol>
<ul id="remote-trouble" class="rd-trouble">
<li>Allow local network access when your browser asks. In Chrome: menu, Settings, Site settings, Local network, then set deckyhub.com to Allow.</li>
<li>Check that Remote access is on and that your device is awake: it stops listening when it sleeps.</li>
<li>Use the same Wi-Fi as your device, not mobile data, a guest network or a VPN. Turn off mobile data while you pair.</li>
<li>If your router has "AP isolation" or "client isolation", it stops phones from reaching other devices: turn it off for this network.</li>
<li>Your router may have given the device a new address: open the Quick Access tab to see it, or pair again.</li>
<li>To tell the network from the browser, open https://the-device-address:8765/ in this browser. "Refused to connect" at once means the network is fine; a long wait means this browser can't reach the device.</li>
<li>Still stuck? Try Chrome or Edge on a computer on the same Wi-Fi, and send the details below with your bug report.</li>
</ul>
<details id="remote-diagnostics" class="rd-diagnostics" hidden>
<summary>Technical details for a bug report</summary>
<pre id="remote-diagnostics-text"></pre>
<p><button type="button" id="remote-copy-diagnostics">Copy details</button></p>
</details>
<form id="remote-pair-form" aria-labelledby="remote-pair-title">
<h3 id="remote-pair-title">No camera or QR code? Paste the link</h3>
<p class="rd-hint">Scanning the QR code fills these in and pairs by itself. Use them to paste a link, or to try again.</p>
<p class="rd-link-row"><label for="remote-pairing-link">Pairing link</label><span class="remote-actions"><input id="remote-pairing-link" type="text" autocomplete="off" spellcheck="false" placeholder="Paste the link from DeckyHub"><button type="button" id="remote-copy-link">Copy link</button></span></p>
<p><label for="remote-code">Six-digit pairing code</label><input id="remote-code" autocomplete="off" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required></p>
<details id="remote-manual">
<summary>More options: connection details, device name</summary>
<p><label for="remote-address">Device address and port</label><input id="remote-address" placeholder="192.168.1.50:8765" autocomplete="off"></p>
<p><label for="remote-fingerprint">Certificate fingerprint</label><input id="remote-fingerprint" autocomplete="off" spellcheck="false"></p>
<p><label for="remote-device-name">Device name (optional)</label><input id="remote-device-name" maxlength="64" autocomplete="off" placeholder="Living room Deck"></p>
<p><label for="remote-name">Browser name shown on your device</label><input id="remote-name" value="Browser" maxlength="64"></p>
<p><button type="button" id="remote-reconnect" hidden>Use new device address</button></p>
<p><button type="button" id="remote-forget" hidden>Forget this device in this browser</button></p>
</details>
<button type="submit" id="remote-pair" disabled>Pair browser</button>
</form>
</div>
</div>
</dialog>
<noscript>Enable JavaScript to connect to your device.</noscript>
<script type="module" src="/remote-install.js"></script>
</section>"""
    return remote_page_uk.translate(html) if lang == "uk" else html


def remote_install_picker(plugin_id: str) -> str:
    # data-state (remote-install.js): checking, none (no device to send to), ready, waiting (for approval on the
    # device), installing, done, failed; see remote-install.css.
    return f"""<section id="remote-install" class="remote-install remote-compact" aria-labelledby="remote-send-title" data-plugin-id="{escape(plugin_id, quote=True)}" data-state="checking">
<link rel="stylesheet" href="/remote-install.css">
<div class="rc-head"><h3 id="remote-send-title">Install on your device</h3><span class="rd-badge">Experimental · fully local</span></div>
<div class="remote-actions rc-send">
<select id="remote-device-picker" aria-label="Paired device" disabled><option value="">Select a device</option></select>
<button type="button" id="remote-request" disabled>Send to device</button>
<button type="button" id="remote-cancel" disabled>Cancel</button>
</div>
<p id="remote-status" class="rd-status" role="status" aria-live="polite" hidden></p>
<p class="rc-pair"><a id="remote-pair-new" class="btn" href="/remote-install/">Pair a device</a><span>Pair once, then install from any plugin page.</span></p>
<p class="rd-hint">Your browser talks straight to your device on your network. Nothing is collected or sent anywhere. <a href="/help.html#remote">How to use it</a></p>
<script type="module" src="/remote-install.js"></script>
</section>"""


def paired_devices_page(
    shell: dict[str, str],
    title: str = "Paired devices | DeckyHub",
    description: str = "Pair a device and manage its installed Decky plugins.",
    lang: str = "en",
    path: str = "remote-install/",
) -> str:
    uk = lang == "uk"
    body = f"<h1>{'Сполучені пристрої' if uk else 'Paired devices'}</h1>" + remote_device_panel(lang)
    # The same page in the other language, for the menu's language link and for search engines.
    base = path.removeprefix("uk/")
    other = SITE + (base if uk else "uk/" + base)
    # An installable app (docs/remote-install/manifest.webmanifest, sw.js), scoped to this page.
    app = [
        '<link rel="manifest" href="/remote-install/manifest.webmanifest">',
        '<link rel="apple-touch-icon" href="/icon-192.png">',
        '<meta name="mobile-web-app-capable" content="yes">',
    ]
    app.append(f'<link rel="alternate" hreflang="{"en" if uk else "uk"}" href="{other}">')
    switch = ("English", other, "en") if uk else ("Українська", other, "uk")
    return page(shell, title, description, path, body, app, current="paired-devices", lang=lang, switch=switch)


def plugin_page(
    shell: dict[str, str],
    app: dict,
    stats: dict,
    scans: dict,
    warnings: dict,
    others: list[dict],
    reports: dict | None = None,
    vt_reports: dict | None = None,
    releases: list | None = None,
) -> str:
    name, repo, category, description = app["name"], app["repo"], app["category"], app.get("description") or ""
    repo_url = f"https://github.com/{repo}"
    facts = [f"<li><strong>{escape(category)}</strong>Category</li>"]
    if stats.get("downloads") is not None:
        facts.append(f"<li><strong>{compact(stats['downloads'])}</strong>GitHub downloads</li>")
    if stats.get("store"):
        facts.append(
            f'<li><strong>{compact(stats["store"]["downloads"])}</strong><a href="https://plugins.deckbrew.xyz/plugins">Decky store</a> downloads</li>'
        )
    if stats.get("stars") is not None:
        facts.append(f"<li><strong>{compact(stats['stars'])}</strong>GitHub stars</li>")
    if stats.get("updated"):
        facts.append(f"<li><strong>{nice_date(stats['updated'])}</strong>Latest release</li>")
    badges = badges_of(stats, scans, warnings, reports, vt_reports)
    if prerelease_only(releases or []):
        badges.insert(
            0,
            '<li><span class="badge warn">Pre-release only</span> It has no stable release, so DeckyHub offers its pre-releases, which may be unfinished or buggy.</li>',
        )
    if not description.strip():
        badges.insert(
            0,
            '<li><span class="badge warn">No description</span> Its author hasn\'t said what it does. Check its repository before installing.</li>',
        )
    related = [other for other in others if other["id"] != app["id"]][:6]
    crumbs = f'<p class="crumbs"><a href="/">DeckyHub</a> › <a href="/plugins/">Plugins</a> › {escape(name)}</p>'
    body = f"""{crumbs}
<h1>{escape(name)}</h1>
<p class="lead">{escape(description)}</p>
{STORE_ONLY_NOTE if app.get("store") else ""}<p><a class="btn" href="/#install">Install with DeckyHub</a><a class="btn ghost" href="{escape(repo_url)}">Source on GitHub</a></p>
<ul class="facts">{"".join(facts)}<li class="wide"><strong><a href="{escape(repo_url)}">{escape(repo)}</a></strong>Repository</li></ul>
<h2>Install {escape(name)}</h2>
{"" if app.get("store") else '<p><a class="btn ghost" href="#remote-install">Send to device (experimental)</a></p>'}
<p class="note">Before updating an installed plugin, check that its GitHub owner and repository match the source shown here. Plugin names alone may not identify the correct project.</p>
<p>{escape(name)} is a <a href="https://decky.xyz/">Decky Loader</a> plugin. With <a href="/">DeckyHub</a> installed, open DeckyHub's <strong>Discover</strong> tab in Gaming Mode, search for <strong>{escape(name)}</strong> and press <strong>Install</strong>. DeckyHub hands the release to Decky Loader's own installer and checks its SHA-256 whenever GitHub publishes one. You can also download the ZIP from its <a href="{escape(repo_url)}/releases">releases</a> and install it by hand from Decky's developer settings.</p>
{"" if app.get("store") else remote_install_picker(app["id"])}
{versions_section(releases or [])}
<h2>Safety information</h2>
<p class="note">{NOT_REVIEWED}</p>
{"<ul class='badges'>" + "".join(badges) + "</ul>" if badges else "<p>No badges: it doesn't run as root, and no audit warnings or virus scan findings are known for it.</p>"}
<p class="note">Browsing this plugin on GitHub? The free <a href="https://github.com/mazillka/deckyhub-ext">Deckyhub browser extension</a> shows these badges and scans there.</p>
<h2>Security scans</h2>
<p>Every ZIP DeckyHub offers is scanned with ClamAV and with YARA rules (YARA Forge's core set), and the same scans are shown in the app. The registry also sends each ZIP to VirusTotal and MetaDefender, uploading it if they haven't seen it yet, and their results are matched by the file's SHA-256.</p>
{security_scans(scans, reports or {}, vt_reports)}
<p class="note">DeckyHub doesn't make, review or vouch for {escape(name)}; it installs at your own risk. The scans only catch known malware, and malware can be built to get past them, so a clean scan isn't proof of safety. Only the <a href="https://plugins.deckbrew.xyz/">Decky plugin store</a> reviews plugins by hand. Check its repository before installing.</p>
{f'<h2>More {escape(category)} plugins</h2><ul class="list">' + "".join(f'<li><a href="/plugins/{escape(other["id"])}.html">{escape(other["name"])}<small>{escape(other.get("description") or "")}</small></a></li>' for other in related) + "</ul>" if related else ""}"""
    data = {
        "@type": "SoftwareApplication",
        "name": name,
        "description": description,
        "url": f"{SITE}plugins/{app['id']}.html",
        "applicationCategory": "UtilitiesApplication",
        "applicationSubCategory": f"Decky Loader plugin: {category}",
        "operatingSystem": "SteamOS",
        "sameAs": [repo_url],
        "isAccessibleForFree": True,
    }
    if stats.get("downloads") is not None:
        data["interactionStatistic"] = {
            "@type": "InteractionCounter",
            "interactionType": "https://schema.org/DownloadAction",
            "userInteractionCount": stats["downloads"],
        }
    if stats.get("updated"):
        data["dateModified"] = stats["updated"]
    trail = json_ld(
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "DeckyHub", "item": SITE},
                {"@type": "ListItem", "position": 2, "name": name},
            ],
        }
    )
    # Search results show about 60 characters of a title and 155 of a description.
    title = f"{name}: Decky Loader plugin | DeckyHub"
    if len(title) > 70:
        title = f"{fit(name, 40)} | DeckyHub"
    tail = " A Decky Loader plugin; install it from Gaming Mode with DeckyHub."
    cut = fit(description.rstrip("."), 155 - len(tail))
    summary = (
        cut + ("" if cut.endswith("…") else ".") + tail
        if description
        else f"{name}, a {category} Decky Loader plugin. Install and update it from Gaming Mode with DeckyHub."
    )
    summary = fit(summary, 160)
    return page(shell, title, summary, f"plugins/{app['id']}.html", body, [trail, json_ld(data)])


def inline_markdown(text: str) -> str:
    """**bold**, `code` and [links](url) from the README, as HTML (everything else is text)."""
    text = escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    return re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)\)", lambda match: f'<a href="{escape(match.group(2))}">{match.group(1)}</a>', text
    )


def readme_steps(readme: str, heading: str) -> str:
    """The numbered steps under a README heading as <li> items (inline markdown rendered), so the
    website says what the README says."""
    section = re.split(r"\n#{2,4} ", readme.replace("\r\n", "\n").split(heading, 1)[1], 1)[0]
    steps = re.findall(r"^\d+\. (.+)$", section, re.MULTILINE)

    # A long command stands on its own line, selectable in one tap, instead of getting lost mid-sentence.
    def long_command(html):
        return re.sub(r"<code>([^<]{60,})</code>", r'<code class="cmd">\1</code>', html)

    def render(text):
        return long_command(inline_markdown(text.strip()))

    # Two invisible markers (HTML comments, hidden on GitHub) turn a step into two alternatives side by side:
    # "lead <!-- choose --> first way <!-- or --> second way". The lead is optional.
    def item(step: str) -> str:
        if "<!-- or -->" not in step:
            return render(step)
        lead, _, rest = step.rpartition("<!-- choose -->")
        choices = "".join(f"<div>{render(part)}</div>" for part in rest.split("<!-- or -->"))
        return (f"<p>{render(lead)}</p>" if lead.strip() else "") + f'<div class="choices">{choices}</div>'

    return "\n".join(f"<li>{item(step)}</li>" for step in steps)


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


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


def flags_of(stats: dict, scans: dict, reports: dict | None = None, vt_reports: dict | None = None) -> str:
    """Small markers on a card: AI help, root, audit warnings, and the virus scan's verdict."""
    flags = []
    if stats.get("ai"):
        flags.append('<span class="flag-ai">✦ AI</span>')
    if stats.get("store"):
        flags.append('<span class="flag-store">In Decky store</span>')
    if stats.get("root"):
        flags.append('<span class="flag-warn">⚠ Root</span>')
    if stats.get("warnings"):
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


def card(app: dict, data: dict, prefix: str = "/plugins/") -> str:
    key = app["repo"].casefold()
    stats, scans = data["stats"].get(key) or {}, data["scans"].get(key) or {}
    meta = " · ".join(
        part
        for part in (
            f'<span title="GitHub downloads">↓ {compact(stats["downloads"])}</span>'
            if stats.get("downloads") is not None
            else "",
            f"★ {compact(stats['stars'])}" if stats.get("stars") is not None else "",
        )
        if part
    )
    description = app.get("description") or ""
    text = escape(f"{app['name']} {description} {app['category']} {app['repo']}".lower())
    in_store = ' data-store="1"' if stats.get("store") else ""
    return (
        f'<a class="app" href="{prefix}{escape(app["id"])}.html" data-text="{text}" data-cat="{slug(app["category"])}"{in_store}>'
        f"<small>{escape(app['category'])}</small><strong>{escape(app['name'])}</strong><p>{escape(description)}</p>"
        f'<span class="meta">{meta}</span><span class="flags">{flags_of(stats, scans, data.get("reports"), data.get("vt"))}</span></a>'
    )


def by_downloads(apps: list[dict], data: dict) -> list[dict]:
    return sorted(apps, key=lambda app: -((data["stats"].get(app["repo"].casefold()) or {}).get("downloads") or 0))


def popular_cards(apps: list[dict], data: dict, count: int = 12, prefix: str = "plugins/") -> str:
    """The home page's short list: the most downloaded plugins, linking to their pages."""
    return "\n".join(card(app, data, prefix) for app in by_downloads(apps, data)[:count])


FILTER_JS = """(function(){var q=document.getElementById("q"),cards=[].slice.call(document.querySelectorAll("#list .app")),chips=[].slice.call(document.querySelectorAll(".chips button[data-cat]")),store=document.getElementById("store-only"),count=document.getElementById("count"),cat="",inStore=false;
function run(){var t=q.value.trim().toLowerCase(),n=0;cards.forEach(function(c){var ok=(!cat||c.dataset.cat===cat)&&(!inStore||c.dataset.store)&&(!t||c.dataset.text.indexOf(t)>-1);c.hidden=!ok;if(ok)n++});count.textContent=n+" of "+cards.length+" plugins";chips.forEach(function(b){b.setAttribute("aria-pressed",String((b.dataset.cat||"")===cat))})}
function fromHash(){var m=/^#cat=([a-z0-9-]+)/.exec(location.hash);cat=m?m[1]:"";run()}
chips.forEach(function(b){b.addEventListener("click",function(){cat=b.dataset.cat||"";history.replaceState(null,"",cat?"#cat="+cat:location.pathname);run()})});
if(store)store.addEventListener("click",function(){inStore=!inStore;store.setAttribute("aria-pressed",String(inStore));run()});
q.addEventListener("input",run);window.addEventListener("hashchange",fromHash);fromHash()})();"""


def catalog_page(shell: dict[str, str], apps: list[dict], data: dict) -> str:
    """plugins/index.html: every plugin, most downloaded first, with a search box and category chips.
    Without JavaScript the whole list is simply shown."""
    ordered = by_downloads(apps, data)
    categories: dict[str, int] = {}
    for app in apps:
        categories[app["category"]] = categories.get(app["category"], 0) + 1
    chips = f'<button type="button" data-cat="" aria-pressed="true">All {len(apps)}</button>' + "".join(
        f'<button type="button" data-cat="{slug(name)}" aria-pressed="false">{escape(name)} {count}</button>'
        for name, count in sorted(categories.items(), key=lambda item: (-item[1], item[0]))
    )
    in_store = sum(1 for app in apps if (data["stats"].get(app["repo"].casefold()) or {}).get("store"))
    if in_store:
        chips += f'<button type="button" id="store-only" aria-pressed="false">In Decky store {in_store}</button>'
    body = f"""<p class="crumbs"><a href="/">DeckyHub</a> › Plugins</p>
<h1>Decky plugins</h1>
<p><a class="btn ghost" href="/remote-install/">Paired devices</a></p>
<p id="remote-device-ready" role="status" hidden>Device details received. Choose a plugin to pair with your device and request installation.</p>
<script type="module" src="/remote-install.js"></script>
<p class="lead">{len(apps)} Decky Loader plugins, most downloaded first. Install any of them from Gaming Mode with <a href="/">DeckyHub</a>, which also checks them for updates.</p>
<p class="note">Every plugin belongs to its authors. DeckyHub doesn't make, review or vouch for them, and a plugin's page shows its notes (AI help, root, audit warnings) and security scans; <a href="/plugins/known-issues.html">Known issues</a> lists every plugin with a warning. Missing one? <a href="/contribute/">Add a plugin</a>.</p>
<div class="filters"><input id="q" type="search" placeholder="Search plugins" aria-label="Search plugins" autocomplete="off"><div class="chips" role="group" aria-label="Categories">{chips}</div></div>
<p class="note" id="count" aria-live="polite">{len(apps)} plugins</p>
<div class="catalog" id="list">
{chr(10).join(card(app, data) for app in ordered)}
</div>
<script>{FILTER_JS}</script>"""
    listing = json_ld(
        {
            "@type": "CollectionPage",
            "name": "Decky plugins",
            "url": f"{SITE}plugins/",
            "mainEntity": {
                "@type": "ItemList",
                "numberOfItems": len(apps),
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": index + 1,
                        "url": f"{SITE}plugins/{app['id']}.html",
                        "name": app["name"],
                    }
                    for index, app in enumerate(ordered[:100])
                ],
            },
        }
    )
    trail = json_ld(
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "DeckyHub", "item": SITE},
                {"@type": "ListItem", "position": 2, "name": "Plugins"},
            ],
        }
    )
    hundreds = len(apps) // 100 * 100
    return page(
        shell,
        f"Decky plugins: {hundreds}+ Decky Loader plugins | DeckyHub",
        f"Browse {len(apps)} Decky Loader plugins, with downloads, stars and security scans. Install and update them from Gaming Mode with DeckyHub.",
        "plugins/",
        body,
        [trail, listing],
    )


def versions_section(releases: list) -> str:
    """Every release the index keeps for the plugin: its tag, date, pre-release badge and ZIP downloads."""
    rows = []
    for item in releases:
        if not isinstance(item, dict) or item.get("draft") or not item.get("tag_name"):
            continue
        url = item.get("html_url") or ""
        tag = escape(str(item["tag_name"]))
        title = f'<a href="{escape(url)}">{tag}</a>' if url.startswith("https://github.com/") else tag
        badge = ' <span class="badge warn">Pre-release</span>' if item.get("prerelease") else ""
        zips = [
            f'<a href="{escape(asset["browser_download_url"])}">{escape(str(asset.get("name")))}</a>'
            for asset in item.get("assets") or []
            if str(asset.get("name", "")).lower().endswith(".zip")
            and str(asset.get("browser_download_url", "")).startswith("https://")
        ]
        anchor, when, files = (
            escape(str(item["tag_name"]), quote=True),
            nice_date(item.get("published_at")),
            ", ".join(zips),
        )
        rows.append(f'<li id="v-{anchor}">{title}{badge}<small>{when}{" · " if zips else ""}{files}</small></li>')
    if not rows:
        return ""
    return f'<h2>Versions</h2><p>The latest releases DeckyHub can install. Security scans below cover only the newest stable and pre-release ZIPs.</p><ul class="list">{"".join(rows)}</ul>'


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

        for channel, note in ((scans.get("stable"), ""), (scans.get("prerelease"), "Pre-release only")):
            if (
                channel
                and channel.get("clamav")
                and (kind := scan_kind(channel, data.get("reports"), data.get("vt"))) != "clean"
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
    return page(
        shell,
        "Known Decky plugin issues and warnings | DeckyHub",
        f"{flagged} Decky Loader plugins with virus scan findings or audit warnings, such as code not in its repo or reading private data. Check before you install.",
        "plugins/known-issues.html",
        body,
        [trail],
    )


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
        if (stat.get("store") or {}).get("downloads") is not None:
            record["storeDownloads"] = stat["store"]["downloads"]
        if stat.get("ai"):
            record["ai"] = True
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


def write_pages(out, apps: list[dict], releases_page: str, data: dict) -> list[tuple[str, str]]:
    """Writes plugins/index.html and plugins/<id>.html for every plugin; returns (url, lastmod) for the sitemap."""
    shell = shell_of(releases_page)
    stats, scans, reports, warnings = data["stats"], data["scans"], data["reports"], data["warnings"]
    (out / "plugins").mkdir(exist_ok=True)
    today = time.strftime("%Y-%m-%d", time.gmtime())
    (out / "plugins" / "index.html").write_text(catalog_page(shell, apps, data), encoding="utf-8")
    (out / "plugins" / "known-issues.html").write_text(issues_page(shell, apps, data), encoding="utf-8")
    (out / "plugins" / "info.json").write_text(
        json.dumps(plugin_info(apps, data), separators=(",", ":"), sort_keys=True), encoding="utf-8"
    )
    remote_page = paired_devices_page(shell)
    (out / "remote-install").mkdir(exist_ok=True)
    (out / "remote-install" / "index.html").write_text(remote_page, encoding="utf-8")
    (out / "paired-devices").mkdir(exist_ok=True)
    (out / "paired-devices" / "index.html").write_text(
        paired_devices_page(
            shell,
            "Manage paired devices | DeckyHub",
            "Choose a paired device to review, install or remove Decky plugins.",
        ),
        encoding="utf-8",
    )
    # The same page in Ukrainian, under /uk/ like the rest of the Ukrainian site.
    for folder in ("paired-devices", "remote-install"):
        (out / "uk" / folder).mkdir(parents=True, exist_ok=True)
        (out / "uk" / folder / "index.html").write_text(
            paired_devices_page(
                shell,
                "Сполучені пристрої | DeckyHub",
                "Сполучіть пристрій і керуйте його встановленими плагінами Decky.",
                lang="uk",
                path=f"uk/{folder}/",
            ),
            encoding="utf-8",
        )
    (out / "paired-devices.html").write_text(
        paired_devices_page(
            shell,
            "Device pairing | DeckyHub",
            "Open your saved DeckyHub pairing link and manage plugins on your device.",
        ),
        encoding="utf-8",
    )
    urls = [
        (f"{SITE}plugins/", today),
        (f"{SITE}plugins/known-issues.html", today),
        (f"{SITE}remote-install/", today),
        (f"{SITE}paired-devices/", today),
        (f"{SITE}paired-devices.html", today),
        (f"{SITE}uk/paired-devices/", today),
        (f"{SITE}uk/remote-install/", today),
    ]
    for app in apps:
        key = app["repo"].casefold()
        others = [other for other in apps if other["category"] == app["category"]]
        (out / "plugins" / f"{app['id']}.html").write_text(
            plugin_page(
                shell,
                app,
                stats.get(key) or {},
                scans.get(key) or {},
                warnings,
                others,
                reports,
                data.get("vt"),
                (data.get("releases") or {}).get(key),
            ),
            encoding="utf-8",
        )
        urls.append((f"{SITE}plugins/{app['id']}.html", ((stats.get(key) or {}).get("updated") or today)[:10]))
    return urls
