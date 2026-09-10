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
            (plugin_dir / "plugin.json").write_text(json.dumps({"name": "MAKO - Frame Generation"}), encoding="utf-8")
            (plugin_dir / "package.json").write_text(json.dumps({"version": "3.2.1"}), encoding="utf-8")
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()

            self.assertEqual(plugin._installed_version({"detect": {"type": "decky-plugin", "names": ["MAKO - Frame Generation", "MAKO Decky"]}}), "3.2.1")

    def test_overwrite_setting_defaults_to_false(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            settings = asyncio.run(plugin.save_settings({}))

            self.assertFalse(settings["overwriteExisting"])

    def test_update_rejects_untrusted_asset_url(self):
        with self.assertRaises(ValueError):
            asyncio.run(Plugin().install_deckyhub_update({"name": "DeckyHub.zip", "url": "https://example.com/DeckyHub.zip"}))

    def test_custom_repository_is_saved(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings = {"verifySha256": True, "overwriteExisting": False, "customRepos": []}
            plugin.apps = []

            result = asyncio.run(plugin.add_custom_repo("owner/repository"))

            self.assertTrue(result["added"])
            self.assertEqual(plugin._custom_apps()[0]["repo"], "owner/repository")


if __name__ == "__main__":
    unittest.main()
