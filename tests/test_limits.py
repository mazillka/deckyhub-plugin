"""Limits and failures that must not take DeckyHub down: a file that won't go, a slow server, a bad settings file,
too many repositories, a full queue, and a pairing link that must leave the pairing window alone."""

import asyncio
import json
import logging
import os
import secrets
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub import backups, downloads, net, paths  # noqa: E402
from deckyhub.remote_install_queue import QueueFullError, RemoteInstallQueue  # noqa: E402
from deckyhub.remote_install_service import RemoteInstallService  # noqa: E402
from deckyhub.validation import MAX_CUSTOM_REPOS  # noqa: E402

from main import Plugin  # noqa: E402


class DownloadLimitTests(unittest.TestCase):
    def test_a_staged_file_that_cannot_be_removed_does_not_stop_an_install(self):
        with (
            tempfile.TemporaryDirectory() as home,
            patch.object(sys.modules["decky"], "DECKY_PLUGIN_RUNTIME_DIR", home, create=True),
        ):
            plugin = Plugin()
            plugin.downloads = {}
            plugin.cancelled = set()
            stuck = Path(home) / "installs" / "old.zip"
            stuck.parent.mkdir()
            stuck.write_bytes(b"old")
            os.utime(stuck, (0, 0))
            real_unlink = Path.unlink

            def unlink(self, *args, **kwargs):
                if self.name == "old.zip":
                    raise PermissionError("busy")
                return real_unlink(self, *args, **kwargs)

            def fake_download(job_id, asset, target):
                plugin.downloads[job_id]["state"] = "complete"
                target.write_bytes(b"data")

            asset = {"name": "a.zip", "url": "https://github.com/owner/repo/releases/download/v1/a.zip"}
            with patch.object(Path, "unlink", unlink), patch.object(plugin, "_download", side_effect=fake_download):
                result = asyncio.run(plugin.stage_install(asset, "owner/repo"))
            self.assertEqual(Path(result["path"]).read_bytes(), b"data")

    def test_a_server_that_trickles_bytes_is_cut_off_after_a_minute(self):
        class Trickle:
            headers = {}

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self, size):
                return b"x"

        clock = iter([0.0, 61.0])
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.downloads = {"job": {"received": 0, "total": 0}}
            plugin.cancelled = set()
            with (
                patch.object(net.OPENER, "open", return_value=Trickle()),
                patch.object(downloads.time, "monotonic", lambda: next(clock)),
                self.assertRaisesRegex(RuntimeError, "too slow"),
            ):
                plugin._download_with_urllib("job", {"url": "https://example.com/a.zip"}, Path(home) / "a.part")


class SettingsFileTests(unittest.TestCase):
    def test_a_settings_file_that_is_not_utf8_gives_the_defaults(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings_path.write_bytes(b"\xff\xfe{\x00")  # what a Windows editor saves as "Unicode"
            settings = plugin._load_settings()
        self.assertEqual(settings["customRepos"], [])
        self.assertEqual(settings["language"], "auto")

    def test_an_unreadable_settings_file_is_kept_as_bad_instead_of_overwritten(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = Plugin()
            plugin.settings_path = Path(home) / "settings.json"
            plugin.settings_path.write_text('{"githubToken": "ghp_x", "customRepos": [', encoding="utf-8")  # cut off
            plugin.settings = plugin._load_settings()
            plugin._save_settings()
            kept = (Path(home) / "settings.json.bad").read_text(encoding="utf-8")
            saved = json.loads(plugin.settings_path.read_text(encoding="utf-8"))
        self.assertIn("ghp_x", kept)
        self.assertEqual(saved["githubToken"], "")


class BackupFailureTests(unittest.TestCase):
    def test_a_folder_that_cannot_be_listed_is_an_error_not_an_exception(self):
        with tempfile.TemporaryDirectory() as home:
            (Path(home) / "settings" / "Plugin").mkdir(parents=True)
            with (
                patch.object(sys.modules["decky"], "DECKY_HOME", home, create=True),
                patch.object(Path, "iterdir", side_effect=PermissionError("no")),
            ):
                self.assertIn("error", backups.make_backup("Plugin"))


class CustomRepositoryCapTests(unittest.TestCase):
    def plugin(self, home, count):
        plugin = Plugin()
        plugin.settings_path = Path(home) / "settings.json"
        plugin.settings = {"customRepos": [f"owner/repo{number}" for number in range(count)], "repoSettings": {}}
        plugin.apps = []
        return plugin

    def test_an_import_stops_at_the_cap_and_adding_one_past_it_is_refused(self):
        with tempfile.TemporaryDirectory() as home, patch.object(paths, "DEFAULT_DOWNLOAD_DIR", f"{home}/Downloads"):
            plugin = self.plugin(home, MAX_CUSTOM_REPOS - 2)
            source = Path(home) / "repos.json"
            source.write_text(json.dumps({"repos": [f"new/repo{number}" for number in range(5)]}), encoding="utf-8")
            result = asyncio.run(plugin.import_custom_repos(str(source)))
            self.assertEqual(len(result["added"]), 2)
            self.assertEqual(len(plugin.settings["customRepos"]), MAX_CUSTOM_REPOS)
            with self.assertRaises(ValueError):
                asyncio.run(plugin.add_custom_repo("one/more"))
            # A repository already tracked is still answered, not refused.
            self.assertFalse(asyncio.run(plugin.add_custom_repo("owner/repo0"))["added"])

    def test_a_plugin_pack_adds_no_repositories_past_the_cap(self):
        with (
            tempfile.TemporaryDirectory() as home,
            patch.object(paths, "DEFAULT_DOWNLOAD_DIR", f"{home}/Downloads"),
            patch.object(sys.modules["decky"], "DECKY_PLUGIN_SETTINGS_DIR", home, create=True),
        ):
            plugin = self.plugin(home, MAX_CUSTOM_REPOS)
            source = Path(home) / "pack.json"
            source.write_text(
                json.dumps({"schemaVersion": 1, "plugins": [{"repo": "new/one"}, {"repo": "new/two"}]}),
                encoding="utf-8",
            )
            result = asyncio.run(plugin.import_plugin_pack(str(source)))
            self.assertEqual(result["added"], [])
            self.assertEqual(len(plugin.settings["customRepos"]), MAX_CUSTOM_REPOS)


class QueueSlotTests(unittest.TestCase):
    def test_finished_requests_take_no_slot_but_a_flood_of_them_is_capped(self):
        queue = RemoteInstallQueue(capacity=1)
        for number in range(4):
            request = queue.create("owner", f"key{number}", "example")
            queue.cancel("owner", request.id)
        with self.assertRaises(QueueFullError):
            queue.create("owner", "key4", "example")
        loose = RemoteInstallQueue(capacity=2)
        first = loose.create("owner", "a", "example")
        loose.cancel("owner", first.id)
        loose.create("owner", "b", "example")
        loose.create("owner", "c", "example")  # the cancelled one does not count against the two slots


class PairingLinkTests(unittest.TestCase):
    def test_a_link_made_by_a_paired_browser_leaves_the_pairing_window_alone(self):
        service = RemoteInstallService(lambda: [])
        secret = secrets.token_urlsafe(32)
        pair = service.pair(service.begin_pairing()["code"], "Browser", secret)["pairingId"]
        service.decide_pairing(pair, True)
        token = service.pair_status(pair, secret)["token"]
        window = service.begin_pairing()  # what the device shows: a code and a QR token
        link = service.remote({"op": "pair_link", "token": token})
        # The code the device shows still works, and so does the link, each once.
        service.pair(window["code"], "Phone", secrets.token_urlsafe(32))
        service.pair(None, "Laptop", secrets.token_urlsafe(32), link["pairingToken"])
        with self.assertRaises(ValueError):
            service.pair(None, "Again", secrets.token_urlsafe(32), link["pairingToken"])

    def test_a_link_is_not_the_windows_token_and_outlives_the_window(self):
        service = RemoteInstallService(lambda: [])
        window = service.begin_pairing()
        link = service.begin_link()
        self.assertNotEqual(window["pairingToken"], link["pairingToken"])
        service.pair(None, "Phone", secrets.token_urlsafe(32), window["pairingToken"])  # ends the window
        service.pair(None, "Laptop", secrets.token_urlsafe(32), link["pairingToken"])  # the link still works


if __name__ == "__main__":
    unittest.main()
