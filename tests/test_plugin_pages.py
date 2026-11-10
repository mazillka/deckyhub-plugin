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
        for text in (
            "3 of 60 engines flagged this file",
            '<tr><td>MetaDefender</td><td><span class="stale">Scan pending</span></td>',
        ):
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
