import asyncio
import hashlib
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

            installed_plugins = plugin._scan_installed_plugins()
            self.assertEqual(plugin._installed_version({"detect": {"type": "decky-plugin", "names": ["MAKO - Frame Generation", "MAKO Decky"]}}, installed_plugins), "3.2.1")

    def test_get_apps_reports_the_installed_plugin_name(self):
        with tempfile.TemporaryDirectory() as home:
            plugin_dir = Path(home) / "plugins" / "mako"
            plugin_dir.mkdir(parents=True)
            (plugin_dir / "plugin.json").write_text(json.dumps({"name": "MAKO - Frame Generation", "version": "3.2.1"}), encoding="utf-8")
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()
            plugin.settings = {"customRepos": []}
            plugin.apps = [
                {"repo": "owner/mako", "detect": {"type": "decky-plugin", "names": ["MAKO Decky", "MAKO - Frame Generation"]}},
                {"repo": "owner/missing", "detect": {"type": "decky-plugin", "names": ["Missing"]}},
            ]

            apps = asyncio.run(plugin.get_apps())["apps"]
            self.assertEqual([(app["installedVersion"], app["pluginName"]) for app in apps], [("3.2.1", "MAKO - Frame Generation"), (None, None)])

    def test_decky_framegen_detection_matches_its_manifest_name(self):
        with tempfile.TemporaryDirectory() as home:
            plugin_dir = Path(home) / "plugins" / "decky-framegen"
            plugin_dir.mkdir(parents=True)
            (plugin_dir / "plugin.json").write_text(json.dumps({"name": "Decky-Framegen"}), encoding="utf-8")
            (plugin_dir / "package.json").write_text(json.dumps({"version": "1.2.3"}), encoding="utf-8")
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()

            installed_plugins = plugin._scan_installed_plugins()
            self.assertEqual(plugin._installed_version({"detect": {"type": "decky-plugin", "names": ["Decky-Framegen", "Decky Framegen"]}}, installed_plugins), "1.2.3")

    def test_overwrite_setting_defaults_to_false(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            settings = asyncio.run(plugin.save_settings({}))

            self.assertTrue(settings["overwriteExisting"])
            self.assertNotIn("downloadLocation", asyncio.run(plugin.save_settings({"downloadLocation": "downloads"})))

    def test_github_token_is_trimmed_and_persisted(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            saved = asyncio.run(plugin.save_settings({"githubToken": "  ghp_example  "}))
            self.assertEqual(saved["githubToken"], "ghp_example")

            reloaded = plugin._load_settings()
            self.assertEqual(reloaded["githubToken"], "ghp_example")

    def test_github_token_defaults_to_empty_and_rejects_non_string(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            self.assertEqual(asyncio.run(plugin.save_settings({}))["githubToken"], "")
            for bogus in (12345, None, [], {}, 1.5, True):
                self.assertEqual(asyncio.run(plugin.save_settings({"githubToken": bogus}))["githubToken"], "", msg=f"value: {bogus!r}")

    def test_github_token_is_capped_at_255_characters(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            saved = asyncio.run(plugin.save_settings({"githubToken": "x" * 400}))
            self.assertEqual(len(saved["githubToken"]), 255)

    def test_github_token_whitespace_only_becomes_empty(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            self.assertEqual(asyncio.run(plugin.save_settings({"githubToken": "   "}))["githubToken"], "")

    def test_loading_settings_from_before_github_token_existed_defaults_it_to_empty(self):
        # Simulates a user upgrading from a version of DeckyHub that predates
        # this setting: their on-disk settings.json simply has no such key.
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings_path.write_text(json.dumps({"overwriteExisting": True, "updateChannel": "stable"}), encoding="utf-8")

            loaded = plugin._load_settings()
            self.assertEqual(loaded["githubToken"], "")

    def test_clear_downloads_only_removes_deckyhub_contents(self):
        with tempfile.TemporaryDirectory() as home:
            original_download_dir = main.PLUGIN_DOWNLOAD_DIR
            main.PLUGIN_DOWNLOAD_DIR = str(Path(home) / "Downloads" / "deckyhub")
            try:
                directory = Path(main.PLUGIN_DOWNLOAD_DIR)
                (directory / "nested").mkdir(parents=True)
                (directory / "nested" / "asset.zip").write_bytes(b"zip")
                (directory / "release.zip").write_bytes(b"zip")

                result = asyncio.run(Plugin().clear_downloads())

                self.assertEqual(result["removed"], 2)
                self.assertTrue(directory.exists())
                self.assertEqual(list(directory.iterdir()), [])
            finally:
                main.PLUGIN_DOWNLOAD_DIR = original_download_dir

    def test_list_downloads_only_lists_deckyhub_contents(self):
        with tempfile.TemporaryDirectory() as home:
            original_download_dir = main.PLUGIN_DOWNLOAD_DIR
            main.PLUGIN_DOWNLOAD_DIR = str(Path(home) / "Downloads" / "deckyhub")
            try:
                directory = Path(main.PLUGIN_DOWNLOAD_DIR)
                (directory / "nested").mkdir(parents=True)
                (directory / "release.zip").write_bytes(b"zip")

                result = asyncio.run(Plugin().list_downloads())

                self.assertEqual(result["items"], [{"name": "nested", "directory": True}, {"name": "release.zip", "directory": False}])
            finally:
                main.PLUGIN_DOWNLOAD_DIR = original_download_dir

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
                plugin.download_queue = asyncio.Queue()
                target_dir = Path(home) / "plugins"
                asset = {"name": "DeckyHub-v1.zip", "url": "https://github.com/mazillka/deckyhub-plugin/releases/download/v1/DeckyHub-v1.zip", "sha256": "a" * 64}
                with patch("main.PLUGIN_DOWNLOAD_DIR", str(target_dir)):
                    result = await plugin.install_deckyhub_update(asset)
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
            self.assertIn("--connect-timeout", command)
            self.assertIn("--max-time", command)
            self.assertNotIn("LD_LIBRARY_PATH", environment)

    def test_custom_repository_is_saved(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings = {"overwriteExisting": False, "customRepos": []}
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
            plugin.settings = {"overwriteExisting": False, "customRepos": ["owner/unused"]}
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
                plugin.settings = {"overwriteExisting": False, "customRepos": ["owner/one"]}
                plugin.apps = []

                exported = Path(asyncio.run(plugin.export_custom_repos())["path"])
                exported.write_text(json.dumps({"schemaVersion": 1, "repos": ["owner/one", "owner/two", "bad"]}), encoding="utf-8")
                result = asyncio.run(plugin.import_custom_repos(str(exported)))

                self.assertEqual(result["added"], ["owner/two"])
                self.assertEqual(plugin.settings["customRepos"], ["owner/one", "owner/two"])
            finally:
                main.DEFAULT_DOWNLOAD_DIR = original_download_dir

    def test_add_custom_repo_rejects_invalid_repo_format(self):
        plugin = Plugin()
        plugin.settings = {"customRepos": []}
        plugin.apps = []

        with self.assertRaises(ValueError):
            asyncio.run(plugin.add_custom_repo("not-a-repo"))

    def test_add_custom_repo_rejects_duplicate(self):
        plugin = Plugin()
        plugin.settings = {"customRepos": ["owner/repo"]}
        plugin.apps = []

        result = asyncio.run(plugin.add_custom_repo("owner/repo"))

        self.assertFalse(result["added"])

    def test_save_repo_settings_validates_and_caps_asset_filter(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings = {"repoSettings": {}}

            result = asyncio.run(
                plugin.save_repo_settings(
                    "owner/repo",
                    {"channel": "prerelease", "downloadLocation": "downloads", "assetFilter": ["linux", "  ", 42, *[f"x{i}" for i in range(15)]]},
                )
            )

            self.assertEqual(result["channel"], "prerelease")
            self.assertNotIn("downloadLocation", result)
            self.assertEqual(len(result["assetFilter"]), 10)
            self.assertEqual(plugin.settings["repoSettings"]["owner/repo"], result)

    def test_save_repo_settings_rejects_invalid_repo(self):
        plugin = Plugin()
        plugin.settings = {"repoSettings": {}}

        with self.assertRaises(ValueError):
            asyncio.run(plugin.save_repo_settings("not-a-repo", {}))

    def test_import_rejects_files_outside_home(self):
        with tempfile.TemporaryDirectory() as outside:
            plugin = Plugin()
            plugin.apps = []
            plugin.settings = {"customRepos": []}
            source = Path(outside) / "repos.json"
            source.write_text(json.dumps({"schemaVersion": 1, "repos": ["owner/repo"]}), encoding="utf-8")

            with self.assertRaises(ValueError):
                asyncio.run(plugin.import_custom_repos(str(source)))

    def test_import_rejects_non_json_file(self):
        with tempfile.TemporaryDirectory() as home:
            original_download_dir = main.DEFAULT_DOWNLOAD_DIR
            main.DEFAULT_DOWNLOAD_DIR = str(Path(home) / "Downloads")
            try:
                plugin = Plugin()
                plugin.apps = []
                plugin.settings = {"customRepos": []}
                source = Path(home) / "Downloads" / "repos.txt"
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_text("owner/repo", encoding="utf-8")

                with self.assertRaises(ValueError):
                    asyncio.run(plugin.import_custom_repos(str(source)))
            finally:
                main.DEFAULT_DOWNLOAD_DIR = original_download_dir

    def test_download_asset_returns_error_for_non_https_url(self):
        plugin = Plugin()
        plugin.settings = {"downloadLocation": "plugins", "overwriteExisting": True, "repoSettings": {}}
        plugin.downloads = {}
        plugin.download_queue = asyncio.Queue()

        result = asyncio.run(plugin.download_asset({"name": "a.zip", "url": "http://example.com/a.zip"}, "owner/repo"))
        self.assertEqual(result["error"], "Can't start a.zip: Only GitHub release assets for the selected repository can be downloaded")

    def test_download_asset_returns_error_for_untrusted_https_url(self):
        plugin = Plugin()
        plugin.settings = {"downloadLocation": "plugins", "overwriteExisting": True, "repoSettings": {}}
        plugin.downloads = {}
        plugin.download_queue = asyncio.Queue()

        result = asyncio.run(plugin.download_asset({"name": "a.zip", "url": "https://example.com/a.zip"}, "owner/repo"))
        self.assertEqual(result["error"], "Can't start a.zip: Only GitHub release assets for the selected repository can be downloaded")

    def test_download_asset_returns_error_for_dotdot_filename(self):
        plugin = Plugin()
        plugin.settings = {"downloadLocation": "plugins", "overwriteExisting": True, "repoSettings": {}}
        plugin.downloads = {}
        plugin.download_queue = asyncio.Queue()

        result = asyncio.run(plugin.download_asset({"name": "..", "url": "https://github.com/owner/repo/releases/download/v1/a.zip"}, "owner/repo"))
        self.assertEqual(result["error"], "Can't start ..: Invalid asset filename")

    def test_download_asset_sanitizes_traversal_in_filename(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings = {"downloadLocation": "plugins", "overwriteExisting": True, "repoSettings": {}}
            plugin.downloads = {}
            plugin.download_queue = asyncio.Queue()
            target_dir = Path(home) / "plugins"

            with patch("main.PLUGIN_DOWNLOAD_DIR", str(target_dir)):
                result = asyncio.run(plugin.download_asset({"name": "../../etc/passwd", "url": "https://github.com/owner/repo/releases/download/v1/a.zip"}, "owner/repo"))

            self.assertEqual(plugin.downloads[result["jobId"]]["path"], str(target_dir / "passwd"))

    def test_download_asset_avoids_overwrite_when_disabled(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings = {"downloadLocation": "plugins", "overwriteExisting": False, "repoSettings": {}}
            plugin.downloads = {}
            plugin.download_queue = asyncio.Queue()
            target_dir = Path(home) / "plugins"
            target_dir.mkdir(parents=True)
            (target_dir / "asset.zip").write_bytes(b"x")

            with patch("main.PLUGIN_DOWNLOAD_DIR", str(target_dir)):
                result = asyncio.run(plugin.download_asset({"name": "asset.zip", "url": "https://github.com/owner/repo/releases/download/v1/asset.zip"}, "owner/repo"))

            self.assertEqual(plugin.downloads[result["jobId"]]["path"], str(target_dir / "asset (1).zip"))

    def test_download_asset_reuses_an_active_matching_job(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings = {"downloadLocation": "plugins", "overwriteExisting": True, "repoSettings": {}}
            plugin.downloads = {}
            plugin.download_queue = asyncio.Queue()
            asset = {"name": "asset.zip", "url": "https://github.com/owner/repo/releases/download/v1/asset.zip"}

            with patch("main.PLUGIN_DOWNLOAD_DIR", str(Path(home))):
                first = asyncio.run(plugin.download_asset(asset, "owner/repo"))
                second = asyncio.run(plugin.download_asset(asset, "owner/repo"))

            self.assertEqual(second["jobId"], first["jobId"])
            self.assertEqual(len(plugin.downloads), 1)

    def test_download_marks_error_on_checksum_mismatch(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings = {}
            plugin.downloads = {"job": {"state": "queued", "received": 0, "total": 0}}
            plugin.cancelled = set()
            target = Path(home) / "asset.zip"

            def fake_download(job_id, asset, temp):
                temp.write_bytes(b"data")

            with patch.object(plugin, "_download_with_urllib", side_effect=fake_download):
                plugin._download("job", {"url": "https://example.com/a", "sha256": "0" * 64}, target)

            self.assertEqual(plugin.downloads["job"]["state"], "error")
            self.assertIn("SHA256", plugin.downloads["job"]["error"])
            self.assertFalse(target.exists())

    def test_download_completes_when_checksum_matches_without_any_setting(self):
        # Verification is unconditional now that "Verify SHA256" was removed as a
        # setting: this asserts it still succeeds (not just still fails) with a
        # settings dict that doesn't mention checksums at all.
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings = {}
            plugin.downloads = {"job": {"state": "queued", "received": 0, "total": 0}}
            plugin.cancelled = set()
            target = Path(home) / "asset.zip"
            digest = hashlib.sha256(b"data").hexdigest()

            def fake_download(job_id, asset, temp):
                temp.write_bytes(b"data")

            with patch.object(plugin, "_download_with_urllib", side_effect=fake_download):
                plugin._download("job", {"url": "https://example.com/a", "sha256": digest}, target)

            self.assertEqual(plugin.downloads["job"]["state"], "complete")
            self.assertEqual(target.read_bytes(), b"data")

    def test_saved_settings_no_longer_expose_verify_sha256(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            saved = asyncio.run(plugin.save_settings({"verifySha256": False}))

            self.assertNotIn("verifySha256", saved)
            self.assertNotIn("verifySha256", plugin._load_settings())

    def test_cancel_download_marks_job_and_get_download_reports_missing_by_default(self):
        plugin = Plugin()
        plugin.cancelled = set()
        plugin.downloads = {}

        self.assertEqual(asyncio.run(plugin.get_download("missing"))["state"], "missing")
        asyncio.run(plugin.cancel_download("job-1"))
        self.assertIn("job-1", plugin.cancelled)

    def test_decky_plugin_detection_matches_custom_repo_by_repository_field(self):
        with tempfile.TemporaryDirectory() as home:
            plugin_dir = Path(home) / "plugins" / "custom"
            plugin_dir.mkdir(parents=True)
            (plugin_dir / "plugin.json").write_text(json.dumps({"name": "Something Else", "version": "9.9.9"}), encoding="utf-8")
            (plugin_dir / "package.json").write_text(json.dumps({"repository": "https://github.com/owner/repo"}), encoding="utf-8")
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()

            installed_plugins = plugin._scan_installed_plugins()
            self.assertEqual(plugin._installed_version({"detect": {"type": "decky-plugin", "repo": "owner/repo"}}, installed_plugins), "9.9.9")


if __name__ == "__main__":
    unittest.main()
