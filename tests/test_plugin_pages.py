"""deckyhub.com's plugin pages (devtools/plugin_pages.py), built from data passed in: no network."""

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

    def test_versions_lists_each_release_with_its_zip(self):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        releases = [
            {
                "tag_name": "v2",
                "prerelease": True,
                "published_at": "2026-02-03T00:00:00Z",
                "html_url": "https://github.com/a/b/releases/tag/v2",
                "assets": [{"name": "p.zip", "browser_download_url": "https://github.com/a/b/p.zip"}],
            },
            {
                "tag_name": "v1<x>",
                "published_at": "2026-01-01T00:00:00Z",
                "assets": [{"name": "p.zip", "browser_download_url": "http://evil/p.zip"}],
            },
            {"tag_name": "draft", "draft": True},
        ]
        page = plugin_pages.plugin_page(shell, APP, {}, {}, {}, [APP], releases=releases)
        self.assertIn("<h2>Versions</h2>", page)
        self.assertIn('href="https://github.com/a/b/p.zip">p.zip', page)
        self.assertIn("v1&lt;x&gt;", page)
        self.assertNotIn("evil", page)
        self.assertNotIn(">draft<", page)
        self.assertNotIn("<h2>Versions</h2>", self.page())

    def test_decky_store_listing_shows_a_badge_counts_and_a_catalog_filter(self):
        page = self.page({"downloads": 1500, "store": {"downloads": 40000}})
        self.assertIn(">In Decky store</span>", page)
        self.assertIn("GitHub downloads", page)
        self.assertIn("Decky store downloads", page)
        data = {"stats": {APP["repo"].casefold(): {"store": {"downloads": 1}}}, "scans": {}}
        self.assertIn('data-store="1"', plugin_pages.card(APP, data))
        self.assertNotIn("data-store", plugin_pages.card(APP, {"stats": {}, "scans": {}}))

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

    def test_scans_show_clean_results_and_a_virustotal_lookup_by_hash(self):
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
        for text in (
            "Security scans",
            "No threats found",
            f'href="https://www.virustotal.com/gui/file/{SHA}"',
            "0 of 21 engines flagged this file",
            "https://metadefender.opswat.com/results/file/abc123/regular/overview",
        ):
            self.assertIn(text, page)

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
        self.assertIn('href="#remote-install"', page)
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


if __name__ == "__main__":
    unittest.main()
