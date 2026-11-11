import asyncio
import hashlib
import json
import logging
import os
import sys
import tempfile
import types
import unittest
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.request import Request

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub import net, paths, registry

from main import Plugin


class PluginStatusTests(unittest.TestCase):
    def test_repository_match_with_duplicate_loader_name_is_unverified(self):
        plugin = Plugin()
        plugin.settings = {"customRepos": []}
        plugin.apps = [{"repo": "owner/project", "detect": {"type": "decky-plugin", "names": ["Old name"]}}]
        installed = [
            ({"name": "New name", "version": "1.2.3"}, {}, "owner/project"),
            ({"name": "new name", "version": "9.0.0"}, {}, "other/project"),
        ]
        with patch.object(plugin, "_scan_installed_plugins", return_value=installed):
            app = asyncio.run(plugin.get_apps())["apps"][0]
        self.assertTrue(app["identityUnverified"])
        self.assertIsNone(app["pluginName"])
        self.assertEqual(app["installedVersion"], "1.2.3")

    def test_repository_match_rejects_name_only_wrong_owner_and_duplicates(self):
        plugin = Plugin()
        rule = {"repo": "owner/project", "names": ["Plugin"]}
        manifest = {"name": "Plugin", "version": "1.0"}
        self.assertIsNone(plugin._match_decky_plugin(rule, [(manifest, {}, None)]))
        self.assertIsNone(plugin._match_decky_plugin(rule, [(manifest, {}, "other/project")]))
        self.assertEqual(plugin._match_decky_plugin(rule, [(manifest, {}, "owner/project")]), (manifest, {}))
        self.assertIsNone(
            plugin._match_decky_plugin(rule, [(manifest, {}, "owner/project"), (manifest, {}, "owner/project")])
        )
        self.assertIsNone(
            plugin._plugin_repository({}, {"repository": "https://evil.example/github.com/owner/project"})
        )
        for repository in (
            "git+https://github.com.example/owner/project.git",
            "git+https://github.com@other.example/owner/project.git",
            "git+https://github.com/owner/project/extra",
        ):
            with self.subTest(repository=repository):
                self.assertIsNone(plugin._plugin_repository({}, {"repository": repository}))

    def test_remote_inventory_keeps_unlisted_installed_plugins_visible(self):
        plugin = Plugin()
        plugin.settings = {"customRepos": []}
        plugin.apps = [
            {"id": "known", "name": "Known plugin", "repo": "owner/known", "detect": {"type": "decky-plugin"}}
        ]
        installed = [
            ({"name": "Known plugin", "version": "1.2.3"}, {}, "owner/known"),
            ({"name": "Unlisted plugin"}, {"version": "4.5.6"}, None),
        ]
        with patch.object(plugin, "_scan_installed_plugins", return_value=installed):
            inventory = plugin._remote_installed_plugins()
        self.assertEqual(
            [(row["id"], row["name"], row["version"], row["identityUnverified"]) for row in inventory],
            [("known", "Known plugin", "1.2.3", False), (None, "Unlisted plugin", "4.5.6", True)],
        )

    def test_decky_plugin_detection_reads_manifest_and_package_version(self):
        with tempfile.TemporaryDirectory() as home:
            plugin_dir = Path(home) / "plugins" / "mako"
            plugin_dir.mkdir(parents=True)
            (plugin_dir / "plugin.json").write_text(json.dumps({"name": "MAKO - Frame Generation"}), encoding="utf-8")
            (plugin_dir / "package.json").write_text(
                json.dumps(
                    {"version": "3.2.1", "repository": {"type": "git", "url": "git+https://github.com/Owner/Mako.git"}}
                ),
                encoding="utf-8",
            )
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()

            installed_plugins = plugin._scan_installed_plugins()
            self.assertEqual(
                plugin._decky_plugin_version(
                    plugin._match_decky_plugin(
                        {
                            "type": "decky-plugin",
                            "repo": "owner/mako",
                            "names": ["MAKO - Frame Generation", "MAKO Decky"],
                        },
                        installed_plugins,
                    )
                ),
                "3.2.1",
            )

    def test_get_apps_reports_the_installed_plugin_name(self):
        with tempfile.TemporaryDirectory() as home:
            plugin_dir = Path(home) / "plugins" / "mako"
            plugin_dir.mkdir(parents=True)
            (plugin_dir / "plugin.json").write_text(
                json.dumps({"name": "MAKO - Frame Generation", "version": "3.2.1", "repository": "owner/mako"}),
                encoding="utf-8",
            )
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()
            plugin.settings = {"customRepos": []}
            plugin.apps = [
                {
                    "repo": "owner/mako",
                    "detect": {"type": "decky-plugin", "names": ["MAKO Decky", "MAKO - Frame Generation"]},
                },
                {"repo": "owner/missing", "detect": {"type": "decky-plugin", "names": ["Missing"]}},
            ]

            apps = asyncio.run(plugin.get_apps())["apps"]
            self.assertEqual(
                [(app["installedVersion"], app["pluginName"]) for app in apps],
                [("3.2.1", "MAKO - Frame Generation"), (None, None)],
            )

    def test_malformed_manifests_of_other_plugins_are_skipped(self):
        with tempfile.TemporaryDirectory() as home:
            for name, manifest, package in (
                ("list", [], {}),
                ("number", {"name": 1}, {}),
                ("bad-package", {"name": "Good", "version": "1.0", "repository": "owner/good"}, []),
            ):
                plugin_dir = Path(home) / "plugins" / name
                plugin_dir.mkdir(parents=True)
                (plugin_dir / "plugin.json").write_text(json.dumps(manifest), encoding="utf-8")
                (plugin_dir / "package.json").write_text(json.dumps(package), encoding="utf-8")
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()
            plugin.settings = {"customRepos": []}
            plugin.apps = [{"repo": "owner/good", "detect": {"type": "decky-plugin", "names": ["Good"]}}]

            apps = asyncio.run(plugin.get_apps())["apps"]
            self.assertEqual([(app["installedVersion"], app["pluginName"]) for app in apps], [("1.0", "Good")])

    def test_overwrite_defaults_to_true_and_unknown_settings_are_dropped(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            settings = asyncio.run(plugin.save_settings({}))

            self.assertTrue(settings["overwriteExisting"])
            saved = asyncio.run(plugin.save_settings({"downloadLocation": "downloads", "verifySha256": False}))
            self.assertNotIn("downloadLocation", saved)
            self.assertNotIn("verifySha256", plugin._load_settings())

    def test_github_token_is_trimmed_capped_and_persisted(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            for value, expected in (
                ("  ghp_example  ", "ghp_example"),
                ("   ", ""),
                ("x" * 400, "x" * 255),
                (12345, ""),
                (None, ""),
                ([], ""),
            ):
                self.assertEqual(
                    asyncio.run(plugin.save_settings({"githubToken": value}))["githubToken"],
                    expected,
                    msg=f"value: {value!r}",
                )
            asyncio.run(plugin.save_settings({"githubToken": "ghp_example"}))
            self.assertEqual(plugin._load_settings()["githubToken"], "ghp_example")

    def test_corrupt_settings_file_loads_with_defaults_for_bad_fields(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings_path.write_text(
                json.dumps(
                    {
                        "customRepos": 5,
                        "repoSettings": {
                            "owner/repo": {"channel": "prerelease"},
                            "not a repo": {},
                            "owner/other": "bogus",
                        },
                    }
                ),
                encoding="utf-8",
            )

            loaded = plugin._load_settings()

            self.assertEqual(loaded["customRepos"], [])
            self.assertEqual(
                loaded["repoSettings"], {"owner/repo": {"channel": "prerelease"}, "owner/other": {"channel": "stable"}}
            )

    @unittest.skipUnless(os.name == "posix", "file modes are POSIX")
    def test_settings_file_is_owner_only_and_loading_fixes_an_old_one(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings_path.write_text("{}", encoding="utf-8")
            plugin.settings_path.chmod(0o644)

            plugin.settings = plugin._load_settings()
            self.assertEqual(plugin.settings_path.stat().st_mode & 0o777, 0o600)

            plugin.settings_path.unlink()
            plugin.settings["githubToken"] = "ghp_secret"
            plugin._save_settings()
            self.assertEqual(plugin.settings_path.stat().st_mode & 0o777, 0o600)

    def test_density_defaults_to_default_and_accepts_compact(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            self.assertEqual(asyncio.run(plugin.save_settings({}))["density"], "default")
            self.assertEqual(asyncio.run(plugin.save_settings({"density": "compact"}))["density"], "compact")
            self.assertEqual(asyncio.run(plugin.save_settings({"density": "tiny"}))["density"], "default")

    def test_oled_is_off_unless_set_to_true(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            self.assertIs(asyncio.run(plugin.save_settings({}))["oled"], False)
            self.assertIs(asyncio.run(plugin.save_settings({"oled": True}))["oled"], True)
            self.assertIs(asyncio.run(plugin.save_settings({"oled": "yes"}))["oled"], False)

    def test_items_per_row_takes_one_to_four(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            self.assertEqual(asyncio.run(plugin.save_settings({"columnsPerRow": 4}))["columnsPerRow"], 4)
            self.assertEqual(asyncio.run(plugin.save_settings({"columnsPerRow": 5}))["columnsPerRow"], 3)

    def test_haptics_default_on_and_can_be_turned_off(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            self.assertIs(asyncio.run(plugin.save_settings({}))["haptics"], True)
            self.assertIs(asyncio.run(plugin.save_settings({"haptics": False}))["haptics"], False)

    def test_quick_access_tab_default_on_for_old_settings_and_can_be_turned_off(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            # A settings.json from before the setting existed keeps the tab.
            plugin.settings_path.write_text(json.dumps({"haptics": False}), encoding="utf-8")
            self.assertIs(plugin._load_settings()["quickAccessTab"], True)
            self.assertIs(asyncio.run(plugin.save_settings({"quickAccessTab": False}))["quickAccessTab"], False)
            self.assertIs(plugin._load_settings()["quickAccessTab"], False)

    def test_ui_style_defaults_for_old_settings_and_keeps_only_known_styles(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings_path.write_text(json.dumps({"haptics": False}), encoding="utf-8")
            self.assertEqual(plugin._load_settings()["uiStyle"], "default")
            self.assertEqual(asyncio.run(plugin.save_settings({"uiStyle": "experimental"}))["uiStyle"], "experimental")
            self.assertEqual(asyncio.run(plugin.save_settings({"uiStyle": "neon"}))["uiStyle"], "default")

    def test_hidden_buttons_keep_only_known_names(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            self.assertEqual(asyncio.run(plugin.save_settings({}))["hiddenButtons"], [])
            self.assertEqual(
                asyncio.run(plugin.save_settings({"hiddenButtons": ["releasePage", "bogus", 3, "install"]}))[
                    "hiddenButtons"
                ],
                ["install", "releasePage"],
            )
            self.assertEqual(
                asyncio.run(plugin.save_settings({"hiddenButtons": "downloadZipinstall"}))["hiddenButtons"], []
            )
            self.assertEqual(plugin._load_settings()["hiddenButtons"], [])

    def test_clear_downloads_only_removes_deckyhub_contents(self):
        with tempfile.TemporaryDirectory() as home:
            original_download_dir = paths.PLUGIN_DOWNLOAD_DIR
            paths.PLUGIN_DOWNLOAD_DIR = str(Path(home) / "Downloads" / "deckyhub")
            try:
                directory = Path(paths.PLUGIN_DOWNLOAD_DIR)
                (directory / "nested").mkdir(parents=True)
                (directory / "nested" / "asset.zip").write_bytes(b"zip")
                (directory / "release.zip").write_bytes(b"zip")

                result = asyncio.run(Plugin().clear_downloads())

                self.assertEqual(result["removed"], 2)
                self.assertTrue(directory.exists())
                self.assertEqual(list(directory.iterdir()), [])
            finally:
                paths.PLUGIN_DOWNLOAD_DIR = original_download_dir

    def test_clear_downloads_keeps_files_of_an_active_download(self):
        with tempfile.TemporaryDirectory() as home, patch.object(paths, "PLUGIN_DOWNLOAD_DIR", home):
            (Path(home) / "active.zip.part").write_bytes(b"zip")
            (Path(home) / "old.zip").write_bytes(b"zip")
            plugin = Plugin()
            plugin.downloads = {"job": {"state": "downloading", "path": str(Path(home) / "active.zip")}}

            self.assertEqual(asyncio.run(plugin.clear_downloads())["removed"], 1)
            self.assertEqual([entry.name for entry in Path(home).iterdir()], ["active.zip.part"])

    def test_clear_downloads_skips_a_file_it_cannot_remove(self):
        with tempfile.TemporaryDirectory() as home, patch.object(paths, "PLUGIN_DOWNLOAD_DIR", home):
            (Path(home) / "a.zip").write_bytes(b"zip")
            (Path(home) / "b.zip").write_bytes(b"zip")
            unlink = Path.unlink

            def flaky_unlink(path, *args, **kwargs):
                if path.name == "a.zip":
                    raise PermissionError("busy")
                return unlink(path, *args, **kwargs)

            with patch.object(Path, "unlink", flaky_unlink):
                self.assertEqual(asyncio.run(Plugin().clear_downloads())["removed"], 1)
            self.assertEqual([entry.name for entry in Path(home).iterdir()], ["a.zip"])

    def test_list_downloads_only_lists_deckyhub_contents(self):
        with tempfile.TemporaryDirectory() as home:
            original_download_dir = paths.PLUGIN_DOWNLOAD_DIR
            paths.PLUGIN_DOWNLOAD_DIR = str(Path(home) / "Downloads" / "deckyhub")
            try:
                directory = Path(paths.PLUGIN_DOWNLOAD_DIR)
                (directory / "nested").mkdir(parents=True)
                (directory / "release.zip").write_bytes(b"zip")

                result = asyncio.run(Plugin().list_downloads())

                self.assertEqual(
                    result["items"],
                    [{"name": "nested", "directory": True}, {"name": "release.zip", "directory": False}],
                )
            finally:
                paths.PLUGIN_DOWNLOAD_DIR = original_download_dir

    def test_update_channel_defaults_to_stable_and_accepts_prerelease(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"

            self.assertEqual(asyncio.run(plugin.save_settings({}))["updateChannel"], "stable")
            self.assertEqual(
                asyncio.run(plugin.save_settings({"updateChannel": "prerelease"}))["updateChannel"], "prerelease"
            )

    def test_deckyhub_version_is_unknown_when_package_is_not_extracted(self):
        with (
            tempfile.TemporaryDirectory() as home,
            patch.object(sys.modules["decky"], "DECKY_PLUGIN_DIR", home, create=True),
            patch.object(paths, "PLUGIN_DIR", home),
        ):
            self.assertEqual(asyncio.run(Plugin().get_deckyhub_info())["version"], "unknown")

    def test_urllib_download_counts_received_bytes(self):
        class Response:
            headers = {"Content-Length": "3"}
            reads = []

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self, size):
                self.reads.append(size)
                return b"abc" if len(self.reads) == 1 else b""

        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.downloads = {"job": {"received": 0, "total": 0}}
            plugin.cancelled = set()
            response = Response()
            with patch.object(net.OPENER, "open", return_value=response):
                plugin._download_with_urllib("job", {"url": "https://example.com/file.zip"}, Path(home) / "file.part")

            self.assertEqual(plugin.downloads["job"]["received"], 3)

            # A server sending more than the release file's stated size is cut off.
            plugin.downloads["job"]["received"] = 0
            Response.reads = []
            with patch.object(net.OPENER, "open", return_value=Response()), self.assertRaises(RuntimeError):
                plugin._download_with_urllib(
                    "job", {"url": "https://example.com/file.zip", "size": 2}, Path(home) / "file.part"
                )

    def test_downloads_refuse_redirects_off_https(self):
        handler = net.HttpsOnlyRedirects()
        request = Request("https://github.com/owner/repo/releases/download/v1/a.zip")

        with self.assertRaises(RuntimeError):
            handler.redirect_request(request, None, 302, "Found", {}, "http://example.com/a.zip")
        self.assertEqual(
            handler.redirect_request(request, None, 302, "Found", {}, "https://example.com/a.zip").full_url,
            "https://example.com/a.zip",
        )

    def test_curl_download_uses_system_libraries(self):
        class Process:
            returncode = 0

            def poll(self):
                return 0

        with tempfile.TemporaryDirectory() as home:
            temp = Path(home) / "file.part"
            temp.write_bytes(b"zip")
            plugin = Plugin()
            plugin.downloads = {"job": {"received": 0}}
            plugin.cancelled = set()
            with (
                patch("deckyhub.downloads.shutil.which", return_value="/usr/bin/curl"),
                patch("deckyhub.downloads.subprocess.Popen", return_value=Process()) as popen,
                patch.dict("deckyhub.downloads.os.environ", {"LD_LIBRARY_PATH": "/tmp/_MEI"}, clear=True),
            ):
                plugin._download_with_curl("job", {"url": "https://example.com/file.zip"}, temp)

            command = popen.call_args.args[0]
            environment = popen.call_args.kwargs["env"]
            self.assertEqual(command[0], "/usr/bin/curl")
            self.assertIn("--connect-timeout", command)
            # Aborts only a stalled transfer, so a big file on slow Wi-Fi still finishes.
            self.assertNotIn("--max-time", command)
            self.assertIn("--speed-time", command)
            self.assertEqual(command[command.index("--proto-redir") + 1], "=https")
            self.assertNotIn("LD_LIBRARY_PATH", environment)

    def test_cancelled_curl_download_waits_for_curl_to_exit(self):
        process = MagicMock()
        process.poll.return_value = None
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.downloads = {"job": {"received": 0}}
            plugin.cancelled = {"job"}
            with (
                patch("deckyhub.downloads.shutil.which", return_value="/usr/bin/curl"),
                patch("deckyhub.downloads.subprocess.Popen", return_value=process),
                self.assertRaises(InterruptedError),
            ):
                plugin._download_with_curl("job", {"url": "https://example.com/file.zip"}, Path(home) / "file.part")

        process.terminate.assert_called_once()
        process.wait.assert_called()

    def test_custom_repository_is_saved(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings = {"overwriteExisting": False, "customRepos": []}
            plugin.apps = []

            result = asyncio.run(plugin.add_custom_repo("owner/repository"))

            self.assertTrue(result["added"])
            self.assertEqual(plugin._custom_apps()[0]["repo"], "owner/repository")
            self.assertEqual(plugin._load_settings()["customRepos"], ["owner/repository"])

    def test_get_apps_includes_default_and_custom_repositories(self):
        with tempfile.TemporaryDirectory() as home:
            Path(home, "plugins").mkdir()
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()
            plugin.settings = {"customRepos": ["owner/custom"]}
            plugin.apps = [{"repo": "owner/default", "detect": {"type": "decky-plugin", "repo": "owner/default"}}]

            self.assertEqual(
                [app["repo"] for app in asyncio.run(plugin.get_apps())["apps"]], ["owner/default", "owner/custom"]
            )

    def test_removing_a_custom_repository_ignores_case_and_drops_its_settings(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings = {"customRepos": ["Owner/Repo"], "repoSettings": {"Owner/Repo": {"channel": "prerelease"}}}

            self.assertTrue(asyncio.run(plugin.remove_custom_repo("owner/repo"))["removed"])
            self.assertEqual(plugin.settings, {"customRepos": [], "repoSettings": {}})

    def test_download_asset_retains_recent_jobs_and_prunes_old_ones(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings = {"overwriteExisting": True}
            plugin.downloads = {
                "old": {"state": "complete", "finished_at": 699},
                "recent": {"state": "complete", "finished_at": 900},
                "running": {"state": "downloading", "repo": "owner/other", "url": "x"},
            }
            plugin.download_queue = asyncio.Queue()

            with (
                patch("deckyhub.paths.PLUGIN_DOWNLOAD_DIR", home),
                patch("deckyhub.downloads.time.monotonic", return_value=1000),
            ):
                result = asyncio.run(
                    plugin.download_asset(
                        {"name": "a.zip", "url": "https://github.com/owner/repo/releases/download/v1/a.zip"},
                        "owner/repo",
                    )
                )

            self.assertEqual(set(plugin.downloads), {"recent", "running", result["jobId"]})

    def test_custom_repository_export_and_import(self):
        with tempfile.TemporaryDirectory() as home:
            original_download_dir = paths.DEFAULT_DOWNLOAD_DIR
            paths.DEFAULT_DOWNLOAD_DIR = str(Path(home) / "Downloads")
            try:
                plugin = Plugin()
                plugin.settings_path = Path(home) / "settings.json"
                plugin.settings = {"overwriteExisting": False, "customRepos": ["owner/one"]}
                plugin.apps = []

                exported = Path(asyncio.run(plugin.export_custom_repos())["path"])
                exported.write_text(
                    json.dumps({"schemaVersion": 1, "repos": ["owner/one", "owner/two", "bad"]}), encoding="utf-8"
                )
                result = asyncio.run(plugin.import_custom_repos(str(exported)))

                self.assertEqual(result["added"], ["owner/two"])
                self.assertEqual(plugin.settings["customRepos"], ["owner/one", "owner/two"])
            finally:
                paths.DEFAULT_DOWNLOAD_DIR = original_download_dir

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
                    {"channel": "prerelease", "downloadLocation": "downloads", "assetFilter": ["linux"]},
                )
            )

            self.assertEqual(result["channel"], "prerelease")
            # Keys DeckyHub no longer uses are dropped, not stored.
            self.assertEqual(result, {"channel": "prerelease"})
            self.assertEqual(plugin.settings["repoSettings"]["owner/repo"], result)

    def test_repo_settings_keep_a_skipped_version_and_drop_a_bad_one(self):
        from deckyhub.settings import coerce_repo_settings

        self.assertEqual(
            coerce_repo_settings({"channel": "stable", "skipVersion": " v0.45 "}),
            {"channel": "stable", "skipVersion": "v0.45"},
        )
        # Settings saved before Skip this version existed, or with a junk value, have none.
        for values in ({"channel": "stable"}, {"skipVersion": ""}, {"skipVersion": 45}, {"skipVersion": "v" * 201}):
            self.assertNotIn("skipVersion", coerce_repo_settings(values))

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

    def test_read_token_file_finds_the_token_in_a_file_under_home(self):
        token = "ghp_" + "A1b2" * 9
        with (
            tempfile.TemporaryDirectory() as home,
            patch.object(paths, "DEFAULT_DOWNLOAD_DIR", str(Path(home) / "Downloads")),
        ):
            (Path(home) / "Downloads").mkdir()
            note = Path(home) / "Downloads" / "token.txt"
            note.write_text(f"my token:\n  {token}  \n", encoding="utf-8")
            self.assertEqual(asyncio.run(Plugin().read_token_file(str(note))), {"token": token})
            note.write_text("nothing here", encoding="utf-8")
            self.assertEqual(asyncio.run(Plugin().read_token_file(str(note))), {"token": None})

    def test_read_token_file_refuses_files_outside_home_or_too_big(self):
        with (
            tempfile.TemporaryDirectory() as home,
            tempfile.TemporaryDirectory() as outside,
            patch.object(paths, "DEFAULT_DOWNLOAD_DIR", str(Path(home) / "Downloads")),
        ):
            stranger = Path(outside) / "token.txt"
            stranger.write_text("ghp_" + "x" * 36, encoding="utf-8")
            big = Path(home) / "big.txt"
            big.write_text("x" * 5000, encoding="utf-8")
            for path in (stranger, big):
                with self.assertRaises(ValueError):
                    asyncio.run(Plugin().read_token_file(str(path)))

    def test_export_logs_zips_plugin_logs_into_downloads(self):
        with (
            tempfile.TemporaryDirectory() as home,
            patch.object(sys.modules["decky"], "DECKY_PLUGIN_LOG_DIR", str(Path(home) / "logs"), create=True),
            patch.object(paths, "DEFAULT_DOWNLOAD_DIR", str(Path(home) / "Downloads")),
        ):
            (Path(home) / "logs").mkdir()
            (Path(home) / "logs" / "2026-09-26.log").write_text("hello", encoding="utf-8")

            first = asyncio.run(Plugin().export_logs())["path"]
            second = asyncio.run(Plugin().export_logs())["path"]

            self.assertRegex(Path(first).name, r"^DeckyHub-logs-\d{8}-\d{6}\.zip$")
            self.assertNotEqual(first, second)
            with zipfile.ZipFile(first) as archive:
                self.assertEqual(archive.read("2026-09-26.log"), b"hello")

    def test_import_rejects_a_huge_file_without_reading_it(self):
        with tempfile.TemporaryDirectory() as home:
            original_download_dir = paths.DEFAULT_DOWNLOAD_DIR
            paths.DEFAULT_DOWNLOAD_DIR = str(Path(home) / "Downloads")
            try:
                plugin = Plugin()
                plugin.apps = []
                plugin.settings = {"customRepos": []}
                source = Path(home) / "Downloads" / "repos.json"
                source.parent.mkdir(parents=True, exist_ok=True)
                with open(source, "wb") as file:
                    file.truncate(registry.MAX_REMOTE_REGISTRY_BYTES + 1)

                with (
                    patch.object(Path, "read_text", side_effect=AssertionError("read a huge file")),
                    self.assertRaises(ValueError),
                ):
                    asyncio.run(plugin.import_custom_repos(str(source)))
            finally:
                paths.DEFAULT_DOWNLOAD_DIR = original_download_dir

    def test_import_rejects_non_json_file(self):
        with tempfile.TemporaryDirectory() as home:
            original_download_dir = paths.DEFAULT_DOWNLOAD_DIR
            paths.DEFAULT_DOWNLOAD_DIR = str(Path(home) / "Downloads")
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
                paths.DEFAULT_DOWNLOAD_DIR = original_download_dir

    def test_download_asset_refuses_urls_outside_the_repositorys_releases(self):
        plugin = Plugin()
        plugin.settings = {"overwriteExisting": True, "repoSettings": {}}
        plugin.downloads = {}
        plugin.download_queue = asyncio.Queue()

        for url in (
            "http://github.com/owner/repo/releases/download/v1/a.zip",
            "https://example.com/a.zip",
            "https://github.com/other/repo/releases/download/v1/a.zip",
        ):
            with self.subTest(url=url):
                result = asyncio.run(plugin.download_asset({"name": "a.zip", "url": url}, "owner/repo"))
                self.assertEqual(
                    result["error"],
                    "Can't start a.zip: Only GitHub release assets for the selected repository can be downloaded",
                )

    def test_download_asset_returns_error_for_dotdot_filename(self):
        plugin = Plugin()
        plugin.settings = {"downloadLocation": "plugins", "overwriteExisting": True, "repoSettings": {}}
        plugin.downloads = {}
        plugin.download_queue = asyncio.Queue()

        result = asyncio.run(
            plugin.download_asset(
                {"name": "..", "url": "https://github.com/owner/repo/releases/download/v1/a.zip"}, "owner/repo"
            )
        )
        self.assertEqual(result["error"], "Can't start ..: Invalid asset filename")

    def test_download_asset_sanitizes_traversal_in_filename(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings = {"downloadLocation": "plugins", "overwriteExisting": True, "repoSettings": {}}
            plugin.downloads = {}
            plugin.download_queue = asyncio.Queue()
            target_dir = Path(home) / "plugins"

            with patch("deckyhub.paths.PLUGIN_DOWNLOAD_DIR", str(target_dir)):
                result = asyncio.run(
                    plugin.download_asset(
                        {"name": "../../etc/passwd", "url": "https://github.com/owner/repo/releases/download/v1/a.zip"},
                        "owner/repo",
                    )
                )

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

            with patch("deckyhub.paths.PLUGIN_DOWNLOAD_DIR", str(target_dir)):
                result = asyncio.run(
                    plugin.download_asset(
                        {"name": "asset.zip", "url": "https://github.com/owner/repo/releases/download/v1/asset.zip"},
                        "owner/repo",
                    )
                )

            self.assertEqual(plugin.downloads[result["jobId"]]["path"], str(target_dir / "asset (1).zip"))

    def test_download_asset_reuses_an_active_matching_job(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings = {"downloadLocation": "plugins", "overwriteExisting": True, "repoSettings": {}}
            plugin.downloads = {}
            plugin.download_queue = asyncio.Queue()
            asset = {"name": "asset.zip", "url": "https://github.com/owner/repo/releases/download/v1/asset.zip"}

            with patch("deckyhub.paths.PLUGIN_DOWNLOAD_DIR", str(Path(home))):
                first = asyncio.run(plugin.download_asset(asset, "owner/repo"))
                second = asyncio.run(plugin.download_asset(asset, "owner/repo"))

            self.assertEqual(second["jobId"], first["jobId"])
            self.assertEqual(len(plugin.downloads), 1)

    def test_queued_downloads_with_the_same_filename_reserve_distinct_paths(self):
        with tempfile.TemporaryDirectory() as home, patch("deckyhub.paths.PLUGIN_DOWNLOAD_DIR", home):
            plugin = Plugin()
            plugin.settings = {"overwriteExisting": False}
            plugin.downloads = {}
            plugin.download_queue = asyncio.Queue()
            first = {"name": "asset.zip", "url": "https://github.com/owner/repo/releases/download/v1/asset.zip"}
            second = {"name": "asset.zip", "url": "https://github.com/owner/repo/releases/download/v2/asset.zip"}
            one = asyncio.run(plugin.download_asset(first, "owner/repo"))
            two = asyncio.run(plugin.download_asset(second, "owner/repo"))
            self.assertEqual(plugin.downloads[one["jobId"]]["filename"], "asset.zip")
            self.assertEqual(plugin.downloads[two["jobId"]]["filename"], "asset (1).zip")

    def test_cancelling_an_active_download_removes_partial_file(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.downloads = {"job": {"state": "queued", "received": 0, "total": 0}}
            plugin.cancelled = set()
            target = Path(home) / "asset.zip"

            def interrupted(job_id, asset, temp):
                temp.write_bytes(b"partial")
                self.assertTrue(asyncio.run(plugin.cancel_download(job_id))["ok"])
                raise InterruptedError("Download cancelled")

            with patch.object(plugin, "_download_with_urllib", side_effect=interrupted):
                plugin._download("job", {"url": "https://example.com/asset.zip"}, target)
            self.assertEqual(plugin.downloads["job"]["state"], "cancelled")
            self.assertFalse(target.exists())
            self.assertFalse(target.with_name(target.name + ".part").exists())

    def test_stage_install_downloads_a_verified_zip_for_decky_to_read(self):
        with (
            tempfile.TemporaryDirectory() as home,
            patch.object(sys.modules["decky"], "DECKY_PLUGIN_RUNTIME_DIR", home, create=True),
        ):
            plugin = Plugin()
            plugin.downloads = {}
            plugin.cancelled = set()
            stale = Path(home) / "installs" / "old.zip"
            stale.parent.mkdir()
            stale.write_bytes(b"old")
            os.utime(stale, (0, 0))
            asset = {
                "name": "../a.zip",
                "url": "https://github.com/owner/repo/releases/download/v1/a.zip",
                "sha256": hashlib.sha256(b"data").hexdigest(),
            }

            seen = []

            def fake_download(job_id, asset, temp):
                seen.append(asyncio.run(plugin.get_download("poll-me"))["state"])
                temp.write_bytes(b"data")

            with patch.object(plugin, "_download_with_urllib", side_effect=fake_download):
                result = asyncio.run(plugin.stage_install(asset, "owner/repo", "poll-me"))

            self.assertEqual(seen, ["downloading"])
            path = Path(result["path"])
            self.assertNotIn("poll-me", path.name)
            self.assertEqual(path.parent, Path(home) / "installs")
            self.assertTrue(path.name.endswith("-a.zip"))
            self.assertEqual(path.read_bytes(), b"data")
            self.assertFalse(stale.exists())
            self.assertEqual(plugin.downloads, {})

    def test_stage_install_survives_finished_jobs_being_pruned_mid_download(self):
        with (
            tempfile.TemporaryDirectory() as home,
            patch.object(sys.modules["decky"], "DECKY_PLUGIN_RUNTIME_DIR", home, create=True),
        ):
            plugin = Plugin()
            plugin.downloads = {}
            plugin.cancelled = set()
            asset = {"name": "a.zip", "url": "https://github.com/owner/repo/releases/download/v1/a.zip"}

            def fake_download(job_id, asset, target):
                plugin.downloads[job_id]["state"] = "complete"
                target.write_bytes(b"data")
                # What download_asset does to finished jobs before stage_install resumes.
                plugin.downloads = {}

            with patch.object(plugin, "_download", side_effect=fake_download):
                result = asyncio.run(plugin.stage_install(asset, "owner/repo"))

            self.assertEqual(Path(result["path"]).read_bytes(), b"data")

    def test_stage_install_refuses_other_repos_and_bad_checksums(self):
        with (
            tempfile.TemporaryDirectory() as home,
            patch.object(sys.modules["decky"], "DECKY_PLUGIN_RUNTIME_DIR", home, create=True),
        ):
            plugin = Plugin()
            plugin.downloads = {}
            plugin.cancelled = set()
            asset = {
                "name": "a.zip",
                "url": "https://github.com/owner/repo/releases/download/v1/a.zip",
                "sha256": "0" * 64,
            }

            with patch.object(
                plugin, "_download_with_urllib", side_effect=lambda job_id, asset, temp: temp.write_bytes(b"data")
            ) as download:
                self.assertEqual(
                    asyncio.run(plugin.stage_install(asset, "other/repo")),
                    {"error": "Only GitHub release assets for the selected repository can be downloaded"},
                )
                download.assert_not_called()
                # A URL that starts right but climbs out of the repository's releases is refused too.
                for url in (
                    "https://github.com/owner/repo/releases/download/../../../other/repo/releases/download/v1/a.zip",
                    "https://github.com/owner/repo/releases/download/v1/./../a.zip",
                    "https://github.com/owner/repo/releases/download/v1\\a.zip",
                ):
                    self.assertEqual(
                        asyncio.run(plugin.stage_install({**asset, "url": url}, "owner/repo")),
                        {"error": "Only GitHub release assets for the selected repository can be downloaded"},
                    )
                download.assert_not_called()
                self.assertIn("SHA256", asyncio.run(plugin.stage_install(asset, "owner/repo"))["error"])

            self.assertEqual(list((Path(home) / "installs").iterdir()), [])
            self.assertEqual(plugin.downloads, {})

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

    def test_download_completes_when_checksum_matches(self):
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

    def test_cancelling_a_queued_download_stops_it_before_it_starts(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.cancelled = set()
            plugin.downloads = {"job": {"state": "queued", "received": 0, "total": 0}}
            target = Path(home) / "asset.zip"

            self.assertTrue(asyncio.run(plugin.cancel_download("job"))["ok"])
            with patch.object(plugin, "_download_with_urllib") as download:
                plugin._download("job", {"url": "https://example.com/a"}, target)

            download.assert_not_called()
            self.assertEqual(plugin.downloads["job"]["state"], "cancelled")
            self.assertEqual(plugin.cancelled, set())

    def test_cancelling_a_finished_or_unknown_download_does_nothing(self):
        plugin = Plugin()
        plugin.cancelled = set()
        plugin.downloads = {"done": {"state": "complete"}}

        self.assertEqual(asyncio.run(plugin.get_download("missing"))["state"], "missing")
        self.assertFalse(asyncio.run(plugin.cancel_download("done"))["ok"])
        self.assertFalse(asyncio.run(plugin.cancel_download("missing"))["ok"])
        self.assertEqual(plugin.cancelled, set())

    def test_decky_plugin_detection_matches_custom_repo_by_repository_field(self):
        with tempfile.TemporaryDirectory() as home:
            plugin_dir = Path(home) / "plugins" / "custom"
            plugin_dir.mkdir(parents=True)
            (plugin_dir / "plugin.json").write_text(
                json.dumps({"name": "Something Else", "version": "9.9.9"}), encoding="utf-8"
            )
            (plugin_dir / "package.json").write_text(
                json.dumps({"repository": "https://github.com/owner/repo"}), encoding="utf-8"
            )
            sys.modules["decky"].DECKY_HOME = home
            plugin = Plugin()

            installed_plugins = plugin._scan_installed_plugins()
            self.assertEqual(
                plugin._decky_plugin_version(
                    plugin._match_decky_plugin({"type": "decky-plugin", "repo": "owner/repo"}, installed_plugins)
                ),
                "9.9.9",
            )

    def test_unload_stops_the_background_tasks(self):
        async def run():
            plugin = Plugin()
            plugin.queue_worker = asyncio.create_task(asyncio.sleep(3600))
            plugin.registry_task = asyncio.create_task(asyncio.sleep(3600))
            await plugin._unload()
            return plugin.queue_worker.cancelled() and plugin.registry_task.cancelled()

        self.assertTrue(asyncio.run(run()))

    def test_unload_before_main_finished_does_nothing(self):
        asyncio.run(Plugin()._unload())

    def test_uninstall_removes_staged_installs(self):
        with tempfile.TemporaryDirectory() as runtime:
            staged = Path(runtime) / "installs" / "install-1-Plugin.zip"
            staged.parent.mkdir()
            staged.write_bytes(b"zip")
            sys.modules["decky"].DECKY_PLUGIN_RUNTIME_DIR = runtime
            asyncio.run(Plugin()._uninstall())
            self.assertFalse(staged.parent.exists())
            asyncio.run(Plugin()._uninstall())  # nothing left to remove: no error


if __name__ == "__main__":
    unittest.main()
