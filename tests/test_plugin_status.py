import asyncio
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

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

    def test_decky_framegen_detection_matches_its_manifest_name(self):
        with tempfile.TemporaryDirectory() as home:
            plugin_dir = Path(home) / "plugins" / "decky-framegen"
            plugin_dir.mkdir(parents=True)
            (plugin_dir / "plugin.json").write_text(json.dumps({"name": "Decky-Framegen"}), encoding="utf-8")
            (plugin_dir / "package.json").write_text(json.dumps({"version": "1.2.3"}), encoding="utf-8")
            sys.modules["decky"].DECKY_HOME = home

            self.assertEqual(Plugin()._installed_version({"detect": {"type": "decky-plugin", "names": ["Decky-Framegen", "Decky Framegen"]}}), "1.2.3")

    def test_overwrite_setting_defaults_to_false(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            settings = asyncio.run(plugin.save_settings({}))

            self.assertTrue(settings["overwriteExisting"])
            self.assertEqual(settings["downloadLocation"], "plugins")
            self.assertEqual(plugin._asset_download_dir(), Path(main.PLUGIN_DOWNLOAD_DIR))
            self.assertEqual(asyncio.run(plugin.save_settings({"downloadLocation": "downloads"}))["downloadLocation"], "downloads")
            self.assertEqual(plugin._asset_download_dir(), Path(main.DEFAULT_DOWNLOAD_DIR))

    def test_update_channel_defaults_to_stable_and_accepts_prerelease(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            self.assertEqual(asyncio.run(plugin.save_settings({}))["updateChannel"], "stable")
            self.assertEqual(asyncio.run(plugin.save_settings({"updateChannel": "prerelease"}))["updateChannel"], "prerelease")

    def test_deckyhub_version_has_a_fallback_when_package_is_not_extracted(self):
        with tempfile.TemporaryDirectory() as home, patch.object(sys.modules["decky"], "DECKY_PLUGIN_DIR", home, create=True), patch.object(main, "PLUGIN_DIR", home):
            self.assertEqual(asyncio.run(Plugin().get_deckyhub_info())["version"], main.DECKYHUB_VERSION)

    def test_update_rejects_untrusted_asset_url(self):
        with self.assertRaises(ValueError):
            asyncio.run(Plugin().install_deckyhub_update({"name": "DeckyHub.zip", "url": "https://example.com/DeckyHub.zip"}))

    def test_update_requires_release_checksum(self):
        with self.assertRaises(ValueError):
            asyncio.run(Plugin().install_deckyhub_update({"name": "DeckyHub-v1.zip", "url": "https://github.com/mazillka/deckyhub-plugin/releases/download/v1/DeckyHub-v1.zip"}))

    def test_update_uses_the_configured_download_folder(self):
        async def begin_update():
            with tempfile.TemporaryDirectory() as home:
                plugin = Plugin()
                plugin.settings = {"downloadLocation": "plugins", "overwriteExisting": True}
                plugin.downloads, plugin.cancelled = {}, set()
                target_dir = Path(home) / "plugins"
                asset = {"name": "DeckyHub-v1.zip", "url": "https://github.com/mazillka/deckyhub-plugin/releases/download/v1/DeckyHub-v1.zip", "sha256": "a" * 64}
                with patch.object(plugin, "_asset_download_dir", return_value=target_dir), patch("main.asyncio.create_task") as create_task:
                    result = await plugin.install_deckyhub_update(asset)
                    create_task.call_args.args[0].close()
                return plugin.downloads[result["jobId"]]["path"]

        self.assertTrue(asyncio.run(begin_update()).endswith(str(Path("plugins") / "DeckyHub-v1.zip")))

    def test_download_reports_progress_before_one_megabyte(self):
        class Response:
            headers = {"Content-Length": "3"}
            reads = []

            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self, size):
                self.reads.append(size)
                return b"abc" if len(self.reads) == 1 else b""

        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.downloads = {"job": {"received": 0, "total": 0}}
            plugin.cancelled = set()
            response = Response()
            with patch("main.urlopen", return_value=response):
                plugin._download_with_urllib("job", {"url": "https://example.com/file.zip"}, Path(home) / "file.part")

            self.assertEqual(response.reads[0], 64 * 1024)
            self.assertEqual(plugin.downloads["job"]["received"], 3)

    def test_curl_download_uses_system_libraries(self):
        class Process:
            returncode = 0
            def poll(self): return 0

        with tempfile.TemporaryDirectory() as home:
            temp = Path(home) / "file.part"
            temp.write_bytes(b"zip")
            plugin = Plugin()
            plugin.downloads = {"job": {"received": 0}}
            plugin.cancelled = set()
            with patch("main.shutil.which", return_value="/usr/bin/curl"), patch("main.subprocess.Popen", return_value=Process()) as popen, patch.dict("main.os.environ", {"LD_LIBRARY_PATH": "/tmp/_MEI"}, clear=True):
                plugin._download_with_curl("job", {"url": "https://example.com/file.zip"}, temp)

            command = popen.call_args.args[0]
            environment = popen.call_args.kwargs["env"]
            self.assertEqual(command[0], "/usr/bin/curl")
            self.assertNotIn("LD_LIBRARY_PATH", environment)

    def test_custom_repository_is_saved(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings = {"verifySha256": True, "overwriteExisting": False, "customRepos": []}
            plugin.apps = []

            result = asyncio.run(plugin.add_custom_repo("owner/repository"))

            self.assertTrue(result["added"])
            self.assertEqual(plugin._custom_apps()[0]["repo"], "owner/repository")

    def test_get_apps_includes_default_and_custom_repositories(self):
        with tempfile.TemporaryDirectory() as home:
            Path(home, "plugins").mkdir()
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()
            plugin.settings = {"customRepos": ["owner/custom"]}
            plugin.apps = [{"repo": "owner/default", "detect": {"type": "decky-plugin", "repo": "owner/default"}}]

            self.assertEqual([app["repo"] for app in asyncio.run(plugin.get_apps())["apps"]], ["owner/default", "owner/custom"])

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
