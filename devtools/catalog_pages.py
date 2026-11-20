"""The plugin catalog and category pages, and the plugin cards they and the home page list."""

import time
from html import escape

from page_shell import SITE, PageSpec, json_ld, page
from page_text import compact, fit, owner_of, slug
from plugin_badges import NOT_REVIEWED, flags_of
from plugin_data import total_downloads

# What the numbers on a card mean. The long tooltip is repeated on every card of the home page's short list; the
# catalog and the category pages say it once above their cards instead of 600 times.
CARD_TIP = "Approximate activity: GitHub downloads plus Decky store downloads and updates; includes repeat activity, not unique installs. Store entries are matched by name."


CARD_LEGEND = (
    '<p class="note">↓ approximate activity: GitHub downloads plus Decky store downloads and updates, repeat downloads '
    "included, not unique installs (store entries are matched by name). ★ GitHub stars.</p>"
)


def card(app: dict, data: dict, prefix: str = "/plugins/", tip: bool = False) -> str:
    key = app["repo"].casefold()
    stats, scans = data["stats"].get(key) or {}, data["scans"].get(key) or {}
    meta = " · ".join(
        part
        for part in (
            f'<span title="{CARD_TIP if tip else "Approximate activity"}">↓ {compact(total_downloads(stats))}</span>'
            if total_downloads(stats) is not None
            else "",
            f"★ {compact(stats['stars'])}" if stats.get("stars") is not None else "",
        )
        if part
    )
    description = app.get("description") or ""
    repo = escape(app["repo"].lower())
    in_store = ' data-store="1"' if stats.get("store") else ""
    updated = f' data-updated="{escape(stats["updated"][:10])}"' if stats.get("updated") else ""
    return (
        f'<a class="app" href="{prefix}{escape(app["id"])}.html" data-repo="{repo}" data-cat="{slug(app["category"])}"{in_store}{updated}>'
        f"<small>{escape(app['category'])}</small><strong>{escape(app['name'])}</strong><p>{escape(description)}</p>"
        f'<span class="meta">{meta}</span><span class="flags">{flags_of(stats, scans, data.get("reports"), data.get("vt"), bool(app.get("store")))}</span></a>'
    )


def by_downloads(apps: list[dict], data: dict) -> list[dict]:
    return sorted(apps, key=lambda app: -(total_downloads(data["stats"].get(app["repo"].casefold()) or {}) or 0))


def popular_cards(apps: list[dict], data: dict, count: int = 12, prefix: str = "plugins/") -> str:
    """The home page's short list: the most downloaded plugins, linking to their pages."""
    return "\n".join(card(app, data, prefix, tip=True) for app in by_downloads(apps, data)[:count])


FILTER_JS = """(function(){var q=document.getElementById("q"),cards=[].slice.call(document.querySelectorAll("#list .app")),chips=[].slice.call(document.querySelectorAll(".chips button[data-cat]")),ages=[].slice.call(document.querySelectorAll(".chips button[data-age]")),store=document.getElementById("store-only"),count=document.getElementById("count"),cat="",age=0,inStore=false;
cards.forEach(function(c){c._t=[c.querySelector("strong"),c.querySelector("p"),c.querySelector("small")].map(function(e){return e?e.textContent:""}).join(" ").toLowerCase()+" "+(c.dataset.repo||"")});
function run(){var t=q.value.trim().toLowerCase(),n=0,since=age?new Date(Date.now()-age*864e5).toISOString().slice(0,10):"";cards.forEach(function(c){var ok=(!cat||c.dataset.cat===cat)&&(!inStore||c.dataset.store)&&(!since||(c.dataset.updated||"")>=since)&&(!t||c._t.indexOf(t)>-1);c.hidden=!ok;if(ok)n++});count.textContent=n+" of "+cards.length+" plugins";chips.forEach(function(b){b.setAttribute("aria-pressed",String((b.dataset.cat||"")===cat))});ages.forEach(function(b){b.setAttribute("aria-pressed",String(+b.dataset.age===age))})}
function fromHash(){var m=/^#cat=([a-z0-9-]+)/.exec(location.hash);cat=m?m[1]:"";run()}
chips.forEach(function(b){b.addEventListener("click",function(){cat=b.dataset.cat||"";history.replaceState(null,"",cat?"#cat="+cat:location.pathname);run()})});
ages.forEach(function(b){b.addEventListener("click",function(){age=+b.dataset.age;run()})});
if(store)store.addEventListener("click",function(){inStore=!inStore;store.setAttribute("aria-pressed",String(inStore));run()});
q.addEventListener("input",run);window.addEventListener("hashchange",fromHash);fromHash()})();"""


# A category page lists this many plugins (the most downloaded); the catalog has the rest.
CATEGORY_SHOWN = 60


def category_url(category: str) -> str:
    return f"/plugins/category/{slug(category)}.html"


def category_links(categories: dict[str, int], skip: str = "") -> str:
    """Links to every category page, with their plugin counts, most plugins first."""
    return " · ".join(
        f'<a href="{category_url(name)}">{escape(name)}</a> ({count})'
        for name, count in sorted(categories.items(), key=lambda item: (-item[1], item[0]))
        if name != skip
    )


def category_page(
    shell: dict[str, str], category: str, members: list[dict], data: dict, categories: dict[str, int]
) -> str:
    """plugins/category/<slug>.html: what one category holds, in numbers from the registry's data, and its most
    downloaded plugins linked to their pages."""
    ordered = by_downloads(members, data)
    stats = [data["stats"].get(app["repo"].casefold()) or {} for app in members]
    total = sum(total_downloads(item) or 0 for item in stats)
    since = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 90 * 86400))
    recent = sum(1 for item in stats if (item.get("updated") or "")[:10] >= since)
    authors = len({owner_of(app).casefold() for app in members})
    top = ", ".join(app["name"] for app in ordered[:3])
    facts = [
        f"{len(members)} Decky Loader plugins in {category}, by {authors} {'author' if authors == 1 else 'authors'}.",
        f"The most downloaded are {top}.",
    ]
    if total:
        facts.append(f"Together they have about {compact(total)} approximate downloads (repeat downloads included).")
    if recent:
        facts.append(f"{recent} had a release in the last 90 days.")
    more = (
        f'<p class="note">The {CATEGORY_SHOWN} most downloaded of {len(members)} are shown. '
        f'<a href="/plugins/#cat={slug(category)}">See all {len(members)} {escape(category)} plugins</a> in the catalog.</p>'
        if len(members) > CATEGORY_SHOWN
        else ""
    )
    body = f"""<p class="crumbs"><a href="/">DeckyHub</a> › <a href="/plugins/">Plugins</a> › {escape(category)}</p>
<h1>{escape(category)} Decky plugins</h1>
<p class="lead">{escape(" ".join(facts))} Install any of them from Gaming Mode with <a href="/">DeckyHub</a>.</p>
<p class="note">{NOT_REVIEWED}</p>
{CARD_LEGEND}
<div class="catalog">
{chr(10).join(card(app, data) for app in ordered[:CATEGORY_SHOWN])}
</div>
{more}
<h2>Other categories</h2>
<p>{category_links(categories, category)}</p>"""
    title = f"{category} Decky Loader plugins | DeckyHub"
    summary = fit(
        f"{len(members)} {category} plugins for Decky Loader, including {top}. Install and update them from Gaming Mode with DeckyHub.",
        160,
    )
    path = f"plugins/category/{slug(category)}.html"
    trail = json_ld(
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "DeckyHub", "item": SITE},
                {"@type": "ListItem", "position": 2, "name": "Plugins", "item": f"{SITE}plugins/"},
                {"@type": "ListItem", "position": 3, "name": category},
            ],
        }
    )
    about = json_ld(
        {"@type": "CollectionPage", "name": f"{category} Decky plugins", "description": summary, "url": SITE + path}
    )
    return page(shell, PageSpec(title, summary, path, body, [trail, about]))


def catalog_page(shell: dict[str, str], apps: list[dict], data: dict) -> str:
    """plugins/index.html: every plugin, most downloaded first, with a search box and category chips.
    Without JavaScript the whole list is simply shown."""
    ordered = by_downloads(apps, data)
    categories: dict[str, int] = {}
    for app in apps:
        categories[app["category"]] = categories.get(app["category"], 0) + 1
    chips = f'<button type="button" data-cat="" aria-pressed="true">All {len(apps)}</button>' + "".join(
        f'<button type="button" data-cat="{slug(name)}" aria-pressed="false">{escape(name)} {count}</button>'
        for name, count in sorted(categories.items(), key=lambda item: (-item[1], item[0]))
    )
    ages = "".join(
        f'<button type="button" data-age="{days}" aria-pressed="{"true" if not days else "false"}">{label}</button>'
        for days, label in ((0, "Any release date"), (90, "Released in 90 days"), (365, "Released this year"))
    )
    in_store = sum(1 for app in apps if (data["stats"].get(app["repo"].casefold()) or {}).get("store"))
    if in_store:
        chips += f'<button type="button" id="store-only" aria-pressed="false">In Decky store {in_store}</button>'
    body = f"""<p class="crumbs"><a href="/">DeckyHub</a> › Plugins</p>
<h1>Decky plugins</h1>
<p><a class="btn ghost" href="/remote-install/">Paired devices</a></p>
<p id="remote-device-ready" role="status" hidden>Device details received. Choose a plugin to pair with your device and request installation.</p>
<link rel="modulepreload" href="/remote-core.js"><link rel="modulepreload" href="/remote-i18n.js"><link rel="modulepreload" href="/remote-plugins.js"><link rel="modulepreload" href="/remote-updates.js"><link rel="modulepreload" href="/remote-scan.js"><link rel="modulepreload" href="/remote-share.js"><script type="module" src="/remote-install.js"></script>
<p class="lead">{len(apps)} Decky Loader plugins, most downloaded first. Install any of them from Gaming Mode with <a href="/">DeckyHub</a>, which also checks them for updates.</p>
<p class="note">Every plugin belongs to its authors. DeckyHub doesn't make, review or vouch for them, and a plugin's page shows its notes (AI help, root, audit warnings) and security scans; <a href="/plugins/known-issues.html">Known issues</a> lists every plugin with a warning. Missing one? <a href="/contribute/">Add a plugin</a>.</p>
<p class="note">Browse by category: {category_links(categories)}</p>
<div class="filters"><input id="q" type="search" placeholder="Search plugins" aria-label="Search plugins" autocomplete="off"><div class="chips" role="group" aria-label="Categories">{chips}</div><div class="chips" role="group" aria-label="Latest release">{ages}</div></div>
{CARD_LEGEND}
<p class="note" id="count" aria-live="polite">{len(apps)} plugins</p>
<div class="catalog" id="list">
{chr(10).join(card(app, data) for app in ordered)}
</div>
<script>{FILTER_JS}</script>"""
    listing = json_ld(
        {
            "@type": "CollectionPage",
            "name": "Decky plugins",
            "url": f"{SITE}plugins/",
            "mainEntity": {
                "@type": "ItemList",
                "numberOfItems": len(apps),
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": index + 1,
                        "url": f"{SITE}plugins/{app['id']}.html",
                        "name": app["name"],
                    }
                    for index, app in enumerate(ordered[:100])
                ],
            },
        }
    )
    trail = json_ld(
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "DeckyHub", "item": SITE},
                {"@type": "ListItem", "position": 2, "name": "Plugins"},
            ],
        }
    )
    hundreds = len(apps) // 100 * 100
    title = f"Decky plugins: {hundreds}+ Decky Loader plugins | DeckyHub"
    summary = f"Browse {len(apps)} Decky Loader plugins, with downloads, stars and security scans. Install and update them from Gaming Mode with DeckyHub."
    return page(shell, PageSpec(title, summary, "plugins/", body, [trail, listing]))
