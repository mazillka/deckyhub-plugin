import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class DocsTests(unittest.TestCase):
    def test_readme_bundled_table_matches_registry(self):
        registry = [app["repo"] for app in json.loads((ROOT / "registry" / "apps.json").read_text(encoding="utf-8"))["apps"]]
        section = (ROOT / "README.md").read_text(encoding="utf-8").split("## Bundled repositories", 1)[1].split("\n## ", 1)[0]
        self.assertEqual(re.findall(r"^\|.*\|.*\| \[([^\]]+)\]", section, re.M), registry)

    def test_sitemap_lists_every_page(self):
        sitemap = (ROOT / "docs" / "sitemap.xml").read_text(encoding="utf-8")
        for page in (ROOT / "docs").glob("*.html"):
            url = "https://mazillka.github.io/deckyhub-plugin/" + ("" if page.name == "index.html" else page.name)
            self.assertIn(f"<loc>{url}</loc>", sitemap)

    def test_site_screenshots_exist(self):
        for shot in (ROOT / "screenshots").glob("*.jpg"):
            for suffix in ("", "-640"):
                self.assertTrue((ROOT / "docs" / "img" / f"{shot.stem}{suffix}.webp").exists(), f"{shot.stem}{suffix}.webp missing")


if __name__ == "__main__":
    unittest.main()
