"""deckyhub.com's plugin pages (devtools/plugin_pages.py), built from data passed in: no network."""

import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "devtools"))
import plugin_pages

APP = {
    "id": "decky-multiframegen",
    "name": "Decky MultiFrameGen",
    "repo": "MWGIH/DeckyMultiFrameGen",
    "category": "Frame Generation",
    "description": "Installs OptiScaler, HelixSR and MAKO and picks which one each game uses.",
}
SHA = "c" * 64


class PluginPageTests(unittest.TestCase):
    def page(self, stats=None, scans=None, reports=None, vt=None):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        return plugin_pages.plugin_page(shell, APP, stats or {}, scans or {}, {}, [APP], reports, vt)

    def test_the_page_offers_a_youtube_search_for_the_encoded_name(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        html = plugin_pages.plugin_page(shell, {**APP, "name": 'A & "B"?'}, {}, {}, {}, [APP])
        self.assertIn(
            'href="https://www.youtube.com/results?search_query=A%20%26%20%22B%22%3F%20Decky">Search YouTube</a>', html
        )

    def test_the_page_names_its_author_and_lists_their_other_plugins(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        mate = {**APP, "id": "mate", "name": "Mate", "repo": "MWGIH/Mate", "description": "Another one."}
        html = plugin_pages.plugin_page(shell, APP, {}, {}, {}, [APP], same_author=[APP, mate])
        self.assertIn('<strong><a href="https://github.com/MWGIH">MWGIH</a></strong>Author', html)
        self.assertIn("<h2>More from MWGIH</h2>", html)
        self.assertIn('<a href="/plugins/mate.html">Mate', html)
        self.assertEqual(html.count('href="/plugins/decky-multiframegen.html"'), 0)
        alone = plugin_pages.plugin_page(shell, APP, {}, {}, {}, [APP], same_author=[APP])
        self.assertNotIn("More from", alone)

    def test_the_latest_release_notes_are_plain_escaped_text_with_a_link_to_github(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        release = {
            "tag_name": "v1.2.0",
            "prerelease": False,
            "published_at": "2026-10-20T01:48:22Z",
            "html_url": "https://github.com/MWGIH/DeckyMultiFrameGen/releases/tag/v1.2.0",
            "body": "# v1.2.0\n\nNow **faster**. <script>alert(1)</script> See [docs](https://evil.example/x).",
        }
        html = plugin_pages.plugin_page(shell, APP, {}, {}, {}, [APP], releases=[release])
        self.assertIn("What&#8217;s new in v1.2.0", html)
        self.assertIn("Now faster.", html)
        self.assertNotIn("<script>alert", html)
        self.assertNotIn("evil.example", html)
        self.assertIn('href="https://github.com/MWGIH/DeckyMultiFrameGen/releases/tag/v1.2.0"', html)
        # A link to anywhere but the plugin's own repository falls back to its releases page.
        elsewhere = plugin_pages.plugin_page(
            shell, APP, {}, {}, {}, [APP], releases=[{**release, "html_url": "https://evil.example/r"}]
        )
        self.assertNotIn("evil.example", elsewhere)
        self.assertIn("https://github.com/MWGIH/DeckyMultiFrameGen/releases", elsewhere)
        self.assertNotIn(
            "What&#8217;s new",
            plugin_pages.plugin_page(shell, APP, {}, {}, {}, [APP], releases=[{**release, "body": ""}]),
        )

    def test_a_store_only_page_shows_no_release_notes(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        release = {"tag_name": "v1", "prerelease": False, "body": "Old build notes."}
        html = plugin_pages.plugin_page(shell, {**APP, "store": True}, {}, {}, {}, [APP], releases=[release])
        self.assertNotIn("What&#8217;s new", html)

    def test_a_category_page_lists_its_plugins_with_facts_from_the_data_and_links_the_other_categories(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        mate = {**APP, "id": "mate", "name": "Mate", "repo": "other/Mate"}
        data = {
            "stats": {"mwgih/deckymultiframegen": {"downloads": 900, "updated": "2999-01-01T00:00:00Z"}},
            "scans": {},
        }
        html = plugin_pages.category_page(
            shell, "Frame Generation", [mate, APP], data, {"Frame Generation": 2, "Utilities": 5}
        )
        self.assertIn("<h1>Frame Generation Decky plugins</h1>", html)
        self.assertIn("2 Decky Loader plugins in Frame Generation, by 2 authors.", html)
        self.assertIn("The most downloaded are Decky MultiFrameGen, Mate.", html)
        self.assertIn("1 had a release in the last 90 days.", html)
        self.assertIn('href="/plugins/mate.html"', html)
        self.assertIn('<a href="/plugins/category/utilities.html">Utilities</a> (5)', html)
        self.assertNotIn('<a href="/plugins/category/frame-generation.html">Frame Generation</a>', html)
        self.assertIn('rel="canonical" href="https://deckyhub.com/plugins/category/frame-generation.html"', html)
        self.assertIn("<title>Frame Generation Decky Loader plugins | DeckyHub</title>", html)

    def test_a_plugin_page_links_its_category_and_says_it_is_free(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        mate = {**APP, "id": "mate", "name": "Mate", "repo": "other/Mate"}
        html = plugin_pages.plugin_page(shell, APP, {}, {}, {}, [APP, mate])
        self.assertIn(
            '<a href="/plugins/category/frame-generation.html">Frame Generation</a> › Decky MultiFrameGen', html
        )
        self.assertIn("See all 2 Frame Generation plugins", html)
        self.assertIn('"offers":{"@type":"Offer","price":"0","priceCurrency":"USD"}', html.replace(" ", ""))
        self.assertIn('"position":3,"name":"FrameGeneration"', html.replace(" ", ""))

    def test_catalog_cards_stay_small_and_the_legend_is_said_once(self):
        data = {"stats": {"mwgih/deckymultiframegen": {"downloads": 900}}, "scans": {}}
        card = plugin_pages.card(APP, data)
        self.assertIn('data-repo="mwgih/deckymultiframegen"', card)
        self.assertNotIn("data-text", card)
        self.assertNotIn(plugin_pages.CARD_TIP, card)
        self.assertIn(plugin_pages.CARD_TIP, plugin_pages.card(APP, data, tip=True))
        self.assertIn(plugin_pages.CARD_TIP, plugin_pages.popular_cards([APP], data))
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        catalog = plugin_pages.catalog_page(shell, [APP], data)
        self.assertEqual(catalog.count("approximate activity: GitHub downloads"), 1)
        # The search text is built in the browser from what the card shows and its repository.
        self.assertIn("c._t=", catalog)
        self.assertNotIn("dataset.text", catalog)

    def test_plugins_that_share_a_name_get_the_owner_in_their_page_title(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        alone = plugin_pages.plugin_page(shell, APP, {}, {}, {}, [APP])
        self.assertIn("<title>Decky MultiFrameGen: Decky Loader plugin | DeckyHub</title>", alone)
        shared = plugin_pages.plugin_page(shell, APP, {}, {}, {}, [APP], shares_name=True)
        self.assertIn("<title>Decky MultiFrameGen by MWGIH: Decky Loader plugin | DeckyHub</title>", shared)

    def test_catalog_cards_of_plugins_that_share_a_name_say_whose_they_are(self):
        from page_text import with_shared_titles

        twin = {**APP, "id": "fork", "repo": "someone/Fork"}
        titled = with_shared_titles([APP, twin, {**APP, "id": "other", "name": "Other"}])
        self.assertEqual(
            [app.get("title") for app in titled],
            ["Decky MultiFrameGen by MWGIH", "Decky MultiFrameGen by someone", None],
        )

    def test_pre_release_only_and_no_description_badges(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        bare = {**APP, "description": ""}
        page = plugin_pages.plugin_page(shell, bare, {}, {}, {}, [bare], releases=[{"prerelease": True}])
        self.assertIn(">Pre-release only</span>", page)
        self.assertIn(">No description</span>", page)
        listed = [{"prerelease": True}, {"prerelease": False}]
        page = plugin_pages.plugin_page(shell, APP, {}, {}, {}, [APP], releases=listed)
        self.assertNotIn("Pre-release only", page)
        self.assertNotIn("No description", page)

    def test_a_plugin_with_no_scan_says_it_is_not_scanned_never_no_known_issues(self):
        page = self.page({"downloads": 5})
        self.assertIn("Not scanned yet", page)
        self.assertNotIn("No known issues", page)
        scanned = self.page(
            {},
            {
                "stable": {
                    "tag": "v1",
                    "file": "x.zip",
                    "sha256": SHA,
                    "clamav": {"result": "clean"},
                    "yara": {"result": "clean"},
                }
            },
        )
        self.assertNotIn('<span class="badge warn">Not scanned yet</span>', scanned)

    def test_a_pre_release_scanned_beside_the_stable_one_is_explained(self):
        record = {
            "tag": "v1",
            "file": "x.zip",
            "sha256": SHA,
            "clamav": {"result": "clean"},
            "yara": {"result": "clean"},
        }
        page = self.page({}, {"stable": record, "prerelease": {**record, "tag": "v2-rc", "file": "y.zip"}})
        self.assertIn(
            "may be unfinished or buggy, and DeckyHub installs it only if you choose its Pre-release channel", page
        )
        self.assertNotIn("DeckyHub installs it only if you choose", self.page({}, {"stable": record}))

    def test_a_plugin_page_has_no_versions_list(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        releases = [
            {
                "tag_name": "v1",
                "published_at": "2026-01-01T00:00:00Z",
                "assets": [{"name": "p.zip", "browser_download_url": "https://github.com/a/b/p.zip"}],
            }
        ]
        page = plugin_pages.plugin_page(shell, APP, {}, {}, {}, [APP], releases=releases)
        self.assertNotIn("Versions", page)
        self.assertNotIn("p.zip", page)

    def test_decky_store_listing_shows_a_badge_counts_and_a_catalog_filter(self):
        page = self.page({"downloads": 1500, "store": {"downloads": 40000}})
        self.assertIn(">In Decky store</span>", page)
        self.assertIn("GitHub downloads", page)
        self.assertIn("Decky store downloads</a>", page)
        data = {"stats": {APP["repo"].casefold(): {"store": {"downloads": 1}}}, "scans": {}}
        self.assertIn('data-store="1"', plugin_pages.card(APP, data))
        self.assertNotIn("data-store", plugin_pages.card(APP, {"stats": {}, "scans": {}}))

    def test_catalog_cards_carry_their_release_date_for_the_updated_filter(self):
        data = {"stats": {APP["repo"].casefold(): {"updated": "2026-11-12T10:51:51Z"}}, "scans": {}}
        self.assertIn('data-updated="2026-11-12"', plugin_pages.card(APP, data))
        self.assertNotIn("data-updated", plugin_pages.card(APP, {"stats": {}, "scans": {}}))
        self.assertIn(
            'data-age="90"',
            plugin_pages.catalog_page(
                plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8")), [APP], data
            ),
        )

    def test_the_page_leads_with_a_short_safety_summary_and_plain_install_steps_that_fit_a_phone(self):
        page = self.page(
            {"root": True, "ai": ["CLAUDE.md"]},
            {
                "stable": {
                    "tag": "v1",
                    "file": "x.zip",
                    "sha256": SHA,
                    "clamav": {"result": "clean"},
                    "yara": {"result": "clean"},
                }
            },
            # VirusTotal and MetaDefender have reported too: all four scanners.
            reports={SHA: {"state": "complete", "flagged": 0, "total": 21}},
            vt={
                SHA: {"state": "complete", "stats": {"malicious": 0, "suspicious": 0, "harmless": 60, "undetected": 6}}
            },
        )
        self.assertIn('<h2 id="safety">Safety at a glance</h2>', page)
        chips = page[page.index('class="chips-row"') : page.index("What these labels mean")]
        for label in ("Runs as root", "AI", "Nothing flagged"):
            self.assertIn(f">{label}</li>", chips)
        self.assertIn('<ol class="steps">', page)
        self.assertLess(page.index("Safety at a glance"), page.index("How to install"))
        # Install with DeckyHub leads to the steps on the same page, not to the home page.
        self.assertIn('<a class="btn" href="#how-to-install">Install with DeckyHub</a>', page)
        self.assertIn('<h2 id="how-to-install">How to install</h2>', page)
        # The long explanations and the scan tables are folded away until asked for.
        self.assertIn('<details class="more"><summary>What these labels mean</summary>', page)
        self.assertIn('<details class="more"><summary>Security scan details</summary>', page)
        # Phones: nothing can push the page wider than the screen, and the facts sit two to a row.
        self.assertIn(".badges li{min-width:0;overflow-wrap:anywhere}", page)
        self.assertIn(".facts{grid-template-columns:repeat(2,minmax(0,1fr))}", page)
        self.assertNotIn("Safety information", page)
        # A short screen (the Steam Deck's browser is about 914x520) keeps its room: the menu scrolls away.
        self.assertIn("@media(max-height:600px){nav.site-nav{position:static}}", page)
        self.assertIn("No known issues", plugin_pages.safety_chips([]))

    def test_downloads_are_github_plus_the_decky_store_in_the_page_the_card_and_the_ranking(self):
        page = self.page({"downloads": 1500, "store": {"downloads": 40000}})
        self.assertIn("<strong>41.5K</strong>Approximate activity", page)
        self.assertIn("repeat downloads included; not unique installs", page)
        self.assertIn("<strong>1.5K</strong>GitHub downloads", page)
        self.assertEqual(plugin_pages.total_downloads({"downloads": 1500, "store": {"downloads": 40000}}), 41500)
        self.assertEqual(plugin_pages.total_downloads({"store": {"downloads": 7}}), 7)
        activity_page = self.page(
            {"downloads": 1500, "store": {"downloads": 40000, "activity": {"downloads": 10, "updates": 2}}}
        )
        self.assertIn("1.5K</strong>GitHub downloads", activity_page)
        self.assertIn("12</strong><a href=", activity_page)
        self.assertIn("Decky store downloads + updates", activity_page)
        self.assertIn("matched by name", activity_page)
        self.assertEqual(
            plugin_pages.total_downloads(
                {"downloads": 1500, "store": {"downloads": 40000, "activity": {"downloads": 8, "updates": 2}}}
            ),
            1510,
        )
        self.assertEqual(plugin_pages.total_downloads({"store": {"activity": {"downloads": 0, "updates": 0}}}), 0)
        self.assertEqual(
            plugin_pages.total_downloads(
                {"downloads": 4, "store": {"downloads": 7, "activity": {"downloads": -1, "updates": 3}}}
            ),
            11,
        )
        self.assertIsNone(plugin_pages.total_downloads({"downloads": True, "store": {"downloads": -1}}))
        self.assertIsNone(plugin_pages.total_downloads({}))
        # No total line when only one of the counts is known: it would repeat that number.
        self.assertNotIn("Downloads in total", self.page({"downloads": 1500}))
        data = {"stats": {APP["repo"].casefold(): {"downloads": 1500, "store": {"downloads": 40000}}}, "scans": {}}
        self.assertIn("↓ 41.5K", plugin_pages.card(APP, data))
        other = {**APP, "id": "other", "repo": "o/other"}
        data["stats"]["o/other"] = {"downloads": 30000}
        self.assertEqual([app["id"] for app in plugin_pages.by_downloads([other, APP], data)], [APP["id"], "other"])

    def test_a_store_only_entry_says_so_and_offers_no_github_install_or_device_request(self):
        page = self.page()
        self.assertIn("nobody reviews these plugins", page)
        self.assertIn("Send to device", page)
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        store_only = {**APP, "store": True}
        page = plugin_pages.plugin_page(shell, store_only, {}, {}, {}, [store_only])
        self.assertIn("install it from the store", page)
        self.assertNotIn("Send to device", page)
        self.assertNotIn('id="remote-install"', page)

    def test_remote_install_handoff_has_plugin_id_and_no_secrets_in_url(self):
        page = self.page()
        self.assertIn('id="remote-install"', page)
        self.assertNotIn('id="remote-pair-form"', page)
        self.assertNotIn('id="remote-plugins"', page)
        self.assertIn(f'data-plugin-id="{APP["id"]}"', page)
        self.assertIn('src="/remote-install.js"', page)
        self.assertIn('href="/remote-install/">Pair a device</a>', page)
        self.assertNotIn("token=", page)

    def test_a_long_repository_name_gets_a_full_width_tile_that_wraps(self):
        page = self.page()
        self.assertIn(
            '<li class="wide"><strong><a href="https://github.com/MWGIH/DeckyMultiFrameGen">MWGIH/DeckyMultiFrameGen</a></strong>Repository</li>',
            page,
        )
        self.assertIn(".facts li.wide{grid-column:1/-1}", page)
        self.assertIn("overflow-wrap:anywhere", page.split(".facts li{", 1)[1].split("}", 1)[0])

    def test_the_menu_and_footer_links_work_from_a_plugin_page(self):
        page = self.page()
        # Links are absolute, so they work from /plugins/ too (a relative "./" would be /plugins/ itself).
        for part in (page.split("<nav", 1)[1].split("</nav>", 1)[0], page.split("<footer>", 1)[1]):
            self.assertNotRegex(part, r'href="\.?\.?/')
        self.assertIn('<a href="https://deckyhub.com/">Home</a>', page)
        self.assertIn(
            '<a href="https://deckyhub.com/plugins/" aria-current="page">Plugins</a>', page
        )  # this section is highlighted
        self.assertIn('<a href="https://deckyhub.com/contribute/">Contribute</a>', page)

    def test_the_title_and_description_fit_a_search_result(self):
        page = self.page()
        title = page.split("<title>", 1)[1].split("</title>", 1)[0]
        description = page.split('name="description" content="', 1)[1].split('"', 1)[0]
        self.assertLessEqual(len(title), 70)
        self.assertLessEqual(len(description), 160)

    def test_scans_show_clean_results_and_no_virustotal_link_without_a_report(self):
        scans = {
            "stable": {
                "tag": "v1.0.0",
                "file": "x.zip",
                "sha256": SHA,
                "clamav": {"result": "clean", "scannedAt": "2026-11-02T10:00:00Z"},
                "yara": {"result": "clean"},
            }
        }
        page = self.page(
            scans=scans, reports={SHA: {"state": "complete", "flagged": 0, "total": 21, "dataId": "abc123"}}
        )
        # VirusTotal has no report for this file: its row says so and links nowhere (its page would be empty).
        self.assertIn("<tr><td>VirusTotal</td><td>No report yet</td>", page)
        self.assertNotIn("virustotal.com/gui/file", page)
        for text in (
            "Security scan details",
            "No threats found",
            "0 of 21 engines flagged this file",
            "https://metadefender.opswat.com/results/file/abc123/regular/overview",
        ):
            self.assertIn(text, page)

    def test_hash_matched_source_findings_are_high_risk_and_unmatched_records_are_ignored(self):
        source_audit = {
            "source": {"result": "incomplete", "findings": [{"rule": "source_file_differs", "path": "main.py"}]}
        }
        matched = {
            "stable": {
                "tag": "v1.0.0",
                "file": "x.zip",
                "sha256": SHA,
                "audit": source_audit,
            }
        }
        page = self.page(scans=matched)
        self.assertIn("Very high risk: Download includes code that is not in GitHub", page)
        self.assertIn("This can hide malicious changes", page)
        self.assertIn("An automated mismatch does not prove malware", page)
        self.assertIn("Stable ZIP x.zip (v1.0.0)", page)
        exact_channel = {
            "stable": {"sha256": SHA, "tag": "v1.0.0", "file": "x.zip", "audit": {"source": source_audit["source"]}}
        }
        self.assertIn("Very high risk", plugin_pages.flags_of({}, exact_channel))
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        issues = plugin_pages.issues_page(
            shell,
            [APP],
            {"stats": {}, "scans": {APP["repo"].casefold(): exact_channel}, "warnings": plugin_pages.WARNINGS},
        )
        self.assertIn('id="not-in-source"', issues)
        self.assertIn(f'href="/plugins/{APP["id"]}.html"', issues)

        for bad_hash in ("", "not-a-hash"):
            unmatched = {"stable": {"tag": "v1.0.0", "file": "x.zip", "sha256": bad_hash, "audit": source_audit}}
            self.assertNotIn("Very high risk: Download includes code that is not in GitHub", self.page(scans=unmatched))
        malformed = {"source": {"result": "incomplete", "findings": [{"rule": "mystery", "path": "main.py"}]}}
        self.assertNotIn(
            "Very high risk: Download includes code that is not in GitHub",
            self.page(
                scans={
                    "stable": {
                        "sha256": SHA,
                        "tag": "v1.0.0",
                        "file": "x.zip",
                        "audit": {"source": malformed["source"]},
                    }
                }
            ),
        )
        both = {
            "stable": {"sha256": SHA, "tag": "v1.0.0", "file": "stable.zip", "audit": source_audit},
            "prerelease": {"sha256": "d" * 64, "tag": "v2.0.0-rc1", "file": "rc.zip", "audit": source_audit},
        }
        two = self.page(scans=both)
        self.assertIn("Stable ZIP stable.zip", two)
        self.assertIn("Pre-release ZIP rc.zip", two)

    def test_scans_show_virustotal_results_and_pending_metadefender(self):
        scans = {
            "stable": {
                "tag": "v1.0.0",
                "file": "x.zip",
                "sha256": SHA,
                "clamav": {"result": "clean"},
                "yara": {"result": "clean"},
            }
        }
        vt = {
            SHA: {
                "state": "complete",
                "stats": {"malicious": 2, "suspicious": 1, "harmless": 0, "undetected": 57},
                "scannedAt": 1793181436,
            }
        }
        page = self.page(scans=scans, reports={SHA: {"state": "pending"}}, vt=vt)
        for text in ("3 of 60 engines flagged this file", "<tr><td>MetaDefender</td><td>Scan pending</td>"):
            self.assertIn(text, page)
        self.assertIn("Threat found", page)  # the badge counts VirusTotal, not just ClamAV and YARA
        self.assertIn("✖ Threat found", plugin_pages.flags_of({}, scans, {}, vt))

    def test_rust_gets_a_badge_a_flag_and_nothing_on_a_store_only_page(self):
        stats = {"rust": True}
        self.assertIn('<span class="badge rust">Rust</span>', "".join(plugin_pages.badges_of(stats, {}, {})))
        self.assertIn('<span class="flag-rust">Rust</span>', plugin_pages.flags_of(stats, {}))
        self.assertEqual(
            plugin_pages.flags_of({"rust": True, "store": {"downloads": 1}}, {}, store_only=True),
            '<span class="flag-store">In Decky store</span>',
        )

    def test_a_store_only_card_shows_only_the_store_flag(self):
        stats = {"store": {"downloads": 1}, "ai": ["AGENTS.md"], "root": True, "warnings": ["blocked"]}
        flags = plugin_pages.flags_of(stats, {}, store_only=True)
        self.assertEqual(flags, '<span class="flag-store">In Decky store</span>')

    def test_two_clean_scans_out_of_four_are_not_fully_scanned_and_a_flag_is_still_a_threat(self):
        clean = {"clamav": {"result": "clean"}, "yara": {"result": "clean"}}
        # ClamAV and YARA only: VirusTotal and MetaDefender haven't reported, so it isn't "Nothing flagged".
        self.assertEqual(plugin_pages.scan_kind({**clean, "sha256": SHA}), "partial")
        both = {
            "reports": {SHA: {"state": "complete", "flagged": 0, "total": 21}},
            "vt_reports": {
                "state": "complete",
                "stats": {"malicious": 0, "suspicious": 0, "harmless": 60, "undetected": 6},
            },
        }
        self.assertEqual(
            plugin_pages.scan_kind({**clean, "sha256": SHA}, both["reports"], {SHA: both["vt_reports"]}), "clean"
        )
        # Any engine flagging it is a threat, whatever else is missing.
        flagged = {
            SHA: {"state": "complete", "stats": {"malicious": 3, "suspicious": 0, "harmless": 57, "undetected": 6}}
        }
        self.assertEqual(plugin_pages.scan_kind({**clean, "sha256": SHA}, None, flagged), "infected")
        self.assertIn("Not fully scanned", plugin_pages.flags_of({}, {"stable": {**clean, "sha256": SHA}}))

    def test_known_issues_lists_flagged_and_warned_plugins_only(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        clean = {**APP, "id": "clean-one", "name": "Clean One", "repo": "a/clean"}
        data = {
            "stats": {APP["repo"].casefold(): {"warnings": ["private-data"]}},
            "warnings": plugin_pages.WARNINGS,
            "scans": {
                APP["repo"].casefold(): {
                    "stable": {"sha256": SHA, "clamav": {"result": "clean"}, "yara": {"result": "clean"}}
                }
            },
            "reports": {},
            "vt": {
                SHA: {"state": "complete", "stats": {"malicious": 1, "suspicious": 0, "harmless": 0, "undetected": 9}}
            },
        }
        page = plugin_pages.issues_page(shell, [APP, clean], data)
        for text in (
            'id="infected"',
            'id="private-data"',
            f'href="/plugins/{APP["id"]}.html"',
            "1 of 2 Decky Loader plugins",
        ):
            self.assertIn(text, page)
        self.assertNotIn("Clean One", page)

    def test_known_issues_does_not_list_a_scan_that_is_only_waiting_for_two_of_the_scanners(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        waiting = {**APP, "id": "waiting-one", "name": "Waiting One", "repo": "a/waiting"}
        broken = {**APP, "id": "broken-one", "name": "Broken One", "repo": "a/broken"}
        data = {
            "stats": {},
            "warnings": plugin_pages.WARNINGS,
            "scans": {
                # ClamAV and YARA are clean; VirusTotal and MetaDefender haven't reported yet: not a problem.
                "a/waiting": {"stable": {"sha256": SHA, "clamav": {"result": "clean"}, "yara": {"result": "clean"}}},
                # A scanner that could not finish is.
                "a/broken": {
                    "stable": {"sha256": "d" * 64, "clamav": {"result": "error"}, "yara": {"result": "clean"}}
                },
            },
            "reports": {},
            "vt": {},
        }
        page = plugin_pages.issues_page(shell, [waiting, broken], data)
        self.assertNotIn("Waiting One", page)
        self.assertIn("Broken One", page)
        self.assertIn('id="partial"', page)
        # The badge still calls the waiting one Not fully scanned.
        self.assertEqual(plugin_pages.scan_kind(data["scans"]["a/waiting"]["stable"]), "partial")
        self.assertEqual(plugin_pages.scan_state(data["scans"]["a/waiting"]["stable"]), "clean")

    def test_known_issues_lists_a_tag_that_disagrees_with_its_zip(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        other = {**APP, "id": "same-one", "name": "Same One", "repo": "a/same"}
        releases = {
            APP["repo"].casefold(): [
                {"tag_name": "v0.5-beta", "prerelease": True, "pluginVersion": "9.9"},
                {"tag_name": "v0.45", "pluginVersion": "0.4.5"},
            ],
            "a/same": [{"tag_name": "Release-0.7.6", "pluginVersion": "0.7.6"}],
        }
        page = plugin_pages.issues_page(shell, [APP, other], {"stats": {}, "scans": {}, "releases": releases})
        self.assertIn('id="version-mismatch"', page)
        self.assertIn("<small>Tagged v0.45, its ZIP says 0.4.5</small></a>", page)
        self.assertNotIn("Same One", page)  # Release-0.7.6 and 0.7.6 are the same version

    def test_remote_install_preview_link_preserves_plugin(self):
        page = self.page()
        # The button opens the card as a window; the card is closed until then.
        self.assertIn('id="remote-open"', page)
        self.assertIn('<dialog id="remote-install"', page)
        self.assertIn(f'data-plugin-id="{APP["id"]}"', page)

    def test_remote_install_prefers_pairing_link_and_code_over_manual_connection_details(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        page = plugin_pages.paired_devices_page(shell)
        form = page.split('<form id="remote-pair-form" aria-labelledby="remote-pair-title">', 1)[1].split("</form>", 1)[
            0
        ]
        basic, advanced = form.split('<details id="remote-manual">', 1)
        self.assertIn('id="remote-pairing-link"', basic)
        self.assertIn('pattern="[0-9]{6}" required', basic)
        self.assertIn('id="remote-address"', advanced)
        self.assertIn('id="remote-fingerprint"', advanced)
        self.assertNotIn("required", advanced)
        self.assertIn('href="/remote-install.css"', page)

    def test_an_unscanned_plugin_says_so(self):
        self.assertIn("Not scanned yet", self.page())

    def test_the_website_install_steps_come_from_the_readme(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        option_1 = plugin_pages.readme_steps(readme, "### Option 1")
        option_2 = plugin_pages.readme_steps(readme, "### Option 2")
        self.assertGreaterEqual(option_1.count("<li>"), 6)
        self.assertIn("<code>Install-DeckyHub.desktop</code>", option_1)
        self.assertIn(
            '<a href="https://github.com/mazillka/deckyhub-plugin/releases/latest/download/Install-DeckyHub.desktop">',
            option_1,
        )
        self.assertIn("<strong>Execute</strong>", option_1)
        self.assertGreaterEqual(option_2.count("<li>"), 3)
        self.assertNotIn("Install-DeckyHub.desktop", option_2)  # each option has its own steps
        self.assertIn('<div class="choices">', option_1)
        self.assertNotIn("&lt;!--", option_1)

    def test_markers_split_a_step_into_two_choices(self):
        steps = plugin_pages.readme_steps(
            "### Steps\n1. Put it there. <!-- choose --> **A:** drag. <!-- or --> **B:** run `x`.\n2. Done.\n",
            "### Steps",
        )
        self.assertIn(
            '<li><p>Put it there.</p><div class="choices"><div><strong>A:</strong> drag.</div><div><strong>B:</strong> run <code>x</code>.</div></div></li>',
            steps,
        )
        self.assertIn("<li>Done.</li>", steps)
        self.assertIn(
            '<li><div class="choices"><div>a</div><div>b</div></div></li>',
            plugin_pages.readme_steps("### S\n1. a <!-- or --> b\n", "### S"),
        )

    def test_inline_markdown_escapes_html(self):
        self.assertEqual(plugin_pages.inline_markdown("a <b> & **c**"), "a &lt;b&gt; &amp; <strong>c</strong>")

    def test_every_button_that_looks_like_a_link_button_shows_a_pointer(self):
        # Send to device is a <button> (it opens a window), and a button has no pointer cursor of its own.
        style = self.page().split("<style>")[1].split("</style>")[0]
        self.assertRegex(style, r"\.btn\{[^}]*cursor:pointer")

    def test_a_plugin_only_in_the_decky_store_is_installed_through_decky_not_deckyhub(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        page = plugin_pages.plugin_page(shell, {**APP, "store": True}, {}, {}, {}, [APP])
        self.assertIn('<a class="btn" href="#how-to-install">Install from the Decky store</a>', page)
        steps = page.split('<h2 id="how-to-install">')[1].split("</ol>")[0]
        self.assertIn("Quick Access menu", steps)
        self.assertIn("choose <strong>Store</strong>", steps)
        self.assertNotIn("DeckyHub's <strong>Discover</strong>", steps)
        # no scans of a leftover build: the page says why there are none
        self.assertNotIn("Security scan details", page)
        self.assertNotIn("ClamAV", page)
        self.assertIn("no GitHub release of this plugin to scan", page)
        # DeckyHub does not install it, so "Pre-release only" (about what DeckyHub offers) does not apply
        old = [{"tag_name": "v0.1-beta", "prerelease": True, "draft": False, "assets": []}]
        self.assertNotIn(
            "Pre-release only", plugin_pages.plugin_page(shell, {**APP, "store": True}, {}, {}, {}, [APP], releases=old)
        )
        # and a plugin that is on GitHub keeps the DeckyHub steps
        normal = self.page()
        self.assertIn("Install with DeckyHub</a>", normal)
        self.assertIn("DeckyHub's <strong>Discover</strong>", normal)

    def test_help_steps_come_from_a_heading_of_the_guide(self):
        guide = '<h3 id="pair">Pair</h3><p>x</p><ol><li>One</li><li>Two <code>y</code></li></ol><h3 id="next">Next</h3><ol><li>Other</li></ol>'
        self.assertEqual(plugin_pages.guide_steps(guide, "pair"), "<li>One</li><li>Two <code>y</code></li>")
        with self.assertRaises(SystemExit):
            plugin_pages.guide_steps('<h3 id="a">A</h3><p>none</p>', "a")

    def test_a_pending_virustotal_scan_has_no_report_link_but_a_finished_one_does(self):
        scans = {
            "stable": {
                "tag": "v1",
                "file": "p.zip",
                "sha256": SHA,
                "clamav": {"result": "clean"},
                "yara": {"result": "clean"},
            }
        }
        pending = self.page(scans=scans, vt={SHA: {"state": "pending"}})
        self.assertIn("<tr><td>VirusTotal</td><td>Scan pending</td>", pending)
        self.assertNotIn(f"virustotal.com/gui/file/{SHA}", pending)
        done = self.page(
            scans=scans,
            vt={
                SHA: {
                    "state": "complete",
                    "stats": {"malicious": 0, "suspicious": 0, "harmless": 1, "undetected": 60},
                    "scannedAt": 1793181436,
                }
            },
        )
        self.assertIn(f'href="https://www.virustotal.com/gui/file/{SHA}"', done)

    def test_build_site_lets_every_remote_install_card_connect_to_a_device(self):
        # build-site.py widens connect-src for pages that hold the card, by a piece of its HTML; a change to the tag
        # once left the plugin pages without it and Chrome blocked the connection to the device.
        marker = re.search(
            r"if '([^']+)' in text", (ROOT / "devtools" / "build-site.py").read_text(encoding="utf-8")
        ).group(1)
        self.assertIn(marker, plugin_pages.remote_install_picker("x"))
        self.assertIn(marker, plugin_pages.remote_device_panel("en"))

    def test_the_develop_preview_reads_the_registrys_develop_branch(self):
        # Without it a registry change (Junk-Store's "store" flag) shows on /develop/ only after the registry ships.
        source = (ROOT / "devtools" / "build-site.py").read_text(encoding="utf-8")
        self.assertIn('REGISTRY_URL.replace("/main/", "/develop/") if PREVIEW', source)
        self.assertIn("/refs/heads/main/registry/apps.json", source)


class PluginInfoTests(unittest.TestCase):
    def test_a_record_per_repository_with_numbers_badges_and_scan(self):
        data = {
            "stats": {
                "mwgih/deckymultiframegen": {
                    "downloads": 4908,
                    "stars": 27,
                    "updated": "2026-11-12T10:51:51Z",
                    "root": True,
                    "ai": ["x"],
                    "warnings": ["obfuscated"],
                    "store": {"downloads": 12, "activity": {"downloads": 8, "updates": 5}},
                }
            },
            "scans": {
                "mwgih/deckymultiframegen": {
                    "stable": {
                        "tag": "v1.5.0",
                        "file": "a.zip",
                        "sha256": SHA,
                        "clamav": {"result": "clean"},
                        "yara": {"result": "infected"},
                    }
                }
            },
            "reports": {SHA: {"state": "complete", "flagged": 0, "total": 21}},
            "vt": {
                SHA: {"state": "complete", "stats": {"malicious": 1, "suspicious": 0, "harmless": 60, "undetected": 6}}
            },
            "releases": {
                "mwgih/deckymultiframegen": [{"tag_name": "v1.6.0-rc", "prerelease": True}, {"tag_name": "v1.5.0"}]
            },
            "warnings": {"obfuscated": ("Hidden code", "The audit found obfuscated code.")},
        }
        info = plugin_pages.plugin_info([APP], data)
        record = info["plugins"]["mwgih/deckymultiframegen"]
        self.assertEqual(
            (record["id"], record["downloads"], record["stars"], record["storeDownloads"]), (APP["id"], 4908, 27, 12)
        )
        self.assertTrue(record["root"] and record["ai"])
        self.assertEqual(record["warnings"], ["obfuscated"])
        self.assertEqual(record["storeActivity"], {"downloads": 8, "updates": 5})
        self.assertEqual(record["latest"], "v1.5.0")
        self.assertEqual(record["scan"]["kind"], "infected")
        self.assertEqual((record["scan"]["clamav"], record["scan"]["yara"]), ("clean", "infected"))
        self.assertEqual((record["scan"]["virusTotal"], record["scan"]["metaDefender"]), ([1, 67], [0, 21]))
        self.assertEqual(info["warnings"]["obfuscated"], ["Hidden code", "The audit found obfuscated code."])
        json.dumps(info)  # the whole thing must be plain JSON

    def test_a_plugin_with_no_data_still_gets_its_id_and_name(self):
        info = plugin_pages.plugin_info([APP], {"stats": {}, "scans": {}, "reports": {}, "warnings": {}})
        self.assertEqual(info["plugins"]["mwgih/deckymultiframegen"], {"id": APP["id"], "name": APP["name"]})


if __name__ == "__main__":
    unittest.main()
