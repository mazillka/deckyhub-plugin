import asyncio
import json
import logging
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub import backups, leftovers  # noqa: E402


class LeftoverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        decky = sys.modules["decky"]
        self.originals = {key: getattr(decky, key, None) for key in ("DECKY_HOME", "DECKY_PLUGIN_SETTINGS_DIR")}
        decky.DECKY_HOME = str(self.home)
        decky.DECKY_PLUGIN_SETTINGS_DIR = str(self.home / "settings" / "DeckyHub")
        for area in leftovers.AREAS:
            (self.home / area).mkdir()
        self.make("Installed", installed=True)
        self.make("Gone Plugin", sizes={"settings": 10, "data": 90})
        self.make("Old Logs Only", sizes={"logs": 5})

    def tearDown(self):
        decky = sys.modules["decky"]
        for key, value in self.originals.items():
            if value is None:
                delattr(decky, key)
            else:
                setattr(decky, key, value)
        self.temp.cleanup()

    def make(self, folder, installed=False, sizes=None):
        if installed:
            (self.home / "plugins" / folder).mkdir(parents=True)
            (self.home / "plugins" / folder / "plugin.json").write_text(json.dumps({"name": folder}), encoding="utf-8")
            sizes = {"settings": 3, "data": 3}
        for area, size in sizes.items():
            (self.home / area / folder).mkdir(parents=True, exist_ok=True)
            (self.home / area / folder / "file.bin").write_bytes(b"x" * size)

    def test_only_folders_no_installed_plugin_owns_are_found_with_their_size_and_areas(self):
        (self.home / "settings" / "DeckyHub").mkdir()
        (self.home / "settings" / ".hidden").mkdir()
        (self.home / "settings" / "loader.json").write_text("{}", encoding="utf-8")
        (self.home / "data" / "decky-loader").mkdir()
        found = leftovers.scan()
        self.assertEqual([item["name"] for item in found], ["Gone Plugin", "Old Logs Only"])
        self.assertEqual(found[0]["areas"], ["settings", "data"])
        self.assertEqual(found[0]["size"], 100)
        self.assertGreater(found[0]["modified"], 0)

    def test_a_link_is_never_offered_or_followed(self):
        outside = Path(tempfile.mkdtemp())
        (outside / "precious.txt").write_text("keep", encoding="utf-8")
        try:
            os.symlink(outside, self.home / "settings" / "Linked", target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("symbolic links aren't available here")
        self.assertNotIn("Linked", [item["name"] for item in leftovers.scan()])
        self.assertEqual(leftovers.remove(["Linked"])["removed"], 0)
        self.assertTrue((outside / "precious.txt").exists())

    def test_removing_backs_up_the_settings_first_and_frees_every_area(self):
        result = leftovers.remove(["Gone Plugin"])
        self.assertEqual((result["removed"], result["freed"], result["skipped"]), (1, 100, []))
        for area in leftovers.AREAS:
            self.assertFalse((self.home / area / "Gone Plugin").exists())
        self.assertEqual([item["plugin"] for item in backups.list_backups()], ["Gone Plugin"])
        # ...so a mistaken pick can be undone.
        backups.restore_backup("Gone Plugin", backups.list_backups()[0]["file"])
        self.assertTrue((self.home / "settings" / "Gone Plugin" / "file.bin").exists())

    def test_installed_protected_hidden_unknown_and_climbing_names_are_left_alone(self):
        outside = self.home / "outside"
        outside.mkdir()
        names = ["Installed", "DeckyHub", "deckyhub", ".hidden", "Missing", "../outside", "a/b", ""]
        result = leftovers.remove(names)
        self.assertEqual(result["removed"], 0)
        self.assertEqual(result["skipped"], names)
        self.assertTrue((self.home / "settings" / "Installed").exists())
        self.assertTrue(outside.exists())

    def test_a_settings_folder_too_big_to_back_up_is_not_removed(self):
        original = backups.MAX_BYTES
        backups.MAX_BYTES = 5
        try:
            result = leftovers.remove(["Gone Plugin"])
        finally:
            backups.MAX_BYTES = original
        self.assertEqual((result["removed"], result["skipped"]), (0, ["Gone Plugin"]))
        self.assertTrue((self.home / "data" / "Gone Plugin").exists())

    def test_the_rpc_rejects_a_bad_list(self):
        mixin = leftovers.LeftoversMixin()
        self.assertIn("error", asyncio.run(mixin.remove_leftovers("Gone Plugin")))
        self.assertIn("error", asyncio.run(mixin.remove_leftovers([1, 2])))
        self.assertEqual(len(asyncio.run(mixin.scan_leftovers())["items"]), 2)


if __name__ == "__main__":
    unittest.main()
