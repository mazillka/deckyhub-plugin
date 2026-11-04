"""Build the GitHub Pages site into OUT (default _site).

Copies docs/, writes mazillka/deckyhub-registry's catalog into index.html
so crawlers see it without JavaScript, and makes WebP screenshots plus a JPEG
link-preview image (screenshots/hero.jpg) from screenshots/. It also renders
DeckyHub's GitHub releases into releases.html (the release notes page), fills
index.html's latest-release line and structured data (schema.org JSON-LD,
with the FAQ taken from the page's own <details>), writes a page per plugin
(plugins/<id>.html, see plugin_pages.py) and sitemap.xml.
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
RELEASES_URL = "https://api.github.com/repos/mazillka/deckyhub-plugin/releases?per_page=30"
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
    parser = SafeHtml()
    parser.feed(markdown.markdown((body or "").replace("\r\n", "\n"), extensions=["sane_lists"]))
    parser.close()
    return "".join(parser.out)


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
    if not releases:
        return f'<p class="sub">The release notes couldn\'t be loaded. See <a href="{REPO_URL}/releases">DeckyHub\'s releases on GitHub</a>.</p>'
    return "\n".join(
        f'<article class="release" id="{escape(release["tag_name"])}"><h2><a href="{escape(release["html_url"])}">{escape(release.get("name") or release["tag_name"])}</a>'
        + ('<span class="pre">Pre-release</span>' if release.get("prerelease") else "")
        + f'<time datetime="{escape(release.get("published_at") or "")}">{nice_date(release.get("published_at"))}</time></h2>'
        + notes_html(release.get("body"))
        + "</article>"
        for release in releases
    )


def structured_data(page: str, latest: dict | None) -> str:
    """schema.org JSON-LD: the site, DeckyHub itself and the page's FAQ, as visible."""
    faq = [
        {"@type": "Question", "name": re.sub(r"<[^>]+>", "", question).strip(), "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"<[^>]+>", "", answer).strip()}}
        for question, answer in re.findall(r"<details><summary>(.*?)</summary><p>(.*?)</p></details>", page, re.S)
    ]
    app = {
        "@type": "SoftwareApplication", "name": "DeckyHub", "url": SITE,
        "applicationCategory": "UtilitiesApplication", "applicationSubCategory": "Decky Loader plugin", "operatingSystem": "SteamOS",
        "description": "A Decky Loader plugin store for Steam Deck: find, install and update 500+ Decky Loader plugins from Gaming Mode, including plugins not on the official Decky store.",
        "downloadUrl": f"{REPO_URL}/releases/latest", "installUrl": f"{SITE}#install", "releaseNotes": f"{SITE}releases.html",
        "image": f"{SITE}img/og.jpg", "screenshot": [f"{SITE}img/{name}.webp" for name in ("discover", "updates", "manage", "menu")],
        "license": "https://www.gnu.org/licenses/gpl-3.0.html", "isAccessibleForFree": True,
        "author": {"@type": "Person", "name": "mazillka", "url": "https://github.com/mazillka"}, "sameAs": [REPO_URL],
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
    }
    if latest:
        app["softwareVersion"] = latest["tag_name"].removeprefix("v")
        app["dateModified"] = latest.get("published_at")
    graph = [{"@type": "WebSite", "name": "DeckyHub", "url": SITE}, app] + ([{"@type": "FAQPage", "mainEntity": faq}] if faq else [])
    # No "<" at all inside the script element, so nothing in the page's text can end it.
    data = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    return '<script type="application/ld+json">' + data + "</script>"


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
index.write_text(site_shell.apply(page), encoding="utf-8")

notes = out / "releases.html"
notes_page = notes.read_text(encoding="utf-8")
if "<!-- releases -->" not in notes_page:
    sys.exit("docs/releases.html is missing the <!-- releases --> placeholder")
notes.write_text(site_shell.apply(notes_page.replace("<!-- releases -->", release_articles(releases))), encoding="utf-8")

plugin_urls = plugin_pages.write_pages(out, apps, (ROOT / "docs" / "releases.html").read_text(encoding="utf-8"), data)
llms = out / "llms.txt"
if llms.exists():
    llms.write_text(llms.read_text(encoding="utf-8").rstrip("\n") + "\n\n## Plugins\n\n- [All plugins](" + SITE + "plugins/): every plugin, most downloaded first, with search and categories.\n" + "".join(
        f"- [{a['name']}]({SITE}plugins/{a['id']}.html): {a.get('description') or ''} (github.com/{a['repo']})\n" for a in sorted(apps, key=lambda a: a["name"].casefold())), encoding="utf-8")

today = time.strftime("%Y-%m-%d", time.gmtime())
newest = (releases[0].get("published_at") or "")[:10] if releases else today
(out / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    f"<url><loc>{SITE}</loc><lastmod>{today}</lastmod></url>\n"
    f"<url><loc>{SITE}releases.html</loc><lastmod>{newest}</lastmod></url>\n"
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
        text = text.replace(SITE, base).replace('href="/', f'href="{base}').replace('src="/', f'src="{base}')
        text = re.sub(r'<link rel="canonical"[^>]*>|<meta property="og:url"[^>]*>', "", text)
        text = text.replace("<head>", '<head>\n<meta name="robots" content="noindex,nofollow">', 1)
        text = re.sub(r"(<body[^>]*>)", lambda match: match.group(1) + "\n" + banner.replace(f'href="{base}"', f'href="{SITE}"'), text, count=1)
        html_file.write_text(text, encoding="utf-8")
