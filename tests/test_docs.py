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

    def test_the_guide_pages_exist_and_every_guide_link_in_a_readme_or_help_page_reaches_a_heading(self):
        import re

        for readme, guide, prefix in (
            ("README.md", "docs/guide.html", "https://deckyhub.com/guide.html#"),
            ("README.uk.md", "docs/uk/guide.html", "https://deckyhub.com/uk/guide.html#"),
        ):
            text = (ROOT / guide).read_text(encoding="utf-8")
            self.assertIn("<h1>", text, guide)
            for anchor in re.findall(re.escape(prefix) + r"([^)\s\"]+)", (ROOT / readme).read_text(encoding="utf-8")):
                self.assertIn(f'id="{anchor}"', text, f"{readme} links to {guide}#{anchor}")
        for page in ("docs/help.html", "docs/uk/help.html"):
            self.assertIn("guide.html", (ROOT / page).read_text(encoding="utf-8"), page)
        sitemap = (ROOT / "docs" / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("<loc>https://deckyhub.com/uk/guide.html</loc>", sitemap)
        self.assertIn("<loc>https://deckyhub.com/uk/authors.html</loc>", sitemap)
        for page in ("docs/contribute/index.html", "docs/uk/contribute/index.html", "docs/about.html", "docs/uk/about.html"):
            self.assertIn("authors.html", (ROOT / page).read_text(encoding="utf-8"), page)

    def test_the_markdown_copies_of_help_and_guide_match_the_pages(self):
        import sys

        sys.path.insert(0, str(ROOT / "devtools"))
        import html_to_md

        for path, text in html_to_md.build().items():
            self.assertEqual(path.read_text(encoding="utf-8"), text, f"{path.name}: run python devtools/html_to_md.py")


if __name__ == "__main__":
    unittest.main()
