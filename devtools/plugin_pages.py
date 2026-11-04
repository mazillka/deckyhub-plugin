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

SITE = "https://deckyhub.com/"
REGISTRY_RAW = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/"
STATS_URL = REGISTRY_RAW + "release-index/stats.json"
SCANS_URL = REGISTRY_RAW + "virus-scans/plugins.json"
METADEFENDER_URL = REGISTRY_RAW + "metadefender-reports/reports.json"
# The catalog script's WARNINGS (id: [label, hint]) live in the registry's page.
WARNINGS_PAGE_URL = REGISTRY_RAW + "refs/heads/main/docs/index.html"

SCAN_LABELS = {"clean": ("No threats", "clean"), "infected": ("Threat found", "stale"), "partial": ("Not fully scanned", "warn")}
SCAN_RESULTS = {"clean": "no threats found", "infected": "threat found", "incomplete": "only partly scanned", "error": "couldn't be scanned"}

EXTRA_STYLE = """
.skip{position:absolute;left:-9999px;top:8px;z-index:20;background:#fff;color:#10151f;padding:8px 14px;border-radius:6px;font-weight:600;text-decoration:none}.skip:focus{left:8px}
.crumbs{color:var(--dim);font-size:.9rem;margin:28px 0 6px}.crumbs a{color:var(--dim)}
.plugin h1{margin-top:0}.plugin h2{font-size:1.25rem;margin:32px 0 10px}
.lead{font-size:1.15rem;color:var(--muted);margin:0 0 18px}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin:0;padding:0;list-style:none}
.facts li{min-width:0;overflow-wrap:anywhere;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;color:var(--muted);font-size:.9rem}.facts li.wide{grid-column:1/-1}.facts strong{display:block;color:var(--text);font-size:1.05rem}
.badges{display:grid;gap:8px;margin:0;padding:0;list-style:none}.badges li{color:var(--muted)}
.badge{padding:1px 8px;border-radius:999px;border:1px solid currentColor;font-size:.8rem;white-space:nowrap;margin-right:6px}
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
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "deckyhub-site"}), timeout=60) as response:
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


def warning_labels(page: str | None) -> dict[str, tuple[str, str]]:
    if not page or "const WARNINGS = {" not in page:
        return {}
    block = page.split("const WARNINGS = {", 1)[1].split("};", 1)[0]
    return {key: (label, hint) for key, label, hint in re.findall(r'^\s*"([\w-]+)": \["([^"]+)", "([^"]+)"\]', block, re.M)}


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


def scan_kind(channel: dict) -> str:
    results = [scan["result"] for scan in (channel.get("clamav"), channel.get("yara")) if scan]
    return "infected" if "infected" in results else "partial" if any(result != "clean" for result in results) else "clean"


def fit(text: str, limit: int) -> str:
    """text cut at a word boundary to at most `limit` characters, with an ellipsis when it was cut."""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:.-") + "…"


def json_ld(data: dict) -> str:
    # No "<" at all inside the script element, so nothing in a name or description can end it.
    return '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", **data}, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c") + "</script>"


def badges_of(stats: dict, scans: dict, warnings: dict) -> list[str]:
    items = []
    if stats.get("root"):
        items.append('<li><span class="badge root">Runs as root</span> Its plugin.json asks Decky Loader to run its backend as root, with full access to the Deck. Many plugins need that for real reasons; install it only if you trust the author.</li>')
    if stats.get("fork"):
        items.append(f'<li><span class="badge fork">Fork</span> A fork of <a href="https://github.com/{escape(stats["fork"])}">{escape(stats["fork"])}</a> that carries the plugin on after its original stopped.</li>')
    if stats.get("ai"):
        items.append(f'<li><span class="badge ai">AI</span> Its repository has instructions for AI coding assistants ({escape(", ".join(stats["ai"]))}), so it\'s likely developed with AI help. That says nothing about its quality or safety.</li>')
    for key, prefix in [*((key, "") for key in stats.get("warnings") or []), *((key, "Pre-release: ") for key in stats.get("prereleaseWarnings") or [] if key not in (stats.get("warnings") or []))]:
        if key in warnings:
            label, hint = warnings[key]
            items.append(f'<li><span class="badge {"stale" if key == "blocked" else "warn"}">{escape(prefix + label)}</span> {escape(hint)} (from <a href="https://decky-extended-plugins.beallio.com/audit">Decky Extended Plugins\' audit</a>)</li>')
    for channel, prefix in ((scans.get("stable"), ""), (scans.get("prerelease"), "Pre-release: ")):
        if not channel or not channel.get("clamav"):
            continue
        kind = scan_kind(channel)
        if prefix and (scans.get("stable") or {}).get("clamav") and kind == "clean":
            continue
        label, css = SCAN_LABELS[kind]
        results = "; ".join(f"{name}: {SCAN_RESULTS.get(scan['result'], scan['result'])}" + (f" ({', '.join(scan['found'])})" if scan.get("found") else "") for name, scan in (("ClamAV", channel.get("clamav")), ("YARA", channel.get("yara"))) if scan)
        items.append(f'<li><span class="badge {css}">{escape(prefix + label)}</span> Virus scan of <code>{escape(channel.get("file", ""))}</code> ({escape(channel.get("tag", ""))}): {escape(results)}. A clean scan isn\'t proof of safety.</li>')
    return items


def security_scans(scans: dict, reports: dict) -> str:
    """One table per scanned ZIP (the stable release's, and a pre-release's if it's another file):
    ClamAV and YARA from the registry's own scans, VirusTotal looked up by SHA-256 (nothing is
    uploaded), MetaDefender from its published report once it has one."""
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
            result = SCAN_RESULTS.get(scan["result"], scan["result"]) + (f" ({', '.join(scan['found'])})" if scan.get("found") else "")
            rows.append(f"<tr><td>{name}</td><td>{escape(result[:1].upper() + result[1:])}</td><td>{escape(when(scan))}</td></tr>")
        if valid:
            rows.append(f'<tr><td>VirusTotal</td><td><a href="https://www.virustotal.com/gui/file/{sha.lower()}">Look this file up</a> (by its SHA-256, nothing is uploaded)</td><td></td></tr>')
            report = (reports or {}).get(sha.lower()) or {}
            if report.get("state") == "complete" and isinstance(report.get("flagged"), int) and isinstance(report.get("total"), int):
                data_id = report.get("dataId")
                link = f' (<a href="https://metadefender.opswat.com/results/file/{escape(data_id)}/regular/overview">report</a>)' if isinstance(data_id, str) and re.fullmatch(r"[A-Za-z0-9_-]+", data_id) else ""
                rows.append(f"<tr><td>MetaDefender</td><td>{report['flagged']} of {report['total']} engines flagged this file{link}</td><td></td></tr>")
            else:
                rows.append("<tr><td>MetaDefender</td><td>No report yet</td><td></td></tr>")
        detail = f'{escape(prefix)}: <code>{escape(channel.get("file", ""))}</code> ({escape(channel.get("tag", ""))})' + (f"<br><small>SHA-256 <code>{sha.lower()}</code></small>" if valid else "")
        tables.append(f'<table class="scans"><caption>{detail}</caption><thead><tr><th>Scanner</th><th>Result</th><th>Scanned</th></tr></thead><tbody>{"".join(rows)}</tbody></table>')
    if not tables:
        return "<p>Not scanned yet. The registry scans every ZIP it offers a few times a day, so a new release shows up here soon.</p>"
    return "".join(tables)


def shell_of(releases_page: str) -> dict[str, str]:
    """The style, navigation and footer of docs/releases.html, so the plugin pages match the site."""
    style = re.search(r"<style>(.*?)</style>", releases_page, re.S)
    nav = re.search(r'<nav class="site-nav".*?</nav>', releases_page, re.S)
    footer = re.search(r"<footer>.*?</footer>", releases_page, re.S)
    if not (style and nav and footer):
        raise SystemExit("docs/releases.html is missing its style, navigation or footer")
    # The footer's "./" is the site root from releases.html, but it'd be /plugins/ from a plugin page.
    return {"style": style.group(1) + EXTRA_STYLE, "nav": nav.group(0), "footer": footer.group(0).replace('href="./"', 'href="/"')}


def page(shell: dict[str, str], title: str, description: str, path: str, body: str, data: list[str]) -> str:
    url = SITE + path
    return f"""<!doctype html>
<html lang="en">
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
<a class="skip" href="#main">Skip to content</a>
{shell["nav"]}
<main id="main"><div class="wrap plugin">
{body}
</div></main>
{shell["footer"]}
</body>
</html>
"""


def plugin_page(shell: dict[str, str], app: dict, stats: dict, scans: dict, warnings: dict, others: list[dict], reports: dict | None = None) -> str:
    name, repo, category, description = app["name"], app["repo"], app["category"], app.get("description") or ""
    repo_url = f"https://github.com/{repo}"
    facts = [f"<li><strong>{escape(category)}</strong>Category</li>"]
    if stats.get("downloads") is not None:
        facts.append(f'<li><strong>{compact(stats["downloads"])}</strong>Downloads</li>')
    if stats.get("stars") is not None:
        facts.append(f'<li><strong>{compact(stats["stars"])}</strong>GitHub stars</li>')
    if stats.get("updated"):
        facts.append(f'<li><strong>{nice_date(stats["updated"])}</strong>Latest release</li>')
    badges = badges_of(stats, scans, warnings)
    related = [other for other in others if other["id"] != app["id"]][:6]
    crumbs = f'<p class="crumbs"><a href="/">DeckyHub</a> › <a href="/#catalog">Plugins</a> › {escape(name)}</p>'
    body = f"""{crumbs}
<h1>{escape(name)}</h1>
<p class="lead">{escape(description)}</p>
<p><a class="btn" href="/#install">Install with DeckyHub</a><a class="btn ghost" href="{escape(repo_url)}">Source on GitHub</a></p>
<ul class="facts">{"".join(facts)}<li class="wide"><strong><a href="{escape(repo_url)}">{escape(repo)}</a></strong>Repository</li></ul>
<h2>Install {escape(name)} on Steam Deck</h2>
<p>{escape(name)} is a <a href="https://decky.xyz/">Decky Loader</a> plugin. With <a href="/">DeckyHub</a> installed, open DeckyHub's <strong>Discover</strong> tab in Gaming Mode, search for <strong>{escape(name)}</strong> and press <strong>Install</strong>. DeckyHub hands the release to Decky Loader's own installer and checks its SHA-256 whenever GitHub publishes one. You can also download the ZIP from its <a href="{escape(repo_url)}/releases">releases</a> and install it by hand from Decky's developer settings.</p>
<h2>Safety information</h2>
{"<ul class='badges'>" + "".join(badges) + "</ul>" if badges else "<p>No badges: it doesn't run as root, and no audit warnings or virus scan findings are known for it.</p>"}
<h2>Security scans</h2>
<p>Every ZIP DeckyHub offers is scanned with ClamAV and with YARA rules (YARA Forge's core set), and the same scans are shown in the app. VirusTotal and MetaDefender results are matched by the file's SHA-256, so the file itself is never uploaded.</p>
{security_scans(scans, reports or {})}
<p class="note">DeckyHub doesn't make, review or vouch for {escape(name)}; it installs at your own risk. A clean scan isn't proof of safety. Check its repository before installing.</p>
{f'<h2>More {escape(category)} plugins</h2><ul class="list">' + "".join(f'<li><a href="/plugins/{escape(other["id"])}.html">{escape(other["name"])}<small>{escape(other.get("description") or "")}</small></a></li>' for other in related) + "</ul>" if related else ""}"""
    data = {
        "@type": "SoftwareApplication", "name": name, "description": description, "url": f"{SITE}plugins/{app['id']}.html",
        "applicationCategory": "UtilitiesApplication", "applicationSubCategory": f"Decky Loader plugin: {category}", "operatingSystem": "SteamOS",
        "sameAs": [repo_url], "isAccessibleForFree": True,
    }
    if stats.get("downloads") is not None:
        data["interactionStatistic"] = {"@type": "InteractionCounter", "interactionType": "https://schema.org/DownloadAction", "userInteractionCount": stats["downloads"]}
    if stats.get("updated"):
        data["dateModified"] = stats["updated"]
    trail = json_ld({"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "DeckyHub", "item": SITE},
        {"@type": "ListItem", "position": 2, "name": name}]})
    # Search results show about 60 characters of a title and 155 of a description.
    title = f"{name}: Decky plugin for Steam Deck | DeckyHub"
    if len(title) > 70:
        title = f"{fit(name, 40)} | DeckyHub"
    tail = " A Decky Loader plugin for Steam Deck; install it from Gaming Mode with DeckyHub."
    cut = fit(description.rstrip("."), 155 - len(tail))
    summary = cut + ("" if cut.endswith("…") else ".") + tail if description else f"{name}, a {category} Decky Loader plugin for Steam Deck. Install and update it from Gaming Mode with DeckyHub."
    summary = fit(summary, 160)
    return page(shell, title, summary, f"plugins/{app['id']}.html", body, [trail, json_ld(data)])


def write_pages(out, apps: list[dict], releases_page: str) -> list[tuple[str, str]]:
    """Writes plugins/<id>.html for every plugin; returns (url, lastmod) for the sitemap."""
    shell = shell_of(releases_page)
    stats, scans, reports = fetch_json(STATS_URL, "plugins"), fetch_json(SCANS_URL, "plugins"), fetch_json(METADEFENDER_URL, "reports")
    warnings = warning_labels(fetch(WARNINGS_PAGE_URL))
    (out / "plugins").mkdir(exist_ok=True)
    today = time.strftime("%Y-%m-%d", time.gmtime())
    urls = []
    for app in apps:
        key = app["repo"].casefold()
        others = [other for other in apps if other["category"] == app["category"]]
        (out / "plugins" / f"{app['id']}.html").write_text(
            plugin_page(shell, app, stats.get(key) or {}, scans.get(key) or {}, warnings, others, reports), encoding="utf-8")
        urls.append((f"{SITE}plugins/{app['id']}.html", ((stats.get(key) or {}).get("updated") or today)[:10]))
    return urls
