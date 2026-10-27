import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class DocsTests(unittest.TestCase):
    def test_sitemap_lists_every_page(self):
        sitemap = (ROOT / "docs" / "sitemap.xml").read_text(encoding="utf-8")
        for page in (ROOT / "docs").glob("*.html"):
            if page.name == "404.html":
                continue
            url = "https://mazillka.github.io/deckyhub-plugin/" + ("" if page.name == "index.html" else page.name)
            self.assertIn(f"<loc>{url}</loc>", sitemap)


if __name__ == "__main__":
    unittest.main()
