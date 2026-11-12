"""Independent coverage of DeckyHub (docs/media-coverage.json): checked, then drawn on the home page's
"Featured in" section and on the press page (deckyhub.com/press).

Add an entry to the JSON file and nothing else: the page, the home section and the sitemap follow.
Only links to the original publication are shown (never its text or images), and every text from the
file is escaped. Whatever the file holds, `load` raises ValueError before a page is built from it.
"""

import json
import re
from datetime import date
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

TYPES = {"news": "Article", "review": "Review", "tutorial": "Tutorial", "video": "Video"}
FEATURED_MAX = 4
_ID = re.compile(r"[a-z0-9][a-z0-9-]*")
_LANGUAGE = re.compile(r"[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*")

CSS = """.press-grid,.press-list{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.press-list{grid-template-columns:minmax(0,1fr)}
.press-card{padding:16px 18px;border:1px solid var(--line,#2e405a);border-radius:12px;background:var(--panel,#182131)}
.press-card h2,.press-card h3{margin:6px 0 8px;font-size:1.1rem;line-height:1.3}
.press-card p{margin:0 0 8px;color:var(--muted,#b6c3d4)}
.press-card a:focus-visible{outline:2px solid var(--accent2,#4b9cf0);outline-offset:2px}
.press-meta{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:.9rem}
.press-meta strong{color:var(--text,#eef4ff)}
.press-meta img{height:24px;width:auto;display:block}
.press-note{max-width:46rem;color:var(--muted,#b6c3d4)}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}"""


def load(path) -> list[dict]:
    path = Path(path)
    entries = json.loads(path.read_text(encoding="utf-8"))
    validate(entries, path.parent)
    return entries


def validate(entries, logo_root: Path | None = None) -> None:
    if not isinstance(entries, list):
        raise ValueError("media coverage must be a list")
    seen: set[str] = set()
    for number, entry in enumerate(entries, 1):
        where = f"media coverage entry {number}"
        if not isinstance(entry, dict):
            raise ValueError(f"{where}: not an object")
        for key in ("id", "publisher", "title", "url", "publishedAt", "language", "type"):
            if not isinstance(entry.get(key), str) or not entry[key].strip():
                raise ValueError(f"{where}: {key} must be a non-empty string")
        for key in ("featured", "visible"):
            if type(entry.get(key)) is not bool:
                raise ValueError(f"{where}: {key} must be true or false")
        if not _ID.fullmatch(entry["id"]):
            raise ValueError(f"{where}: id must be lowercase letters, digits and dashes")
        if entry["id"] in seen:
            raise ValueError(f"{where}: duplicate id {entry['id']!r}")
        seen.add(entry["id"])
        link = urlsplit(entry["url"])
        if (
            link.scheme != "https"
            or not link.hostname
            or link.username
            or link.password
            or re.search(r"\s", entry["url"])
        ):
            raise ValueError(f"{where}: url must be a plain https link")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", entry["publishedAt"]):
            raise ValueError(f"{where}: publishedAt must be YYYY-MM-DD")
        date.fromisoformat(entry["publishedAt"])
        if not _LANGUAGE.fullmatch(entry["language"]):
            raise ValueError(f"{where}: language must be a language code such as en")
        if entry["type"] not in TYPES:
            raise ValueError(f"{where}: type must be one of {', '.join(TYPES)}")
        if not isinstance(entry.get("description", ""), str):
            raise ValueError(f"{where}: description must be text")
        logo = entry.get("logo")
        if logo is not None:
            root = (logo_root or Path(".")).resolve()
            file = (root / logo).resolve() if isinstance(logo, str) and not urlsplit(logo).scheme else None
            if file is None or not file.is_file() or root not in file.parents:
                raise ValueError(f"{where}: logo must be a file inside docs/")


def visible(entries: list[dict]) -> list[dict]:
    """Newest first; entries of one day keep the order of their ids."""
    shown = sorted((entry for entry in entries if entry["visible"]), key=lambda entry: entry["id"])
    return sorted(shown, key=lambda entry: entry["publishedAt"], reverse=True)


def featured(entries: list[dict]) -> list[dict]:
    return [entry for entry in visible(entries) if entry["featured"]][:FEATURED_MAX]


def newest_date(entries: list[dict]) -> str | None:
    shown = visible(entries)
    return shown[0]["publishedAt"] if shown else None


def _day(value: str) -> str:
    day = date.fromisoformat(value)
    return f"{day:%B} {day.day}, {day.year}"


def card(entry: dict, heading: str = "h3") -> str:
    publisher = escape(entry["publisher"])
    brand = (
        f'<img src="/{escape(entry["logo"], quote=True)}" alt="{publisher}">'
        if entry.get("logo")
        else f"<strong>{publisher}</strong>"
    )
    description = f"<p>{escape(entry['description'])}</p>" if entry.get("description") else ""
    return (
        f'<article class="press-card"><p class="press-meta">{brand}'
        f'<time datetime="{entry["publishedAt"]}">{_day(entry["publishedAt"])}</time>'
        f'<span>{TYPES[entry["type"]]}</span><span lang="en">{escape(entry["language"])}</span></p>'
        f'<{heading}><a href="{escape(entry["url"], quote=True)}" target="_blank" rel="noopener noreferrer">'
        f'{escape(entry["title"])}<span class="sr-only"> (opens in a new tab)</span></a></{heading}>{description}</article>'
    )


def featured_in(entries: list[dict], press_url: str = "press", uk: bool = False) -> str:
    """The home page's section, or nothing when no entry is featured."""
    shown = featured(entries)
    if not shown:
        return ""
    heading, note, more = (
        (
            "Про DeckyHub пишуть",
            "Незалежні публікації про DeckyHub. DeckyHub не пов’язаний із цими виданнями, і вони його не рекомендують.",
            "Усі публікації",
        )
        if uk
        else (
            "Featured in",
            "Independent coverage of DeckyHub. DeckyHub isn't affiliated with these publications, and they don't endorse it.",
            "View all coverage",
        )
    )
    return (
        f'<section id="press"><div class="wrap">\n<h2>{heading}</h2>\n<p class="sub">{note}</p>\n'
        f'<div class="press-grid">{"".join(card(entry) for entry in shown)}</div>\n'
        f'<div class="cta" style="margin-top:24px"><a class="btn ghost" href="{press_url}">{more}</a></div>\n</div></section>\n'
    )


def press_body(entries: list[dict]) -> str:
    shown = visible(entries)
    items = "".join(card(entry, "h2") for entry in shown) or "<p>No coverage to show yet.</p>"
    return (
        "<h1>DeckyHub in the media</h1>\n"
        '<p class="press-note">Articles, reviews, tutorials and videos about DeckyHub by independent publishers, newest first. '
        "They link to the original publications. DeckyHub isn't affiliated with these publishers, and their inclusion here "
        "isn't an endorsement.</p>\n"
        f'<div class="press-list">{items}</div>'
    )
