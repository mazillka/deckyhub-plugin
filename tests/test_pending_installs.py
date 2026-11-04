"""The plugins picked in the Desktop Mode installer's checklist (pending-installs.json) are read
by the backend and only repositories the loaded registry lists get through."""
import asyncio
import json
import logging
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
import main  # noqa: E402
from main import PENDING_INSTALLS_FILE, Plugin  # noqa: E402

APPS = [{"id": "mako-decky", "name": "MAKO Decky", "repo": "eugeniosegala/MAKO"}, {"id": "css-loader", "name": "CSS Loader", "repo": "DeckThemes/SDH-CssLoader"}]


class PendingInstallsTests(unittest.TestCase):
    def plugin(self, home: str) -> Plugin:
        sys.modules["decky"].DECKY_PLUGIN_SETTINGS_DIR = home
        plugin = Plugin()
        plugin.apps = APPS
        return plugin

    def run_pending(self, saved, plugin=None):
        with tempfile.TemporaryDirectory() as home:
            plugin = plugin or self.plugin(home)
            if saved is not None:
                (Path(home) / PENDING_INSTALLS_FILE).write_text(saved if isinstance(saved, str) else json.dumps(saved), encoding="utf-8")
            return asyncio.run(plugin.get_pending_installs())

    def test_listed_repositories_come_back_in_the_registrys_spelling(self):
        self.assertEqual(self.run_pending(["eugeniosegala/mako", "DeckThemes/SDH-CssLoader"]), ["eugeniosegala/MAKO", "DeckThemes/SDH-CssLoader"])

    def test_anything_the_registry_doesnt_list_is_dropped(self):
        self.assertEqual(self.run_pending(["evil/not-listed", "../../etc/passwd", 7, None, "eugeniosegala/MAKO", "eugeniosegala/MAKO"]), ["eugeniosegala/MAKO"])

    def test_a_missing_or_broken_file_means_nothing_pending(self):
        self.assertEqual(self.run_pending(None), [])
        self.assertEqual(self.run_pending("not json"), [])
        self.assertEqual(self.run_pending({"repo": "eugeniosegala/MAKO"}), [])

    def test_clearing_removes_the_file_and_is_safe_twice(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            path = Path(home) / PENDING_INSTALLS_FILE
            path.write_text('["eugeniosegala/MAKO"]', encoding="utf-8")
            self.assertEqual(asyncio.run(plugin.clear_pending_installs()), {"cleared": True})
            self.assertFalse(path.exists())
            asyncio.run(plugin.clear_pending_installs())
            self.assertEqual(asyncio.run(plugin.get_pending_installs()), [])


if __name__ == "__main__":
    unittest.main()
