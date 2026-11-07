"""Build the GitHub Pages site into OUT (default _site).

Copies docs/, writes mazillka/deckyhub-registry's catalog into index.html
so crawlers see it without JavaScript, and makes WebP screenshots plus a JPEG
link-preview image (screenshots/hero.jpg) from screenshots/. It also renders
DeckyHub's GitHub releases into releases.html (the release notes page), fills in help.html and about.html (and their Ukrainian twins in uk/), fills
index.html's latest-release line and structured data (schema.org JSON-LD,
with the FAQ taken from the page's own <details>), writes a page per plugin
(plugins/<id>.html, see plugin_pages.py), fills in the contributor pages
(contribute/ and uk/contribute/: how to add a plugin, and the registry editor) and writes sitemap.xml.
Needs Pillow and Markdown (CI-only, not plugin dependencies). GITHUB_TOKEN, if
set, is sent with the releases request; without the releases (GitHub down),
the site still builds and the release notes page links to GitHub.

`--preview /develop/` builds the same site as a preview under that path (pages.yml puts
the develop branch there): every link into the site points inside the preview, search
engines are told to stay away (noindex, no canonical link, no sitemap) and a banner says
it isn't the live site.
"""
import json
import os
import re
import shutil
import sys
import time
import urllib.request
from html import escape
from html.parser import HTMLParser
from pathlib import Path

import markdown
from PIL import Image

import plugin_pages
from plugin_pages import nice_date
import site_shell

ROOT = Path(__file__).resolve().parent.parent
REGISTRY_URL = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/refs/heads/main/registry/apps.json"
RELEASES_URL = "https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=100"
SITE = "https://deckyhub.com/"
REPO_URL = "https://github.com/mazillka/deckyhub-plugin"


class SafeHtml(HTMLParser):
    """Keeps the tags release notes use; drops every other tag (its text stays,
    escaped), every attribute but an http(s) link's href, and headings become h3/h4
    under each release's h2."""
    KEEP = {"p", "ul", "ol", "li", "strong", "em", "code", "pre", "a", "br", "blockquote", "hr"}
    HEADINGS = {"h1": "h3", "h2": "h3", "h3": "h3", "h4": "h4", "h5": "h4", "h6": "h4"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href") or ""
            self.out.append(f'<a href="{escape(href)}" rel="nofollow">' if re.match(r"https?://", href) else "<a>")
        elif tag in self.HEADINGS or tag in self.KEEP:
            self.out.append(f"<{self.HEADINGS.get(tag, tag)}>")

    def handle_endtag(self, tag):
        if tag in self.HEADINGS or tag in self.KEEP:
            self.out.append(f"</{self.HEADINGS.get(tag, tag)}>")

    def handle_data(self, data):
        self.out.append(escape(data, quote=False))


def notes_html(body: str | None) -> str:
    """A release's notes as safe HTML. GitHub's auto-generated "What's Changed" / "New Contributors" lists and the
    "Full Changelog" link aren't for readers and are dropped; the "Security checks" section (last in the notes) sits
    in a collapsed block, so what's new comes first."""
    text = (body or "").replace("\r\n", "\n")
    text = re.sub(r"^#+ *(What's Changed|New Contributors)[ \t]*$.*?(?=^#+ |\Z)", "", text, flags=re.M | re.S)
    text = re.sub(r"^\**Full Changelog\**:.*$", "", text, flags=re.M)
    text, _, security = text.partition("\n## Security checks")
    parts = []
    for markup in (text, security):
        parser = SafeHtml()
        parser.feed(markdown.markdown(markup.strip(), extensions=["sane_lists"]))
        parser.close()
        parts.append("".join(parser.out))
    return parts[0] + (f"<details><summary>Security checks</summary>{parts[1]}</details>" if parts[1] else "")


def fetch_releases() -> list[dict]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "deckyhub-site"}
    if os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    try:
        with urllib.request.urlopen(urllib.request.Request(RELEASES_URL, headers=headers), timeout=30) as response:
            return [release for release in json.load(response) if not release.get("draft")]
    except Exception as error:  # noqa: BLE001 - the site goes out without release notes
        print(f"warning: no release notes: {error}", file=sys.stderr)
        return []


def release_articles(releases: list[dict]) -> str:
    """Stable releases only (a pre-release's notes are for testers), newest first; one with no notes of its own is left out."""
    if not releases:
        return f'<p class="sub">The release notes couldn\'t be loaded. See <a href="{REPO_URL}/releases">DeckyHub\'s releases on GitHub</a>.</p>'
    return "\n".join(
        f'<article class="release" id="{escape(release["tag_name"])}"><h2><a href="{escape(release["html_url"])}">{escape(release.get("name") or release["tag_name"])}</a>'
        + f'<time datetime="{escape(release.get("published_at") or "")}">{nice_date(release.get("published_at"))}</time></h2>'
        + notes
        + "</article>"
        for release in releases
        if not release.get("prerelease") and (notes := notes_html(release.get("body")))
    )


MONTHS_UK = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"]


def nice_date_uk(iso: str | None) -> str:
    if not iso:
        return ""
    day = time.strptime(iso[:10], "%Y-%m-%d")
    return f"{day.tm_mday} {MONTHS_UK[day.tm_mon - 1]} {day.tm_year}"


def faq_items(page: str) -> list[dict]:
    """schema.org Questions from the page's own <details><summary>question</summary><p>answer</p></details>."""
    return [
        {"@type": "Question", "name": re.sub(r"<[^>]+>", "", question).strip(), "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"<[^>]+>", "", answer).strip()}}
        for question, answer in re.findall(r"<details><summary>(.*?)</summary><p>(.*?)</p></details>", page, re.S)
    ]


def json_ld(data: dict) -> str:
    # No "<" at all inside the script element, so nothing in the page's text can end it.
    return '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", **data}, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c") + "</script>"


def structured_data(page: str, latest: dict | None, uk: bool = False) -> str:
    """schema.org JSON-LD: the site, DeckyHub itself and the page's FAQ, as visible."""
    faq = faq_items(page)
    app = {
        "@type": "SoftwareApplication", "name": "DeckyHub", "url": SITE + "uk/" if uk else SITE, "inLanguage": "uk" if uk else "en",
        "applicationCategory": "UtilitiesApplication", "applicationSubCategory": "Decky Loader plugin", "operatingSystem": "SteamOS",
        "description": ("Магазин плагінів Decky Loader: знаходьте, встановлюйте й оновлюйте 500+ плагінів Decky Loader в ігровому режимі, зокрема тих, яких немає в офіційному магазині Decky."
                        if uk else "A Decky Loader plugin store: find, install and update 500+ Decky Loader plugins from Gaming Mode, including plugins not on the official Decky store."),
        "downloadUrl": f"{REPO_URL}/releases/latest", "installUrl": f"{SITE}uk/#install" if uk else f"{SITE}#install", "releaseNotes": f"{SITE}releases.html",
        "image": f"{SITE}img/og.jpg", "screenshot": [f"{SITE}img/{name}.webp" for name in ("discover", "updates", "manage", "menu")],
        "license": "https://www.gnu.org/licenses/gpl-3.0.html", "isAccessibleForFree": True,
        "author": {"@type": "Person", "name": "mazillka", "url": "https://github.com/mazillka"}, "sameAs": [REPO_URL],
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
    }
    if latest:
        app["softwareVersion"] = latest["tag_name"].removeprefix("v")
        app["dateModified"] = latest.get("published_at")
    graph = [{"@type": "WebSite", "name": "DeckyHub", "url": SITE}, app] + ([{"@type": "FAQPage", "mainEntity": faq}] if faq else [])
    return json_ld({"@graph": graph})


out = Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "_site")
PREVIEW = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None

shutil.copytree(ROOT / "docs", out, dirs_exist_ok=True)
with urllib.request.urlopen(REGISTRY_URL) as response:
    apps = json.load(response)["apps"]
data = plugin_pages.load_data()
index = out / "index.html"
page = index.read_text(encoding="utf-8")
if "<!-- popular -->" not in page:
    sys.exit("docs/index.html is missing the <!-- popular --> placeholder")
releases = fetch_releases()
latest = next((release for release in releases if not release.get("prerelease")), None)
for placeholder in ("<!-- structured-data -->", "<!-- latest -->"):
    if placeholder not in page:
        sys.exit(f"docs/index.html is missing the {placeholder} placeholder")
page = page.replace("<!-- popular -->", plugin_pages.popular_cards(apps, data)).replace("<!-- plugin-count -->", str(len(apps))).replace("<!-- structured-data -->", structured_data(page, latest))
if latest:
    page = page.replace("<!-- latest -->", f'Latest release: <a href="releases.html#{escape(latest["tag_name"])}">{escape(latest["tag_name"])}</a>, {nice_date(latest.get("published_at"))} · <a href="releases.html">Release notes</a>')
readme = (ROOT / "README.md").read_text(encoding="utf-8")
page = re.sub(r"<!-- steps: (.+?) -->", lambda match: plugin_pages.readme_steps(readme, match.group(1)), page)
index.write_text(site_shell.apply(page, switch=("Українська", SITE + "uk/", "uk")), encoding="utf-8")

# deckyhub.com/uk/: the home page in Ukrainian, filled in the same way (its steps from README.uk.md).
uk_index = out / "uk" / "index.html"
uk_page = uk_index.read_text(encoding="utf-8")
if latest:
    uk_page = uk_page.replace("<!-- latest -->", f'Останній реліз: <a href="../releases.html#{escape(latest["tag_name"])}">{escape(latest["tag_name"])}</a>, {nice_date_uk(latest.get("published_at"))} · <a href="../releases.html">Нотатки до релізів</a>')
uk_page = uk_page.replace("<!-- popular -->", plugin_pages.popular_cards(apps, data, prefix="../plugins/")).replace("<!-- plugin-count -->", str(len(apps)))
uk_page = uk_page.replace("<!-- structured-data -->", structured_data(uk_page, latest, uk=True))
readme_uk = (ROOT / "README.uk.md").read_text(encoding="utf-8")
uk_page = re.sub(r"<!-- steps: (.+?) -->", lambda match: plugin_pages.readme_steps(readme_uk, match.group(1)), uk_page)
uk_index.write_text(site_shell.apply(uk_page, "uk", ("English", SITE, "en")), encoding="utf-8")

notes = out / "releases.html"
notes_page = notes.read_text(encoding="utf-8")
if "<!-- releases -->" not in notes_page:
    sys.exit("docs/releases.html is missing the <!-- releases --> placeholder")
notes.write_text(site_shell.apply(notes_page.replace("<!-- releases -->", release_articles(releases))), encoding="utf-8")

# deckyhub.com/contribute/: how to add a plugin and the registry editor (moved here from registry.deckyhub.com), each with a Ukrainian twin.
CONTRIBUTE = ["contribute/", "contribute/editor.html", "uk/contribute/", "uk/contribute/editor.html"]
for name in ("index.html", "editor.html"):
    path = "" if name == "index.html" else name
    for lang, folder, switch in (("en", "contribute", ("Українська", f"{SITE}uk/contribute/{path}", "uk")), ("uk", "uk/contribute", ("English", f"{SITE}contribute/{path}", "en"))):
        page_file = out / folder / name
        page_file.write_text(site_shell.apply(page_file.read_text(encoding="utf-8").replace("<!-- plugin-count -->", str(len(apps))), lang, switch), encoding="utf-8")

# help.html (its questions also as FAQ structured data) and about.html, each with a Ukrainian twin under uk/.
HELP_ABOUT = ["help.html", "about.html", "uk/help.html", "uk/about.html"]
for name in ("help.html", "about.html"):
    for lang, path, switch in (("en", name, ("Українська", f"{SITE}uk/{name}", "uk")), ("uk", f"uk/{name}", ("English", f"{SITE}{name}", "en"))):
        page_file = out / path
        text = page_file.read_text(encoding="utf-8")
        if name == "help.html":
            if "<!-- structured-data -->" not in text:
                sys.exit(f"docs/{path} is missing the <!-- structured-data --> placeholder")
            text = text.replace("<!-- structured-data -->", json_ld({"@type": "FAQPage", "url": f"{SITE}{path}", "inLanguage": lang, "mainEntity": faq_items(text)}))
        page_file.write_text(site_shell.apply(text, lang, switch), encoding="utf-8")

plugin_urls = plugin_pages.write_pages(out, apps, (ROOT / "docs" / "releases.html").read_text(encoding="utf-8"), data)
llms = out / "llms.txt"
if llms.exists():
    llms.write_text(llms.read_text(encoding="utf-8").rstrip("\n") + "\n\n## Plugins\n\n- [All plugins](" + SITE + "plugins/): every plugin, most downloaded first, with search and categories.\n- [Known issues](" + SITE + "plugins/known-issues.html): plugins with virus scan findings or audit warnings.\n" + "".join(
        f"- [{a['name']}]({SITE}plugins/{a['id']}.html): {a.get('description') or ''} (github.com/{a['repo']})\n" for a in sorted(apps, key=lambda a: a["name"].casefold())), encoding="utf-8")

today = time.strftime("%Y-%m-%d", time.gmtime())
newest = (releases[0].get("published_at") or "")[:10] if releases else today
(out / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    f"<url><loc>{SITE}</loc><lastmod>{today}</lastmod></url>\n"
    f"<url><loc>{SITE}uk/</loc><lastmod>{today}</lastmod></url>\n"
    f"<url><loc>{SITE}releases.html</loc><lastmod>{newest}</lastmod></url>\n"
    + "".join(f"<url><loc>{SITE}{path}</loc><lastmod>{today}</lastmod></url>\n" for path in HELP_ABOUT + CONTRIBUTE)
    + "".join(f"<url><loc>{escape(url)}</loc><lastmod>{date}</lastmod></url>\n" for url, date in plugin_urls) + "</urlset>\n",
    encoding="utf-8",
)

img = out / "img"
img.mkdir(exist_ok=True)
for shot in (ROOT / "screenshots").glob("*.jpg"):
    image = Image.open(shot)
    image.save(img / f"{shot.stem}.webp", quality=78, method=6)
    image.resize((640, round(image.height * 640 / image.width)), Image.LANCZOS).save(img / f"{shot.stem}-640.webp", quality=78, method=6)
# The walkthrough GIF tops the page (with the Discover screenshot for reduced motion).
shutil.copy(ROOT / "promo" / "deckyhub.gif", img / "deckyhub.gif")
# The same walkthrough as animated WebP, about a third of the GIF's size; browsers without WebP keep the GIF.
with Image.open(ROOT / "promo" / "deckyhub.gif") as gif:
    durations = [gif.seek(i) or gif.info.get("duration", 100) for i in range(gif.n_frames)]
    gif.save(img / "deckyhub.webp", save_all=True, duration=durations, loop=0, quality=75, method=4)

# Pages without their own structured data get a WebPage with its breadcrumb, from what the page shows.
for path in ["releases.html", "about.html", "uk/about.html"] + [p + ("index.html" if p.endswith("/") else "") for p in CONTRIBUTE]:
    page_file = out / path
    text = page_file.read_text(encoding="utf-8")
    if "application/ld+json" in text:
        continue
    url = re.search(r'<link rel="canonical" href="([^"]+)"', text).group(1)
    name = re.sub(r"<[^>]+>", "", re.search(r"<h1[^>]*>(.*?)</h1>", text, re.S).group(1)).strip()
    uk = path.startswith("uk/")
    home = SITE + "uk/" if uk else SITE
    text = text.replace("</head>", json_ld({"@type": "WebPage", "name": name, "url": url, "inLanguage": "uk" if uk else "en", "isPartOf": {"@type": "WebSite", "name": "DeckyHub", "url": SITE},
                                            "breadcrumb": {"@type": "BreadcrumbList", "itemListElement": [
                                                {"@type": "ListItem", "position": 1, "name": "DeckyHub", "item": home},
                                                {"@type": "ListItem", "position": 2, "name": name, "item": url}]}}) + "\n</head>", 1)
    page_file.write_text(text, encoding="utf-8")

# GitHub Pages can't send security headers, so every page carries them as meta tags. Scripts and styles are inline;
# the only outside requests are shields.io badges and the registry editor's fetch of apps.json.
CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://img.shields.io; "
       "connect-src 'self' https://raw.githubusercontent.com; object-src 'none'; base-uri 'self'; form-action 'self'")
for html_file in out.rglob("*.html"):
    text = html_file.read_text(encoding="utf-8")
    text = text.replace("<head>", f'<head>\n<meta http-equiv="Content-Security-Policy" content="{CSP}">\n<meta name="referrer" content="strict-origin-when-cross-origin">', 1)
    html_file.write_text(text, encoding="utf-8")
# The promo hero (16:9) suits link previews better than a bare screenshot.
shutil.copy(ROOT / "screenshots" / "hero.jpg", img / "og.jpg")


if PREVIEW:
    base = "/" + PREVIEW.strip("/") + "/"
    banner = ('<div style="background:#e8b54a;color:#10151f;text-align:center;padding:6px 12px;font:600 14px system-ui,sans-serif">'
              f'Preview build from the develop branch, not the live site. <a href="{SITE}" style="color:#10151f">Go to deckyhub.com</a></div>')
    for sitemap in ("sitemap.xml", "robots.txt"):
        (out / sitemap).unlink(missing_ok=True)
    for html_file in out.rglob("*.html"):
        text = html_file.read_text(encoding="utf-8")
        # Root-relative links first: done after SITE they'd get the preview path twice (/develop/develop/).
        text = text.replace('href="/', f'href="{base}').replace('src="/', f'src="{base}').replace(SITE, base)
        if f'"{base}{base.lstrip("/")}' in text:
            sys.exit(f"{html_file}: a link got the preview path twice")
        text = re.sub(r'<link rel="canonical"[^>]*>|<meta property="og:url"[^>]*>', "", text)
        text = text.replace("<head>", '<head>\n<meta name="robots" content="noindex,nofollow">', 1)
        text = re.sub(r"(<body[^>]*>)", lambda match: match.group(1) + "\n" + banner.replace(f'href="{base}"', f'href="{SITE}"'), text, count=1)
        html_file.write_text(text, encoding="utf-8")
