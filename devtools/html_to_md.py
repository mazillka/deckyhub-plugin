"""Markdown copies of the site's Help and Guide pages (docs/help.md, docs/guide.md and their Ukrainian twins), made from
the pages themselves so the two cannot drift: `python devtools/html_to_md.py` rewrites them, and a test fails when they
are out of date. Only the tags those pages use are handled."""

import re
import sys
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://deckyhub.com/"
PAGES = ("help", "guide")


def github_slug(text: str) -> str:
    text = unescape(re.sub(r"<[^>]+>", "", text)).strip().lower()
    return re.sub(r"[^\w\- ]", "", text).replace(" ", "-")


class Converter(HTMLParser):
    def __init__(self, base: str, anchors: dict[str, str]):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.anchors = anchors
        self.out: list[str] = []
        self.href: list[str] = []
        self.lists: list[list] = []  # [ordered?, counter]
        self.skip = 0
        self.in_pre = False
        self.in_main = False

    def link(self, url: str) -> str:
        if url.startswith(("http://", "https://", "mailto:")):
            return url
        if url.startswith("#"):
            return "#" + self.anchors.get(url[1:], url[1:])  # a heading's id, as GitHub names its anchor
        return SITE + (self.base + url).lstrip("/") if not url.startswith("/") else SITE + url.lstrip("/")

    def write(self, text: str) -> None:
        if not self.skip:
            self.out.append(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "main":
            self.in_main = True
        if not self.in_main or tag in ("script", "style", "nav", "svg"):
            self.skip += tag in ("script", "style", "nav", "svg")
            return
        if tag in ("h1", "h2", "h3"):
            self.write("\n\n" + "#" * int(tag[1]) + " ")
        elif tag == "p":
            self.write("\n\n")
        elif tag in ("ul", "ol"):
            self.lists.append([tag == "ol", 0])
            self.write("\n")
        elif tag == "li":
            ordered, _ = self.lists[-1] if self.lists else (False, 0)
            if self.lists:
                self.lists[-1][1] += 1
            indent = "  " * max(len(self.lists) - 1, 0)
            self.write(f"\n{indent}{self.lists[-1][1]}. " if ordered else f"\n{indent}- ")
        elif tag == "summary":
            self.write("\n\n### ")
        elif tag in ("strong", "b"):
            self.write("**")
        elif tag in ("em", "i"):
            self.write("*")
        elif tag == "code" and not self.in_pre:
            self.write("`")
        elif tag == "pre":
            self.in_pre = True
            self.write("\n\n```\n")
        elif tag == "a":
            self.href.append(attrs.get("href", ""))
            self.write("[")
        elif tag == "img":
            alt = attrs.get("alt", "")
            src = attrs.get("src", "")
            if src:
                self.write(f"![{alt}]({self.link(src)})")
        elif tag == "br":
            self.write("  \n")
        elif tag == "blockquote":
            self.write("\n\n> ")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "svg"):
            self.skip = max(self.skip - 1, 0)
            return
        if tag == "main":
            self.in_main = False
        if not self.in_main:
            return
        if tag in ("ul", "ol"):
            if self.lists:
                self.lists.pop()
            self.write("\n")
        elif tag in ("strong", "b"):
            self.write("**")
        elif tag in ("em", "i"):
            self.write("*")
        elif tag == "code" and not self.in_pre:
            self.write("`")
        elif tag == "pre":
            self.in_pre = False
            self.write("\n```\n")
        elif tag == "a":
            url = self.href.pop() if self.href else ""
            self.write(f"]({self.link(url)})")
        elif tag == "summary":
            self.write("\n")

    def handle_data(self, data):
        if self.skip or not self.in_main:
            return
        self.write(data if self.in_pre else re.sub(r"\s+", " ", data))


def convert(html: str, base: str = "") -> str:
    # Table cells are small: collect each row as a pipe line before the generic pass.
    def table(match: re.Match) -> str:
        rows = re.findall(r"<tr>(.*?)</tr>", match.group(0), re.S)
        lines = []
        for number, row in enumerate(rows):
            cells = [
                re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", cell)).strip().replace("|", "\\|")
                for cell in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.S)
            ]
            lines.append("| " + " | ".join(cells) + " |")
            if number == 0:
                lines.append("| " + " | ".join("---" for _ in cells) + " |")
        return "<p>@@TABLE@@" + "@@NL@@".join(lines) + "@@END@@</p>"

    html = re.sub(r"<table.*?</table>", table, html, flags=re.S)
    anchors = {
        m.group(1): github_slug(m.group(2)) for m in re.finditer(r'<h[23] id="([^"]+)"[^>]*>(.*?)</h[23]>', html, re.S)
    }
    parser = Converter(base, anchors)
    parser.feed(html)
    text = "".join(parser.out)
    text = text.replace("@@NL@@", "\n").replace("@@TABLE@@", "").replace("@@END@@", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return unescape(text) + "\n"


def source(name: str, uk: bool) -> str:
    """The page's HTML, with the Help page's steps filled in from the guide like the site build does."""
    folder = ROOT / "docs" / ("uk" if uk else "")
    html = (folder / f"{name}.html").read_text(encoding="utf-8")
    if name == "help":
        sys.path.insert(0, str(ROOT / "devtools"))
        import plugin_pages

        guide = (folder / "guide.html").read_text(encoding="utf-8")
        html = re.sub(
            r"<!-- steps: guide#(.+?) -->", lambda match: plugin_pages.guide_steps(guide, match.group(1)), html
        )
    return html


def build() -> dict[Path, str]:
    result = {}
    for uk in (False, True):
        for name in PAGES:
            body = convert(source(name, uk), "uk/" if uk else "")
            result[ROOT / "docs" / ("uk" if uk else "") / f"{name}.md"] = (
                f"<!-- A copy of deckyhub.com/{'uk/' if uk else ''}{name}.html, made by devtools/html_to_md.py: edit the page, not this file. -->\n\n"
                + body
            )
    return result


if __name__ == "__main__":
    for path, text in build().items():
        path.write_text(text, encoding="utf-8", newline="\n")
        print("wrote", path.relative_to(ROOT), len(text) // 1024, "KB")
