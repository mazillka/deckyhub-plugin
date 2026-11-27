import json
import logging
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub import health  # noqa: E402


class HealthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        decky = sys.modules["decky"]
        self.old = getattr(decky, "DECKY_HOME", None)
        decky.DECKY_HOME = str(self.home)

    def tearDown(self):
        if self.old is not None:
            sys.modules["decky"].DECKY_HOME = self.old
        self.temp.cleanup()

    def put(self, path: str, content: str):
        target = self.home / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return target

    def plugin(self, folder: str, name: str):
        return self.put(f"plugins/{folder}/plugin.json", json.dumps({"name": name}))

    def test_each_plugins_folders_are_summed_and_the_biggest_comes_first(self):
        manifest = self.plugin("small", "Small")
        self.plugin("big", "Big")
        self.put("settings/big/a.json", "x" * 10)
        self.put("data/big/deep/er/blob", "x" * 5000)
        log = self.put("logs/big/one.log", "x" * 20)
        os.utime(log, (1_700_000_000, 1_700_000_000))
        rows = health.scan()
        self.assertEqual([row["name"] for row in rows], ["Big", "Small"])
        self.assertEqual(
            {k: v for k, v in rows[0]["sizes"].items() if k != "plugins"}, {"settings": 10, "data": 5000, "logs": 20}
        )
        self.assertEqual(rows[0]["logsChanged"], 1_700_000_000_000)
        # No folder is empty, not unknown; with no log files there is no time to show.
        self.assertEqual(rows[1]["sizes"], {"plugins": manifest.stat().st_size, "settings": 0, "data": 0, "logs": 0})
        self.assertEqual(rows[1]["logsChanged"], 0)

    def test_a_folder_that_cannot_be_read_is_unknown_not_empty(self):
        self.plugin("locked", "Locked")
        self.put("data/locked/sub/file", "x" * 100)
        real = os.scandir

        def scandir(path):
            if Path(path).name == "sub":
                raise PermissionError(path)
            return real(path)

        with patch.object(health.os, "scandir", scandir):
            (row,) = health.scan()
        self.assertIsNone(row["sizes"]["data"])
        self.assertEqual(row["sizes"]["settings"], 0)

    def test_a_broken_manifest_still_gets_a_row_under_its_folder_name(self):
        self.put("plugins/broken/plugin.json", "{nope")
        self.assertEqual([row["name"] for row in health.scan()], ["broken"])


if __name__ == "__main__":
    unittest.main()
