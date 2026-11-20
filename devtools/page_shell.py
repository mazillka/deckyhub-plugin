"""The shared frame of every generated page: the site's address, the page style, and the page() template."""

import json
import re
from html import escape

import site_shell

SITE = "https://deckyhub.com/"


EXTRA_STYLE = """
.app{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;text-decoration:none;color:var(--text);display:flex;flex-direction:column;gap:2px;content-visibility:auto;contain-intrinsic-size:auto 150px}
.app:hover{border-color:var(--accent2)}.app small{color:var(--accent2);font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}
.app p{margin:4px 0 0;color:var(--muted);font-size:.9rem;flex:1}.app .meta{color:var(--dim);font-size:.82rem;margin-top:8px}
.app .flags{display:flex;flex-wrap:wrap;gap:4px 8px;font-size:.78rem;margin-top:4px}.flag-ai{color:#b79cff}.flag-rust{color:#ffb08a}.flag-warn{color:var(--warn)}.flag-bad{color:#ff8a8a}.flag-ok{color:#6bcb6b}.flag-store{color:#7cc4ff}
.app[hidden]{display:none}
.catalog{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.filters{display:grid;gap:12px;margin:18px 0 8px}.filters input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--text);font-size:1rem}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chips button{padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--muted);font-size:.9rem;cursor:pointer}
.chips button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.crumbs{color:var(--dim);font-size:.9rem;margin:28px 0 6px}.crumbs a{color:var(--dim)}
.plugin h1{margin-top:0}.plugin h2{font-size:1.25rem;margin:32px 0 10px;scroll-margin-top:72px}
.lead{font-size:1.15rem;color:var(--muted);margin:0 0 18px}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin:0;padding:0;list-style:none}
.facts li{min-width:0;overflow-wrap:anywhere;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;color:var(--muted);font-size:.9rem}.facts li.wide{grid-column:1/-1}.facts strong{display:block;color:var(--text);font-size:1.05rem}
.badges{display:grid;gap:8px;margin:0;padding:0;list-style:none}.badges li{color:var(--muted)}
.badge{padding:1px 8px;border-radius:999px;border:1px solid currentColor;font-size:.8rem;white-space:nowrap;margin-right:6px}.badge.store{color:#7cc4ff}
.root{color:#ffb35c}.stale{color:#ff8a8a}.warn{color:var(--warn)}.fork{color:var(--muted)}.clean{color:#6bcb6b}.ai{color:#c49bff}.rust{color:#ffb08a}
.btn{display:inline-block;padding:11px 18px;border-radius:8px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;margin:4px 8px 4px 0;cursor:pointer;font-family:inherit;font-size:inherit}.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--text)}
.list{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;padding:0;list-style:none}
.list a{display:block;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px;text-decoration:none;color:var(--text);height:100%}
.list a:hover{border-color:var(--accent2)}.list small{display:block;color:var(--muted);margin-top:4px}
.note{color:var(--dim);font-size:.9rem}
.cta{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}.cta .btn{margin:0;min-height:44px;display:inline-flex;align-items:center;justify-content:center}
.chips-row{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;padding:0;list-style:none}
.chip{padding:5px 13px;border-radius:999px;border:1px solid currentColor;font-size:.92rem;font-weight:600}
.steps{display:grid;gap:12px;margin:0 0 12px;padding:0;list-style:none;counter-reset:step}
.steps li{counter-increment:step;display:flex;gap:12px;align-items:flex-start;color:var(--text)}
.steps li::before{content:counter(step);flex:none;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:.9rem}
details.more{border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:0 16px;margin:12px 0}
details.more>summary{cursor:pointer;padding:14px 0;font-weight:600;min-height:44px}
details.more[open]>summary{border-bottom:1px solid var(--line);margin-bottom:12px}
.badges li{min-width:0;overflow-wrap:anywhere}.plugin code{overflow-wrap:anywhere}
@media(max-width:640px){
.facts{grid-template-columns:repeat(2,minmax(0,1fr))}
.cta .btn{flex:1 1 100%}
.plugin h1{font-size:1.8rem}.lead{font-size:1.05rem}
.list{grid-template-columns:1fr}
table.scans{display:block;overflow-x:auto}
.chips button{min-height:40px}
}
table.scans{width:100%;border-collapse:collapse;font-size:.92rem;margin:0 0 18px}.scans caption{text-align:left;color:var(--muted);padding:6px 0}.scans th,.scans td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.scans th{color:var(--dim);font-weight:600}
"""


def json_ld(data: dict) -> str:
    # No "<" at all inside the script element, so nothing in a name or description can end it.
    return (
        '<script type="application/ld+json">'
        + json.dumps({"@context": "https://schema.org", **data}, ensure_ascii=False, separators=(",", ":")).replace(
            "<", "\\u003c"
        )
        + "</script>"
    )


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
