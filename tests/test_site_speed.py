"""What keeps deckyhub.com fast: the home page's walkthrough is the animated WebP (about a third of the GIF)
for every browser that can show it, and the pages that load the remote-install modules fetch them together."""

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "devtools"))
import plugin_pages  # noqa: E402


class SiteSpeedTests(unittest.TestCase):
    def test_the_home_page_offers_the_animated_webp_before_the_gif(self):
        for path, prefix in (("docs/index.html", ""), ("docs/uk/index.html", "../")):
            page = (ROOT / path).read_text(encoding="utf-8")
            picture = page[page.index("<picture>") : page.index("</picture>")]
            self.assertIn(f'<source type="image/webp" srcset="{prefix}img/deckyhub.webp">', picture, path)
            # The GIF stays as the fallback, after the WebP, and the reduced-motion still comes first.
            self.assertLess(picture.index("prefers-reduced-motion"), picture.index("image/webp"), path)
            self.assertLess(picture.index("image/webp"), picture.index(f'src="{prefix}img/deckyhub.gif"'), path)

    def test_every_page_that_loads_the_remote_modules_preloads_the_ones_they_import(self):
        imports = set()
        for name in (
            "remote-install.js",
            "remote-scan.js",
            "remote-share.js",
            "remote-plugins.js",
            "remote-updates.js",
        ):
            imports |= set(
                re.findall(r"from '\./(remote-[\w-]+\.js)'", (ROOT / "docs" / name).read_text(encoding="utf-8"))
            )
        # The markup of the pages that load the remote-install scripts lives in these two modules.
        source = "".join(
            (ROOT / "devtools" / f"{name}.py").read_text(encoding="utf-8") for name in ("remote_panel", "catalog_pages")
        )
        scripts = source.count('<script type="module" src="/remote-install.js"></script>')
        self.assertEqual(scripts, 3)
        for name in imports:
            self.assertEqual(source.count(f'<link rel="modulepreload" href="/{name}">'), scripts, name)
        self.assertEqual(len(imports), 6)

    def test_the_installed_app_asks_the_server_before_using_a_cached_file(self):
        worker = (ROOT / "docs" / "remote-install" / "sw.js").read_text(encoding="utf-8")
        self.assertIn("fetch(request, { cache: 'no-cache' })", worker)

    def test_the_catalog_skips_painting_cards_that_are_off_screen(self):
        self.assertIn("content-visibility:auto", plugin_pages.EXTRA_STYLE)


if __name__ == "__main__":
    unittest.main()
