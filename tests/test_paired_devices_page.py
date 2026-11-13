"""The Paired devices page (devtools/plugin_pages.py): adding a device in a window, and the Ukrainian page."""

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "devtools"))
import plugin_pages
import remote_page_uk

SHELL = plugin_pages.shell_of((ROOT / "docs" / "releases.html").read_text(encoding="utf-8"))


def ids(html):
    return re.findall(r'\bid="([^"]+)"', html)


class AddDeviceWindowTests(unittest.TestCase):
    def test_add_device_is_a_button_that_opens_a_window_holding_the_pairing_form(self):
        page = plugin_pages.remote_device_panel()
        self.assertIn('<button type="button" id="remote-pair-another" class="btn">', page)
        window = page.split('<dialog id="remote-add-dialog"', 1)[1].split("</dialog>", 1)[0]
        for part in ("remote-pair-form", "remote-pairing-link", "remote-code", "remote-pair", "remote-dialog-status"):
            self.assertIn(f'id="{part}"', window)
        # Nothing of the pairing is left in the page behind it.
        outside = page.replace(window, "")
        self.assertNotIn('id="remote-pair-form"', outside)
        self.assertNotIn("Add a device in 3 steps", page)


class UkrainianPageTests(unittest.TestCase):
    def test_the_ukrainian_panel_has_the_same_elements_and_no_english_left_in_what_it_translates(self):
        english, ukrainian = plugin_pages.remote_device_panel(), plugin_pages.remote_device_panel("uk")
        self.assertEqual(ids(english), ids(ukrainian))
        for text, _ in remote_page_uk.PANEL:
            self.assertIn(text, english)
        self.assertNotIn("Add device", ukrainian)
        self.assertIn("+ Додати пристрій", ukrainian)
        self.assertIn('href="/uk/help.html#remote"', ukrainian)

    def test_a_changed_english_sentence_fails_the_build(self):
        with self.assertRaises(ValueError):
            remote_page_uk.translate("<p>nothing here</p>")

    def test_the_page_is_ukrainian_and_links_to_the_english_one(self):
        page = plugin_pages.paired_devices_page(SHELL, lang="uk", path="uk/paired-devices/")
        self.assertIn('<html lang="uk">', page)
        self.assertIn("До змісту", page)
        self.assertIn('<link rel="alternate" hreflang="en" href="https://deckyhub.com/paired-devices/">', page)
        self.assertIn('href="https://deckyhub.com/paired-devices/" hreflang="en" lang="en">English</a>', page)
        self.assertIn("Підтримати на Ko-fi", page)

    def test_the_english_page_links_to_the_ukrainian_one(self):
        page = plugin_pages.paired_devices_page(SHELL)
        self.assertIn('<html lang="en">', page)
        self.assertIn('hreflang="uk" lang="uk">Українська</a>', page)
        self.assertIn('href="https://deckyhub.com/uk/remote-install/"', page)


if __name__ == "__main__":
    unittest.main()
