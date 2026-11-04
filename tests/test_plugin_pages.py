"""deckyhub.com's plugin pages (devtools/plugin_pages.py), built from data passed in: no network."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "devtools"))
import plugin_pages  # noqa: E402

APP = {"id": "decky-multiframegen", "name": "Decky MultiFrameGen", "repo": "MWGIH/DeckyMultiFrameGen", "category": "Frame Generation", "description": "Installs OptiScaler, HelixSR and MAKO and picks which one each game uses."}
SHA = "c" * 64


class PluginPageTests(unittest.TestCase):
    def page(self, stats=None, scans=None, reports=None):
        shell = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))
        return plugin_pages.plugin_page(shell, APP, stats or {}, scans or {}, {}, [APP], reports)

    def test_a_long_repository_name_gets_a_full_width_tile_that_wraps(self):
        page = self.page()
        self.assertIn('<li class="wide"><strong><a href="https://github.com/MWGIH/DeckyMultiFrameGen">MWGIH/DeckyMultiFrameGen</a></strong>Repository</li>', page)
        self.assertIn(".facts li.wide{grid-column:1/-1}", page)
        self.assertIn("overflow-wrap:anywhere", page.split(".facts li{", 1)[1].split("}", 1)[0])

    def test_the_footer_home_link_works_from_a_plugin_page(self):
        footer = self.page().split("<footer>", 1)[1]
        self.assertIn('<a href="/">Home</a>', footer)
        self.assertNotIn('href="./"', footer)

    def test_the_title_and_description_fit_a_search_result(self):
        page = self.page()
        title = page.split("<title>", 1)[1].split("</title>", 1)[0]
        description = page.split('name="description" content="', 1)[1].split('"', 1)[0]
        self.assertLessEqual(len(title), 70)
        self.assertLessEqual(len(description), 160)

    def test_scans_show_clean_results_and_a_virustotal_lookup_by_hash(self):
        scans = {"stable": {"tag": "v1.0.0", "file": "x.zip", "sha256": SHA, "clamav": {"result": "clean", "scannedAt": "2026-11-02T10:00:00Z"}, "yara": {"result": "clean"}}}
        page = self.page(scans=scans, reports={SHA: {"state": "complete", "flagged": 0, "total": 21, "dataId": "abc123"}})
        for text in ("Security scans", "No threats found", f'href="https://www.virustotal.com/gui/file/{SHA}"', "0 of 21 engines flagged this file", "https://metadefender.opswat.com/results/file/abc123/regular/overview"):
            self.assertIn(text, page)

    def test_an_unscanned_plugin_says_so(self):
        self.assertIn("Not scanned yet", self.page())

    def test_the_website_install_steps_come_from_the_readme(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        option_1 = plugin_pages.readme_steps(readme, "### Option 1")
        option_2 = plugin_pages.readme_steps(readme, "### Option 2")
        self.assertGreaterEqual(option_1.count("<li>"), 6)
        self.assertIn("<code>Install-DeckyHub.desktop</code>", option_1)
        self.assertIn('<a href="https://github.com/mazillka/deckyhub-plugin/releases/latest/download/Install-DeckyHub.desktop">', option_1)
        self.assertIn("<strong>Execute</strong>", option_1)
        self.assertGreaterEqual(option_2.count("<li>"), 3)
        self.assertNotIn("Install-DeckyHub.desktop", option_2)  # each option has its own steps

    def test_inline_markdown_escapes_html(self):
        self.assertEqual(plugin_pages.inline_markdown("a <b> & **c**"), "a &lt;b&gt; &amp; <strong>c</strong>")

if __name__ == "__main__":
    unittest.main()
