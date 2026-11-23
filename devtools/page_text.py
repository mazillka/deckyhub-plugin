"""Small text helpers for the generated pages: shortening, release notes, README and guide steps, and number and date formats."""

import collections
import re
import time
from html import escape


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


def fit(text: str, limit: int) -> str:
    """text cut at a word boundary to at most `limit` characters, with an ellipsis when it was cut."""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:.-") + "…"


def with_shared_titles(apps: list[dict]) -> list[dict]:
    """Gives each plugin whose name another one has a "title" saying whose it is: "SteamGridDB by K1tsune12"."""
    counts = collections.Counter(app["name"].casefold() for app in apps)
    return [
        {**app, "title": f"{app['name']} by {owner_of(app)}"} if counts[app["name"].casefold()] > 1 else app
        for app in apps
    ]


def owner_of(app: dict) -> str:
    """The GitHub account a plugin comes from: the registry has no author field of its own."""
    return app["repo"].split("/")[0]


def plain_notes(body: str | None, limit: int = 600) -> str:
    """A release's notes as plain text: code blocks, images, links' addresses, HTML and markdown marks removed, and
    cut at a word boundary. The text is the plugin author's own, so it is only ever escaped, never trusted."""
    text = re.sub(r"```.*?```", " ", body or "", flags=re.S)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>|https?://\S+", " ", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"[*`]", "", text)
    text = re.sub(r"[>|]|^\s*[-+]\s+", " ", text, flags=re.M)
    return fit(re.sub(r"\s+", " ", text).strip(), limit)


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


def guide_steps(guide: str, heading_id: str) -> str:
    """The numbered steps (<li> items) under a heading of the user guide (docs/guide.html), by the heading's id, so the
    Help page says what the guide says."""
    section = guide.split(f'id="{heading_id}"', 1)[1]
    steps = re.search(r"<ol>(.*?)</ol>", section, re.S)
    if not steps:
        raise SystemExit(f"the guide has no numbered steps under #{heading_id}")
    return steps.group(1).strip()


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
