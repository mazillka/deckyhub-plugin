"""Audit the built website (python devtools/build-site.py _site, then this on _site) for what
search engines and AI assistants need, and for broken internal links. Exits 1 on any problem.

  python devtools/audit-site.py _site

Checks every page for: a unique title (70 characters at most), a unique meta description
(50 to 170 characters), exactly one h1, a language, a viewport, a canonical link (not the
404 page), alt text and width/height on local images, and a skip-to-content link with
<main id="main"> (not the 404 page); plus broken internal links, sitemap coverage of every
page, and robots.txt, sitemap.xml and llms.txt being there. Preview builds (--preview) are
noindex on purpose and skip the canonical and sitemap checks.
"""

import collections
import html
import re
import sys
from pathlib import Path

out = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
pages = sorted(path for path in out.rglob("*.html"))
problems: list[str] = []
titles, descriptions = collections.Counter(), collections.Counter()
preview = (out / "sitemap.xml").exists() is False


def first(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, re.DOTALL)
    return html.unescape(match.group(1)).strip() if match else None


for path in pages:
    rel = path.relative_to(out).as_posix()
    text = path.read_text(encoding="utf-8")
    not_found = rel.endswith("404.html")
    title = first(r"<title>(.*?)</title>", text)
    description = first(r'<meta name="description" content="(.*?)">', text)
    titles[title] += 1
    descriptions[description] += 1
    if not title or len(title) > 70:
        problems.append(f"{rel}: title missing or over 70 characters ({len(title or '')})")
    if not description or not 50 <= len(description) <= 170:
        problems.append(f"{rel}: meta description missing or not 50-170 characters ({len(description or '')})")
    if text.count("<h1") != 1:
        problems.append(f"{rel}: {text.count('<h1')} h1 elements, want 1")
    if "<html lang=" not in text:
        problems.append(f"{rel}: no html lang")
    if 'name="viewport"' not in text:
        problems.append(f"{rel}: no viewport")
    if not not_found and not preview and 'rel="canonical"' not in text:
        problems.append(f"{rel}: no canonical link")
    if not not_found and ('class="skip"' not in text or '<main id="main"' not in text):
        problems.append(f'{rel}: no skip-to-content link or <main id="main">')
    for img in re.findall(r"<img[^>]*>", text):
        if "alt=" not in img:
            problems.append(f"{rel}: image without alt: {img[:60]}")
        # Third-party badges (shields.io) are given a size too, so the page doesn't jump when they load.
        if "width=" not in img or "height=" not in img:
            problems.append(f"{rel}: image without width and height: {img[:60]}")
    for href in set(re.findall(r'href="([^"#?:]+?)(?:#[^"]*)?"', text)):
        if href.startswith(("http", "mailto", "//")) or not href:
            continue
        target = out / href.lstrip("/") if href.startswith("/") else path.parent / href
        if target.is_dir():
            target = target / "index.html"
        if not target.exists():
            problems.append(f"{rel}: broken internal link {href}")

problems += [f"duplicate title: {title}" for title, count in titles.items() if count > 1]
problems += [f"duplicate description: {description[:60]}" for description, count in descriptions.items() if count > 1]

if not preview:
    sitemap = (out / "sitemap.xml").read_text(encoding="utf-8")
    for path in pages:
        rel = path.relative_to(out).as_posix()
        if rel.endswith("404.html") or rel == "index.html":
            continue
        # A folder's index.html is listed as the folder: /plugins/ for plugins/index.html.
        url = rel[: -len("index.html")] if rel.endswith("/index.html") else rel
        if f"/{url}</loc>" not in sitemap:
            problems.append(f"{rel}: missing from sitemap.xml")
    for name in ("robots.txt", "llms.txt"):
        if not (out / name).exists():
            problems.append(f"{name} is missing")
    if (out / "robots.txt").exists() and "Sitemap:" not in (out / "robots.txt").read_text(encoding="utf-8"):
        problems.append("robots.txt doesn't point to the sitemap")

print(f"{len(pages)} pages checked, {len(problems)} problem(s)")
for problem in problems[:40]:
    print("-", problem)
sys.exit(1 if problems else 0)
