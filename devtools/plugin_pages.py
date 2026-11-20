"""Per-plugin pages for deckyhub.com (plugins/<id>.html), written by build-site.py.

Each page has what the catalog knows about a plugin: description, category, downloads, stars, latest release, badges
and its security scans; the catalog, category, Known issues and Paired devices pages are written here too.
The code lives in one module per concern (page_shell, page_text, plugin_data, scan_format, plugin_badges,
remote_panel, plugin_detail, catalog_pages, issues_page); this module writes the files and re-exports every name
the pages ever had, so `import plugin_pages` keeps working for build-site.py, audit-site.py and the tests.
"""

import collections
import json
import time

from catalog_pages import (
    CARD_LEGEND,
    CARD_TIP,
    CATEGORY_SHOWN,
    FILTER_JS,
    by_downloads,
    card,
    catalog_page,
    category_links,
    category_page,
    category_url,
    popular_cards,
)
from issues_page import issues_page, prerelease_only, version_mismatch, version_number
from page_shell import EXTRA_STYLE, SITE, PageSpec, json_ld, page, shell_of
from page_text import compact, fit, guide_steps, inline_markdown, nice_date, owner_of, plain_notes, readme_steps, slug
from plugin_badges import BADGE_LABEL, NOT_REVIEWED, badges_of, flags_of, safety_chips
from plugin_data import (
    MAX_SAFE_COUNT,
    METADEFENDER_URL,
    REGISTRY_RAW,
    RELEASES_URL,
    SCANS_URL,
    STATS_URL,
    VIRUSTOTAL_URL,
    WARNINGS,
    fetch,
    fetch_json,
    load_data,
    plugin_info,
    store_activity,
    total_downloads,
    valid_count,
)
from plugin_detail import STORE_ONLY_NOTE, install_steps, plugin_page, whats_new
from remote_panel import paired_devices_page, remote_device_panel, remote_install_picker, safety_block
from scan_format import (
    EXTERNAL_STATUS,
    SCAN_LABELS,
    SCAN_RESULTS,
    SCANNERS,
    external_results,
    md_result,
    scan_kind,
    scan_results,
    scan_state,
    security_scans,
    source_mismatch,
    vt_result,
)

__all__ = [
    "BADGE_LABEL",
    "CARD_LEGEND",
    "CARD_TIP",
    "CATEGORY_SHOWN",
    "EXTERNAL_STATUS",
    "EXTRA_STYLE",
    "FILTER_JS",
    "MAX_SAFE_COUNT",
    "METADEFENDER_URL",
    "NOT_REVIEWED",
    "REGISTRY_RAW",
    "RELEASES_URL",
    "SCANNERS",
    "SCANS_URL",
    "SCAN_LABELS",
    "SCAN_RESULTS",
    "SITE",
    "STATS_URL",
    "STORE_ONLY_NOTE",
    "VIRUSTOTAL_URL",
    "WARNINGS",
    "badges_of",
    "by_downloads",
    "card",
    "catalog_page",
    "category_links",
    "category_page",
    "category_url",
    "compact",
    "external_results",
    "fetch",
    "fetch_json",
    "fit",
    "flags_of",
    "guide_steps",
    "inline_markdown",
    "install_steps",
    "issues_page",
    "json_ld",
    "load_data",
    "md_result",
    "nice_date",
    "owner_of",
    "PageSpec",
    "page",
    "paired_devices_page",
    "plain_notes",
    "plugin_info",
    "plugin_page",
    "popular_cards",
    "prerelease_only",
    "readme_steps",
    "remote_device_panel",
    "remote_install_picker",
    "safety_block",
    "safety_chips",
    "scan_kind",
    "scan_results",
    "scan_state",
    "security_scans",
    "shell_of",
    "slug",
    "source_mismatch",
    "store_activity",
    "total_downloads",
    "valid_count",
    "version_mismatch",
    "version_number",
    "vt_result",
    "whats_new",
    "write_pages",
]


def write_pages(out, apps: list[dict], releases_page: str, data: dict) -> list[tuple[str, str]]:
    """Writes plugins/index.html and plugins/<id>.html for every plugin; returns (url, lastmod) for the sitemap."""
    shell = shell_of(releases_page)
    stats, scans, reports, warnings = data["stats"], data["scans"], data["reports"], data["warnings"]
    (out / "plugins").mkdir(exist_ok=True)
    today = time.strftime("%Y-%m-%d", time.gmtime())
    (out / "plugins" / "index.html").write_text(catalog_page(shell, apps, data), encoding="utf-8")
    (out / "plugins" / "known-issues.html").write_text(issues_page(shell, apps, data), encoding="utf-8")
    (out / "plugins" / "info.json").write_text(
        json.dumps(plugin_info(apps, data), separators=(",", ":"), sort_keys=True), encoding="utf-8"
    )
    by_category: dict[str, list[dict]] = {}
    for app in apps:
        by_category.setdefault(app["category"], []).append(app)
    counts = {name: len(members) for name, members in by_category.items()}
    (out / "plugins" / "category").mkdir(exist_ok=True)
    category_urls = []
    for name, members in by_category.items():
        (out / "plugins" / "category" / f"{slug(name)}.html").write_text(
            category_page(shell, name, members, data, counts), encoding="utf-8"
        )
        newest = max(
            ((data["stats"].get(app["repo"].casefold()) or {}).get("updated") or "" for app in members), default=""
        )
        category_urls.append((f"{SITE}plugins/category/{slug(name)}.html", newest[:10] or today))
    remote_page = paired_devices_page(shell)
    (out / "remote-install").mkdir(exist_ok=True)
    (out / "remote-install" / "index.html").write_text(remote_page, encoding="utf-8")
    (out / "paired-devices").mkdir(exist_ok=True)
    (out / "paired-devices" / "index.html").write_text(
        paired_devices_page(
            shell,
            "Manage paired devices | DeckyHub",
            "Choose a paired device to review, install or remove Decky plugins.",
            path="paired-devices/",
        ),
        encoding="utf-8",
    )
    # The same page in Ukrainian, under /uk/ like the rest of the Ukrainian site.
    uk_texts = {
        "remote-install": (
            "Сполучені пристрої | DeckyHub",
            "Сполучіть пристрій і керуйте його встановленими плагінами Decky.",
        ),
        "paired-devices": (
            "Керування сполученими пристроями | DeckyHub",
            "Виберіть сполучений пристрій, щоб переглянути, встановити або видалити плагіни Decky.",
        ),
    }
    for folder, (uk_title, uk_description) in uk_texts.items():
        (out / "uk" / folder).mkdir(parents=True, exist_ok=True)
        (out / "uk" / folder / "index.html").write_text(
            paired_devices_page(shell, uk_title, uk_description, lang="uk", path=f"uk/{folder}/"),
            encoding="utf-8",
        )
    (out / "paired-devices.html").write_text(
        paired_devices_page(
            shell,
            "Device pairing | DeckyHub",
            "Open your saved DeckyHub pairing link and manage plugins on your device.",
            # The same page as /paired-devices/ (a link people already saved): it names that one as its canonical.
            path="paired-devices/",
        ),
        encoding="utf-8",
    )
    urls = [
        (f"{SITE}plugins/", today),
        (f"{SITE}plugins/known-issues.html", today),
        (f"{SITE}remote-install/", today),
        *category_urls,
        (f"{SITE}paired-devices/", today),
        (f"{SITE}uk/paired-devices/", today),
        (f"{SITE}uk/remote-install/", today),
    ]
    name_counts = collections.Counter(app["name"].casefold() for app in apps)
    by_author: dict[str, list[dict]] = {}
    for app in apps:
        by_author.setdefault(owner_of(app).casefold(), []).append(app)
    for app in apps:
        key = app["repo"].casefold()
        others = [other for other in apps if other["category"] == app["category"]]
        (out / "plugins" / f"{app['id']}.html").write_text(
            plugin_page(
                shell,
                app,
                stats.get(key) or {},
                scans.get(key) or {},
                warnings,
                others,
                reports,
                data.get("vt"),
                releases=(data.get("releases") or {}).get(key),
                same_author=by_author[owner_of(app).casefold()],
                shares_name=name_counts[app["name"].casefold()] > 1,
            ),
            encoding="utf-8",
        )
        urls.append((f"{SITE}plugins/{app['id']}.html", ((stats.get(key) or {}).get("updated") or today)[:10]))
    return urls
