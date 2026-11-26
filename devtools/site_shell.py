"""The menu, the footer and the menu's style every deckyhub.com page shares.

Pages hold placeholders instead of their own copies: `<!-- site-nav: plugins -->` (the name says
which menu entry is the current page), `<!-- site-footer -->` and, inside a <style> block,
`/* site-nav-style */`. build-site.py and plugin_pages.py fill them in with apply().
"""

import re

SITE = "https://deckyhub.com/"
REPO = "https://github.com/mazillka/deckyhub-plugin"

# key, label, address
LINKS = [
    ("home", "Home", SITE),
    ("plugins", "Plugins", SITE + "plugins/"),
    ("paired-devices", "Paired devices", SITE + "paired-devices/"),
    ("install", "Install", SITE + "#install"),
    ("releases", "Release notes", SITE + "releases.html"),
    ("help", "Help", SITE + "help.html"),
    ("about", "About", SITE + "about.html"),
    ("contribute", "Contribute", SITE + "contribute/"),
]

# The same menu in Ukrainian for deckyhub.com/uk/. Plugin pages and release notes stay English.
LINKS_UK = [
    ("home", "Головна", SITE + "uk/"),
    ("plugins", "Плагіни", SITE + "plugins/"),
    ("paired-devices", "Сполучені пристрої", SITE + "uk/paired-devices/"),
    ("install", "Встановлення", SITE + "uk/#install"),
    ("releases", "Нотатки до релізів", SITE + "releases.html"),
    ("help", "Довідка", SITE + "uk/help.html"),
    ("about", "Про проєкт", SITE + "uk/about.html"),
    ("contribute", "Долучитися", SITE + "uk/contribute/"),
]

NAV_STYLE = """nav.site-nav{position:sticky;top:0;z-index:5;background:rgba(16,21,31,.94);backdrop-filter:blur(8px);border-bottom:1px solid #2e405a}
nav.site-nav .site-nav-inner{max-width:1100px;margin:auto;padding:0 20px;display:flex;align-items:center;gap:24px;min-height:56px}
nav.site-nav .site-brand{flex:none;color:#eef4ff;font-weight:700;text-decoration:none}
nav.site-nav .site-links{display:flex;gap:20px;align-items:center;overflow-x:auto;white-space:nowrap;margin-left:auto;scrollbar-width:thin}
nav.site-nav .site-links a{color:#b6c3d4;text-decoration:none;font-size:.95rem;padding:16px 0}
nav.site-nav .site-links a:hover,nav.site-nav .site-links a[aria-current=page]{color:#fff}
nav.site-nav a:focus-visible{outline:2px solid #4b9cf0;outline-offset:3px}
@media(max-width:640px){nav.site-nav .site-nav-inner{padding:0 16px;gap:16px}nav.site-nav .site-links{gap:16px}}
/* A short screen (the Steam Deck's browser is about 914x520, a phone held sideways less) needs the room for reading: the menu scrolls away. */
@media(max-height:600px){nav.site-nav{position:static}}
.skip{position:absolute;left:-9999px;top:8px;z-index:20;background:#fff;color:#10151f;padding:8px 14px;border-radius:6px;font-weight:600;text-decoration:none}.skip:focus{left:8px}
footer a{display:inline-block;padding:4px 0}"""

# The site's animations: CSS only (no script to download or run), and all of it off when the
# system asks for less motion. Nothing is hidden where a browser lacks a feature.
MOTION_STYLE = """@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media screen and (prefers-reduced-motion:no-preference){
/* Pages cross-fade into each other; the menu stays put. */
@view-transition{navigation:auto}
nav.site-nav{view-transition-name:site-nav}
/* From .01, not 0: Chrome doesn't count a fully transparent hero as painted, which would delay LCP. */
@keyframes site-rise{from{opacity:.01;transform:translateY(18px)}to{opacity:1;transform:none}}
header>.wrap>*{animation:site-rise .6s cubic-bezier(.2,.8,.2,1) both}
header>.wrap>:nth-child(2){animation-delay:.07s}header>.wrap>:nth-child(3){animation-delay:.14s}
header>.wrap>:nth-child(4){animation-delay:.2s}header>.wrap>:nth-child(n+5){animation-delay:.26s}
/* Sections rise in as they scroll into view. */
@supports (animation-timeline:view()){
section h2,.card,.promo,figure,ol.steps>li,details{animation:site-rise linear both;animation-timeline:view();animation-range:entry 0% entry 80%}
.promo figure{animation:none}
}
details[open]>:not(summary){animation:site-rise .25s ease both}
/* Hover moves with `translate`, which the scroll animation's `transform` doesn't override. */
.btn,.card,a.app,.list a,.chips button{transition:translate .18s ease,scale .12s ease,box-shadow .18s ease,border-color .18s ease,background-color .18s ease}
.btn:active,.chips button:active{scale:.97}
@media(hover:hover){
.btn:hover,a.app:hover,.list a:hover{translate:0 -2px}
.card:hover{translate:0 -4px;border-color:#4b9cf0;box-shadow:0 12px 28px rgba(0,0,0,.35)}
}
nav.site-nav .site-links a{background:linear-gradient(#4b9cf0,#4b9cf0) 0 calc(100% - 8px)/0 2px no-repeat;transition:background-size .2s ease,color .2s ease}
nav.site-nav .site-links a:hover,nav.site-nav .site-links a:focus-visible,nav.site-nav .site-links a[aria-current=page]{background-size:100% 2px}
}"""

FOOTER = (
    '<footer><div class="wrap">\n'
    f'<div>DeckyHub is open source under GPL-3.0-or-later · <a href="{REPO}">Source</a> · <a href="{SITE}releases.html">Release notes</a> · '
    f'<a href="{SITE}press">Press</a> · <a href="{REPO}/issues">Report an issue</a> · <a href="{REPO}/releases.atom">Releases feed</a> · <a href="{SITE}about.html#support">Support</a></div>\n'
    "<div><strong>Disclaimer:</strong> Not affiliated with Valve or the Decky Loader project. Plugin information comes from public GitHub "
    "repositories, and every plugin belongs to its own authors; DeckyHub doesn't review, own or endorse them. Plugins are installed at your own "
    "risk, so look at a plugin's repository before you install it.</div>\n"
    "</div></footer>"
)


FOOTER_UK = (
    '<footer><div class="wrap">\n'
    f'<div>DeckyHub має відкритий код за ліцензією GPL-3.0-or-later · <a href="{REPO}">Код</a> · <a href="{SITE}releases.html">Нотатки до релізів</a> · '
    f'<a href="{SITE}press">Преса</a> · <a href="{REPO}/issues">Повідомити про проблему</a> · <a href="{REPO}/releases.atom">Стрічка релізів</a> · <a href="{SITE}uk/about.html#support">Підтримка</a></div>\n'
    "<div><strong>Відмова від відповідальності:</strong> Не пов'язаний із Valve чи проєктом Decky Loader. Інформація про плагіни надходить із публічних "
    "репозиторіїв GitHub, а кожен плагін належить його авторам; DeckyHub не перевіряє, не володіє й не схвалює їх. Плагіни встановлюються на ваш "
    "власний ризик, тож перегляньте репозиторій плагіна перед встановленням.</div>\n"
    "</div></footer>"
)


def nav(current: str | None = None, lang: str = "en", switch: tuple[str, str, str] | None = None) -> str:
    """switch: (label, address, hreflang) of the same page in the other language, last in the menu."""
    uk = lang == "uk"
    links = "".join(
        f'<a href="{address}"' + (' aria-current="page"' if key == current else "") + f">{label}</a>"
        for key, label, address in (LINKS_UK if uk else LINKS)
    ) + (f'<a href="{switch[1]}" hreflang="{switch[2]}" lang="{switch[2]}">{switch[0]}</a>' if switch else "")
    return (
        f'<nav class="site-nav" aria-label="{"Головна навігація" if uk else "Main navigation"}"><div class="site-nav-inner"><a class="site-brand" href="{SITE + "uk/" if uk else SITE}">DeckyHub</a>'
        f'<div class="site-links">{links}</div></div></nav>'
    )


def apply(page: str, lang: str = "en", switch: tuple[str, str, str] | None = None) -> str:
    """The page with its shell placeholders filled in (in Ukrainian for lang="uk")."""
    page = re.sub(r"<!-- site-nav(?::\s*([\w-]+))? -->", lambda match: nav(match.group(1), lang, switch), page)
    return page.replace("<!-- site-footer -->", FOOTER_UK if lang == "uk" else FOOTER).replace(
        "/* site-nav-style */", NAV_STYLE + chr(10) + MOTION_STYLE
    )
