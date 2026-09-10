import asyncio
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.modules.setdefault("decky", types.SimpleNamespace())
from main import Plugin


class PluginStatusTests(unittest.TestCase):
    def test_decky_plugin_detection_reads_manifest_and_package_version(self):
        with tempfile.TemporaryDirectory() as home:
            plugin_dir = Path(home) / "plugins" / "mako"
            plugin_dir.mkdir(parents=True)
            (plugin_dir / "plugin.json").write_text(json.dumps({"name": "MAKO Decky"}), encoding="utf-8")
            (plugin_dir / "package.json").write_text(json.dumps({"version": "3.2.1"}), encoding="utf-8")
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()

            self.assertEqual(plugin._installed_version({"detect": {"type": "decky-plugin", "names": ["MAKO Decky"]}}), "3.2.1")

    def test_overwrite_setting_defaults_to_false(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            settings = asyncio.run(plugin.save_settings({"downloadFolder": "/home/deck/Downloads"}))

            self.assertFalse(settings["overwriteExisting"])


if __name__ == "__main__":
    unittest.main()
