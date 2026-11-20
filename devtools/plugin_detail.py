"""A plugin's own page, plugins/<id>.html: its facts, badges, install steps, release notes and scans."""

from html import escape

from catalog_pages import category_url
from issues_page import prerelease_only
from page_shell import SITE, PageSpec, json_ld, page
from page_text import compact, fit, nice_date, owner_of, plain_notes
from plugin_badges import NOT_REVIEWED, badges_of, safety_chips
from plugin_data import store_activity, total_downloads, valid_count
from remote_panel import remote_install_picker
from scan_format import security_scans


def whats_new(releases: list | None, repo_url: str) -> str:
    """The newest stable release's notes (the newest pre-release's when there is no stable one), as a page section."""
    notes_of = [item for item in releases or [] if plain_notes(item.get("body"))]
    release = next((item for item in notes_of if not item.get("prerelease")), notes_of[0] if notes_of else None)
    if not release or not release.get("tag_name"):
        return ""
    url = release.get("html_url") or ""
    if not url.startswith(repo_url + "/"):
        url = f"{repo_url}/releases"
    when = nice_date(release.get("published_at"))
    label = f"{release['tag_name']} (pre-release)" if release.get("prerelease") else release["tag_name"]
    return (
        f'<h2 id="whats-new">What&#8217;s new in {escape(label)}</h2>'
        f"<p>{escape(plain_notes(release.get('body')))}</p>"
        f'<p class="note">From the plugin author&#8217;s release notes{" of " + when if when else ""}. '
        f'<a href="{escape(url)}">Read them in full on GitHub</a>.</p>'
    )


STORE_ONLY_NOTE = '<p class="note">Its author distributes it through the <a href="https://plugins.deckbrew.xyz/plugins">Decky store</a>. DeckyHub lists it but offers no GitHub download: install it from the store inside Decky.</p>'


def install_steps(app: dict, name: str) -> str:
    """The "How to install" steps: through DeckyHub, or for a plugin only in the Decky store, through Decky's own store."""
    if app.get("store"):
        steps = [
            "Open Decky Loader's Quick Access menu (the plug icon) in Gaming Mode and choose <strong>Store</strong>.",
            f"Search for <strong>{escape(name)}</strong>.",
            "Press <strong>Install</strong>. Decky Loader downloads it from its "
            '<a href="https://plugins.deckbrew.xyz/plugins">store</a>, so the install counts for its author there.',
        ]
    else:
        steps = [
            'Get <a href="/#install">DeckyHub</a> on your Steam Deck if you do not have it yet.',
            f"In Gaming Mode open DeckyHub's <strong>Discover</strong> tab and search for <strong>{escape(name)}</strong>.",
            "Press <strong>Install</strong>. DeckyHub hands the release to "
            '<a href="https://decky.xyz/">Decky Loader</a>'
            "'s own installer and checks its SHA-256 whenever GitHub publishes one.",
        ]
    return "\n".join(f"<li><span>{step}</span></li>" for step in steps)


def plugin_page(
    shell: dict[str, str],
    app: dict,
    stats: dict,
    scans: dict,
    warnings: dict,
    others: list[dict],
    reports: dict | None = None,
    vt_reports: dict | None = None,
    *,
    releases: list | None = None,
    same_author: list[dict] | None = None,
    shares_name: bool = False,
) -> str:
    name, repo, category, description = app["name"], app["repo"], app["category"], app.get("description") or ""
    repo_url = f"https://github.com/{repo}"
    owner = owner_of(app)
    facts = [
        f"<li><strong>{escape(category)}</strong>Category</li>",
        f'<li><strong><a href="https://github.com/{escape(owner)}">{escape(owner)}</a></strong>Author</li>',
    ]
    total = total_downloads(stats)
    store_count = store_activity(stats)
    github_count = stats.get("downloads")
    github_count = github_count if valid_count(github_count) else None
    if total is not None:
        facts.append(
            f"<li><strong>{compact(total)}</strong>Approximate activity (repeat downloads included; not unique installs)</li>"
        )
    if github_count is not None:
        facts.append(f"<li><strong>{compact(github_count)}</strong>GitHub downloads</li>")
    if store_count is not None:
        activity = (stats.get("store") or {}).get("activity")
        label = "Decky store downloads + updates" if activity else "Decky store downloads"
        facts.append(
            f'<li><strong>{compact(store_count)}</strong><a href="https://plugins.deckbrew.xyz/plugins">{label}</a> (matched by name)</li>'
        )
    if stats.get("stars") is not None:
        facts.append(f"<li><strong>{compact(stats['stars'])}</strong>GitHub stars</li>")
    if stats.get("updated"):
        facts.append(f"<li><strong>{nice_date(stats['updated'])}</strong>Latest release</li>")
    # A plugin only in the Decky store has no release worth judging in its repository (what is left there is an old
    # build): its scans, audit warnings and root flag would describe something nobody installs, so none are shown.
    if app.get("store"):
        scans, reports, vt_reports = {}, {}, {}
        stats = {
            key: value
            for key, value in stats.items()
            if key not in ("root", "fork", "warnings", "prereleaseWarnings", "ai", "rust")
        }
    badges = badges_of(stats, scans, warnings, reports, vt_reports)
    if not app.get("store") and prerelease_only(releases or []):
        badges.insert(
            0,
            '<li><span class="badge warn">Pre-release only</span> It has no stable release, so DeckyHub offers its pre-releases, which may be unfinished or buggy.</li>',
        )
    # A plugin with no scan record must not read as all clear: say that nothing is known.
    if not app.get("store") and not (scans.get("stable") or scans.get("prerelease")):
        badges.insert(
            0,
            '<li><span class="badge warn">Not scanned yet</span> DeckyHub has no virus scan result for the releases of this plugin, so these labels can&#8217;t tell you anything about them, either way.</li>',
        )
    # A pre-release scanned beside the stable one: say what a pre-release is.
    if not app.get("store") and scans.get("prerelease") and not prerelease_only(releases or []):
        badges.insert(
            0,
            '<li><span class="badge warn">Pre-release</span> A pre-release of this plugin is scanned too. It may be unfinished or buggy, and DeckyHub installs it only if you choose its Pre-release channel.</li>',
        )
    if not description.strip():
        badges.insert(
            0,
            '<li><span class="badge warn">No description</span> Its author hasn\'t said what it does. Check its repository before installing.</li>',
        )
    related = [other for other in others if other["id"] != app["id"]][:6]
    mine = [other for other in same_author or [] if other["id"] != app["id"]][:8]
    crumbs = (
        f'<p class="crumbs"><a href="/">DeckyHub</a> › <a href="/plugins/">Plugins</a> › '
        f'<a href="{category_url(category)}">{escape(category)}</a> › {escape(name)}</p>'
    )
    store_only = bool(app.get("store"))
    scan_details = (
        '<details class="more"><summary>Security</summary>'
        "<p>DeckyHub has no GitHub release of this plugin to scan, so it shows no scan results here. "
        'It is distributed through the <a href="https://plugins.deckbrew.xyz/plugins">Decky store</a>, whose team reviews what it lists. '
        f"Check its repository before installing: DeckyHub doesn't make, review or vouch for {escape(name)}.</p></details>"
        if store_only
        else f"""<details class="more"><summary>Security scan details</summary>
<p>Every ZIP DeckyHub offers is scanned with ClamAV and with YARA rules (YARA Forge's core set), and the same scans are shown in the app. The registry also sends each ZIP to VirusTotal and MetaDefender, uploading it if they haven't seen it yet, and their results are matched by the file's SHA-256.</p>
{security_scans(scans, reports or {}, vt_reports)}
<p class="note">DeckyHub doesn't make, review or vouch for {escape(name)}; it installs at your own risk. The scans only catch known malware, and malware can be built to get past them, so a clean scan isn't proof of safety. Only the <a href="https://plugins.deckbrew.xyz/">Decky plugin store</a> reviews plugins by hand. Check its repository before installing.</p>
</details>"""
    )
    body = f"""{crumbs}
<h1>{escape(name)}</h1>
<p class="lead">{escape(description)}</p>
{STORE_ONLY_NOTE if app.get("store") else ""}<p class="cta"><a class="btn" href="#how-to-install">{"Install from the Decky store" if app.get("store") else "Install with DeckyHub"}</a><a class="btn ghost" href="{escape(repo_url)}">Source on GitHub</a>{"" if app.get("store") else '<button type="button" class="btn ghost" id="remote-open" aria-haspopup="dialog">Send to device (experimental)</button>'}</p>
<ul class="facts">{"".join(facts)}<li class="wide"><strong><a href="{escape(repo_url)}">{escape(repo)}</a></strong>Repository</li></ul>
<h2 id="safety">Safety at a glance</h2>
{safety_chips(badges)}
<p class="note">{NOT_REVIEWED}</p>
<details class="more"><summary>What these labels mean</summary>
{"<ul class='badges'>" + "".join(badges) + "</ul>" if badges else "<p>No labels: it doesn't run as root, and no audit warnings or virus scan findings are known for it.</p>"}
<p class="note">Browsing this plugin on GitHub? The free <a href="https://github.com/mazillka/deckyhub-ext">Deckyhub browser extension</a> shows these labels and scans there.</p>
</details>
{"" if app.get("store") else whats_new(releases, repo_url)}
<h2 id="how-to-install">How to install</h2>
<ol class="steps">
{install_steps(app, name)}
</ol>
<p class="note">Check that the owner and repository, <strong>{escape(repo)}</strong>, are the ones you expect: a plugin's name alone may not identify the right project. {"You can also download" if app.get("store") else "Prefer your phone or computer? Use <em>Send to device</em> above, or download"} the ZIP from its <a href="{escape(repo_url)}/releases">releases</a> and install it from Decky's developer settings.</p>
{"" if app.get("store") else remote_install_picker(app["id"], badges)}
{scan_details}
{f'<h2>More from {escape(owner)}</h2><ul class="list">' + "".join(f'<li><a href="/plugins/{escape(other["id"])}.html">{escape(other["name"])}<small>{escape(other.get("description") or "")}</small></a></li>' for other in mine) + "</ul>" if mine else ""}
{f'<h2>More {escape(category)} plugins</h2><ul class="list">' + "".join(f'<li><a href="/plugins/{escape(other["id"])}.html">{escape(other["name"])}<small>{escape(other.get("description") or "")}</small></a></li>' for other in related) + f'</ul><p><a href="{category_url(category)}">See all {len(others)} {escape(category)} plugins</a></p>' if related else ""}"""
    data = {
        "@type": "SoftwareApplication",
        "name": name,
        "description": description,
        "url": f"{SITE}plugins/{app['id']}.html",
        "applicationCategory": "UtilitiesApplication",
        "applicationSubCategory": f"Decky Loader plugin: {category}",
        "operatingSystem": "SteamOS",
        "sameAs": [repo_url],
        "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
    }
    if total_downloads(stats) is not None:
        data["interactionStatistic"] = {
            "@type": "InteractionCounter",
            "interactionType": "https://schema.org/DownloadAction",
            "userInteractionCount": total_downloads(stats),
        }
    if stats.get("updated"):
        data["dateModified"] = stats["updated"]
    trail = json_ld(
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "DeckyHub", "item": SITE},
                {"@type": "ListItem", "position": 2, "name": "Plugins", "item": f"{SITE}plugins/"},
                {"@type": "ListItem", "position": 3, "name": category, "item": SITE + category_url(category)[1:]},
                {"@type": "ListItem", "position": 4, "name": name},
            ],
        }
    )
    # Search results show about 60 characters of a title and 155 of a description.
    # Two plugins can share a name (a fork and the original): the owner tells their pages apart.
    shown = f"{name} ({owner})" if shares_name else name
    title = f"{shown}: Decky Loader plugin | DeckyHub"
    if len(title) > 70:
        title = f"{fit(shown, 40)} | DeckyHub"
    tail = " A Decky Loader plugin; install it from Gaming Mode with DeckyHub."
    cut = fit(description.rstrip("."), 155 - len(tail))
    summary = (
        cut + ("" if cut.endswith("…") else ".") + tail
        if description
        else f"{name}, a {category} Decky Loader plugin. Install and update it from Gaming Mode with DeckyHub."
    )
    summary = fit(summary, 160)
    return page(shell, PageSpec(title, summary, f"plugins/{app['id']}.html", body, [trail, json_ld(data)]))
