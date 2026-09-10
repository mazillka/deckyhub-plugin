import asyncio
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.modules.setdefault("decky", types.SimpleNamespace())
import main
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

    def test_scan_installed_plugin_adds_and_protects_its_repository(self):
        with tempfile.TemporaryDirectory() as home:
            plugin_dir = Path(home) / "plugins" / "example"
            plugin_dir.mkdir(parents=True)
            (plugin_dir / "plugin.json").write_text(json.dumps({"name": "Example"}), encoding="utf-8")
            (plugin_dir / "package.json").write_text(json.dumps({"version": "1.0.0", "repository": "https://github.com/owner/example.git"}), encoding="utf-8")
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings = {"verifySha256": True, "overwriteExisting": False, "customRepos": []}
            plugin.apps = []

            self.assertEqual(asyncio.run(plugin.scan_installed_repos())["added"], ["owner/example"])
            self.assertEqual(asyncio.run(plugin.get_custom_repos())["repos"], [{"repo": "owner/example", "installed": True}])
            self.assertEqual(asyncio.run(plugin.get_apps())["apps"][0]["installedVersion"], "1.0.0")
            with self.assertRaises(ValueError):
                asyncio.run(plugin.remove_custom_repo("owner/example"))

    def test_uninstalled_custom_repository_can_be_removed(self):
        with tempfile.TemporaryDirectory() as home:
            Path(home, "plugins").mkdir()
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings = {"verifySha256": True, "overwriteExisting": False, "customRepos": ["owner/unused"]}
            plugin.apps = []

            result = asyncio.run(plugin.remove_custom_repo("owner/unused"))

            self.assertTrue(result["removed"])
            self.assertEqual(plugin.settings["customRepos"], [])

    def test_custom_repository_export_and_import(self):
        with tempfile.TemporaryDirectory() as home:
            original_download_dir = main.DEFAULT_DOWNLOAD_DIR
            main.DEFAULT_DOWNLOAD_DIR = str(Path(home) / "Downloads")
            try:
                plugin = Plugin()
                plugin.settings_path = Path(home) / "settings.json"
                plugin.settings = {"verifySha256": True, "overwriteExisting": False, "customRepos": ["owner/one"]}
                plugin.apps = []

                exported = Path(asyncio.run(plugin.export_custom_repos())["path"])
                exported.write_text(json.dumps({"schemaVersion": 1, "repos": ["owner/one", "owner/two", "bad"]}), encoding="utf-8")
                result = asyncio.run(plugin.import_custom_repos(str(exported)))

                self.assertEqual(result["added"], ["owner/two"])
                self.assertEqual(plugin.settings["customRepos"], ["owner/one", "owner/two"])
            finally:
                main.DEFAULT_DOWNLOAD_DIR = original_download_dir


if __name__ == "__main__":
    unittest.main()
