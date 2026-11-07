import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class DocsTests(unittest.TestCase):
    def test_sitemap_lists_every_page(self):
        sitemap = (ROOT / "docs" / "sitemap.xml").read_text(encoding="utf-8")
        for page in (ROOT / "docs").glob("*.html"):
            if page.name == "404.html":
                continue
            url = "https://deckyhub.com/" + ("" if page.name == "index.html" else page.name)
            self.assertIn(f"<loc>{url}</loc>", sitemap)

    def test_the_site_uses_its_own_domain_and_welcomes_crawlers(self):
        docs = ROOT / "docs"
        for page in [
            *docs.glob("*.html"),
            docs / "sitemap.xml",
            docs / "llms.txt",
            ROOT / "devtools" / "build-site.py",
        ]:
            self.assertNotIn("mazillka.github.io", page.read_text(encoding="utf-8"), page.name)
        robots = (docs / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("Sitemap: https://deckyhub.com/sitemap.xml", robots)
        # Nothing is blocked, except the develop preview (a copy of the site that must stay out of search).
        self.assertEqual(
            [line for line in robots.splitlines() if line.startswith("Disallow:") and line != "Disallow: /develop/"], []
        )
        self.assertNotIn("Disallow: /\n", robots + "\n")
        llms = (docs / "llms.txt").read_text(encoding="utf-8")
        self.assertTrue(llms.startswith("# DeckyHub\n\n> "), "llms.txt opens with a title and a one-line summary")


if __name__ == "__main__":
    unittest.main()
