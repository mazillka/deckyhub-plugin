import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "devtools"))
import media_coverage  # noqa: E402


def entry(**changes):
    return {
        "id": "a",
        "publisher": "Example News",
        "title": "DeckyHub reviewed",
        "url": "https://example.com/deckyhub",
        "publishedAt": "2026-11-02",
        "description": "",
        "logo": None,
        "language": "en",
        "type": "news",
        "featured": True,
        "visible": True,
    } | changes


class MediaCoverageTests(unittest.TestCase):
    def test_the_real_data_file_is_valid_and_its_links_are_https(self):
        entries = media_coverage.load(ROOT / "docs" / "media-coverage.json")
        self.assertTrue(entries)
        self.assertTrue(all(item["url"].startswith("https://") for item in entries))

    def test_bad_entries_fail_validation(self):
        for label, bad in {
            "http link": entry(url="http://example.com/a"),
            "script scheme": entry(url="javascript:alert(1)"),
            "no host": entry(url="https:///a"),
            "login in the link": entry(url="https://user:pass@example.com/a"),
            "date": entry(publishedAt="2026-13-40"),
            "date format": entry(publishedAt="Nov 2"),
            "type": entry(type="podcast"),
            "language": entry(language="english please"),
            "visible": entry(visible="yes"),
            "missing title": entry(title=" "),
            "logo outside docs": entry(logo="../secret.png"),
            "remote logo": entry(logo="https://example.com/logo.png"),
            "missing logo file": entry(logo="img/none.png"),
        }.items():
            with self.subTest(label), self.assertRaises(ValueError):
                media_coverage.validate([bad], ROOT / "docs")
        with self.assertRaises(ValueError):
            media_coverage.validate([entry(), entry(title="Another")], ROOT / "docs")

    def test_a_logo_inside_docs_is_accepted_and_shown_instead_of_the_name(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder) / "logo.svg").write_text("<svg/>", encoding="utf-8")
            item = entry(logo="logo.svg")
            media_coverage.validate([item], Path(folder))
        html = media_coverage.card(item)
        self.assertIn('<img src="/logo.svg" alt="Example News">', html)
        self.assertNotIn("<strong>", html)
        self.assertIn("<strong>Example News</strong>", media_coverage.card(entry()))

    def test_newest_first_ties_by_id_hidden_ones_never_shown_and_at_most_four_featured(self):
        entries = [
            entry(id="old", publishedAt="2026-01-01"),
            entry(id="b", publishedAt="2026-06-01"),
            entry(id="a", publishedAt="2026-06-01"),
            entry(id="hidden", publishedAt="2026-12-01", visible=False),
            entry(id="plain", publishedAt="2026-05-01", featured=False),
            *[entry(id=f"f{number}", publishedAt=f"2026-0{number}-15") for number in range(2, 6)],
        ]
        media_coverage.validate(entries, ROOT / "docs")
        self.assertEqual([item["id"] for item in media_coverage.visible(entries)][:3], ["a", "b", "f5"])
        self.assertNotIn("hidden", [item["id"] for item in media_coverage.visible(entries)])
        self.assertEqual(len(media_coverage.featured(entries)), 4)
        self.assertNotIn("plain", [item["id"] for item in media_coverage.featured(entries)])
        self.assertEqual(media_coverage.newest_date(entries), "2026-06-01")
        self.assertIsNone(media_coverage.newest_date([entry(visible=False)]))

    def test_text_is_escaped_and_links_open_safely(self):
        html = media_coverage.card(
            entry(title="<script>alert(1)</script> & more", publisher='"><img src=x>', description="<b>hi</b>")
        )
        self.assertNotIn("<script>", html)
        self.assertNotIn("<img", html)
        self.assertNotIn("<b>", html)
        self.assertIn('target="_blank" rel="noopener noreferrer"', html)
        self.assertIn("(opens in a new tab)", html)

    def test_the_home_section_is_empty_without_featured_entries_and_links_to_the_press_page(self):
        self.assertEqual(media_coverage.featured_in([entry(featured=False)]), "")
        section = media_coverage.featured_in([entry()])
        self.assertIn('<a class="btn ghost" href="press">View all coverage</a>', section)
        self.assertIn("don't endorse it", section)
        self.assertIn("Усі публікації", media_coverage.featured_in([entry()], "../press", uk=True))

    def test_the_press_page_lists_every_visible_entry_and_says_it_is_not_an_endorsement(self):
        body = media_coverage.press_body([entry(id="a"), entry(id="b", visible=False, title="Hidden one")])
        self.assertIn("<h1>DeckyHub in the media</h1>", body)
        self.assertIn("DeckyHub reviewed", body)
        self.assertNotIn("Hidden one", body)
        self.assertIn("isn't an endorsement", body)
        self.assertIn("No coverage to show yet.", media_coverage.press_body([]))


if __name__ == "__main__":
    unittest.main()
