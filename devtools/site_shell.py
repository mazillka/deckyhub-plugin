"""The menu, the footer and the menu's style that deckyhub.com and registry.deckyhub.com share.

Pages hold placeholders instead of their own copies: `<!-- site-nav: plugins -->` (the name says
which menu entry is the current page), `<!-- site-footer -->` and, inside a <style> block,
`/* site-nav-style */`. build-site.py and plugin_pages.py fill them in with apply().

mazillka/deckyhub-registry keeps a verbatim copy of this file (scripts/site_shell.py) so its pages
look the same. Change both together.
"""
import re

SITE = "https://deckyhub.com/"
REGISTRY = "https://registry.deckyhub.com/"
REPO = "https://github.com/mazillka/deckyhub-plugin"

# key, label, address
LINKS = [
    ("home", "Home", SITE),
    ("plugins", "Plugins", SITE + "plugins/"),
    ("install", "Install", SITE + "#install"),
    ("releases", "Release notes", SITE + "releases.html"),
    ("contribute", "Contribute", REGISTRY),
]

NAV_STYLE = """nav.site-nav{position:sticky;top:0;z-index:5;background:rgba(16,21,31,.94);backdrop-filter:blur(8px);border-bottom:1px solid #2e405a}
nav.site-nav .site-nav-inner{max-width:1100px;margin:auto;padding:0 20px;display:flex;align-items:center;gap:24px;min-height:56px}
nav.site-nav .site-brand{flex:none;color:#eef4ff;font-weight:700;text-decoration:none}
nav.site-nav .site-links{display:flex;gap:20px;align-items:center;overflow-x:auto;white-space:nowrap;margin-left:auto;scrollbar-width:thin}
nav.site-nav .site-links a{color:#b6c3d4;text-decoration:none;font-size:.95rem;padding:16px 0}
nav.site-nav .site-links a:hover,nav.site-nav .site-links a[aria-current=page]{color:#fff}
nav.site-nav a:focus-visible{outline:2px solid #4b9cf0;outline-offset:3px}
@media(max-width:640px){nav.site-nav .site-nav-inner{padding:0 16px;gap:16px}nav.site-nav .site-links{gap:16px}}
.skip{position:absolute;left:-9999px;top:8px;z-index:20;background:#fff;color:#10151f;padding:8px 14px;border-radius:6px;font-weight:600;text-decoration:none}.skip:focus{left:8px}"""

FOOTER = (
    '<footer><div class="wrap">\n'
    f'<div>DeckyHub is open source under GPL-3.0-or-later · <a href="{REPO}">Source</a> · <a href="{SITE}releases.html">Release notes</a> · '
    f'<a href="{REPO}/issues">Report an issue</a> · <a href="{REPO}/releases.atom">Releases feed</a></div>\n'
    "<div><strong>Disclaimer:</strong> Not affiliated with Valve or the Decky Loader project. Plugin information comes from public GitHub "
    "repositories, and every plugin belongs to its own authors; DeckyHub doesn't review, own or endorse them. Plugins are installed at your own "
    "risk, so look at a plugin's repository before you install it.</div>\n"
    "</div></footer>"
)


def nav(current: str | None = None) -> str:
    links = "".join(
        f'<a href="{address}"' + (' aria-current="page"' if key == current else "") + f">{label}</a>" for key, label, address in LINKS
    )
    return (f'<nav class="site-nav" aria-label="Main navigation"><div class="site-nav-inner"><a class="site-brand" href="{SITE}">DeckyHub</a>'
            f'<div class="site-links">{links}</div></div></nav>')


def apply(page: str) -> str:
    """The page with its shell placeholders filled in."""
    page = re.sub(r"<!-- site-nav(?::\s*(\w+))? -->", lambda match: nav(match.group(1)), page)
    return page.replace("<!-- site-footer -->", FOOTER).replace("/* site-nav-style */", NAV_STYLE)
