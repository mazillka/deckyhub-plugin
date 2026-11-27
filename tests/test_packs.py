import asyncio
import json
import logging
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub import packs, paths  # noqa: E402

from main import PENDING_INSTALLS_FILE, Plugin  # noqa: E402

APPS = [{"id": "mako-decky", "name": "MAKO Decky", "repo": "eugeniosegala/MAKO"}]


def row(name, repo, verified=True):
    return {
        "id": None,
        "name": name,
        "repo": repo,
        "version": "1.0",
        "pluginName": name,
        "identityUnverified": not verified,
    }


class PackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        (self.home / "Downloads").mkdir()
        self.settings_dir = self.home / "settings"
        self.settings_dir.mkdir()
        decky = sys.modules["decky"]
        self.old = getattr(decky, "DECKY_PLUGIN_SETTINGS_DIR", None)
        decky.DECKY_PLUGIN_SETTINGS_DIR = str(self.settings_dir)
        self.patches = [patch.object(paths, "DEFAULT_DOWNLOAD_DIR", str(self.home / "Downloads"))]
        for item in self.patches:
            item.start()
        self.plugin = Plugin()
        self.plugin.apps = APPS
        self.plugin.settings = {"customRepos": []}
        self.saved = []
        self.plugin._save_settings = lambda: self.saved.append(list(self.plugin.settings["customRepos"]))

    def tearDown(self):
        for item in self.patches:
            item.stop()
        if self.old is not None:
            sys.modules["decky"].DECKY_PLUGIN_SETTINGS_DIR = self.old
        self.temp.cleanup()

    def pack(self, content, name="pack.json"):
        path = self.home / "Downloads" / name
        path.write_text(content if isinstance(content, str) else json.dumps(content), encoding="utf-8")
        return str(path)

    def test_export_lists_only_identified_plugins_once_and_never_deckyhub(self):
        rows = [
            row("MAKO Decky", "eugeniosegala/MAKO"),
            row("Mako again", "EugenioSegala/mako"),
            row("Mystery", "someone/mystery", verified=False),
            row("DeckyHub", "mazillka/deckyhub-plugin"),
            row("No repo", None),
        ]
        with patch.object(self.plugin, "_remote_installed_plugins", return_value=rows):
            result = asyncio.run(self.plugin.export_plugin_pack())
        self.assertEqual(result["count"], 1)
        saved = json.loads(Path(result["path"]).read_text(encoding="utf-8"))
        self.assertEqual(saved["plugins"], [{"repo": "eugeniosegala/MAKO", "name": "MAKO Decky", "version": "1.0"}])
        # What DeckyHub can't tie to a repository is kept by name, to reinstall by hand.
        self.assertEqual([item["name"] for item in saved["manual"]], ["Mystery", "No repo"])
        self.assertEqual(result["manual"], 2)
        self.assertEqual((saved["schemaVersion"], saved["kind"]), (1, "deckyhub-pack"))
        # Nothing to put in a pack: no file.
        with patch.object(self.plugin, "_remote_installed_plugins", return_value=[row("X", "a/b", verified=False)]):
            self.assertEqual(asyncio.run(self.plugin.export_plugin_pack()), {"path": None, "count": 0})

    def test_import_queues_the_plugins_and_adds_unknown_repositories_as_custom_ones(self):
        path = self.pack(
            {
                "schemaVersion": 1,
                "name": "Emulation <b>pack</b>",
                "plugins": [
                    {"repo": "eugeniosegala/MAKO", "name": "MAKO"},
                    {"repo": "new/plugin"},
                    "other/thing",
                    {"repo": "NEW/plugin"},
                    {"repo": "mazillka/deckyhub-plugin"},
                    {"repo": "../../etc"},
                    {"repo": 5},
                ],
            }
        )
        result = asyncio.run(self.plugin.import_plugin_pack(path))
        self.assertEqual(
            (result["name"], result["count"], result["added"]),
            ("Emulation bpackb", 3, ["new/plugin", "other/thing"]),
        )
        self.assertEqual(
            [item["repo"] for item in result["plugins"]], ["eugeniosegala/MAKO", "new/plugin", "other/thing"]
        )
        self.assertEqual(self.plugin.settings["customRepos"], ["new/plugin", "other/thing"])
        # An import only reads: the restore window decides what to install, so nothing waits in the installer's queue.
        self.assertFalse((self.settings_dir / PENDING_INSTALLS_FILE).exists())

    def test_versions_state_and_by_hand_names_survive_a_round_trip(self):
        rows = [
            {**row("MAKO Decky", "eugeniosegala/MAKO"), "version": "2.1.0", "disabled": True},
            {**row("No version", "a/b"), "version": "installed"},
            {**row("Mystery", None, verified=False), "version": "0.3"},
        ]
        with patch.object(self.plugin, "_remote_installed_plugins", return_value=rows):
            exported = asyncio.run(self.plugin.export_plugin_pack())
        result = asyncio.run(self.plugin.import_plugin_pack(exported["path"]))
        self.assertEqual(
            result["plugins"],
            [
                {"repo": "eugeniosegala/MAKO", "name": "MAKO Decky", "version": "2.1.0", "disabled": True},
                {"repo": "a/b", "name": "No version", "version": None, "disabled": False},
            ],
        )
        self.assertEqual(result["manual"], [{"name": "Mystery", "version": "0.3"}])

    def test_hostile_details_are_cleaned_or_dropped(self):
        payload = {
            "schemaVersion": 1,
            "plugins": [{"repo": "a/b", "name": "x\n\u202ey" + "z" * 200, "version": 5, "disabled": "yes"}],
            "manual": [{"name": "\n"}, "text", {"name": "Kept", "version": ["1"]}],
        }
        entries, manual = packs.pack_details(payload, ["a/b"])
        self.assertEqual(entries, [{"repo": "a/b", "name": "xy" + "z" * 98, "version": None, "disabled": False}])
        self.assertEqual(manual, [{"name": "Kept", "version": None}])

    def test_the_repository_list_deckyhub_exports_is_a_pack_too(self):
        result = asyncio.run(self.plugin.import_plugin_pack(self.pack({"schemaVersion": 1, "repos": ["a/b"]})))
        self.assertEqual((result["count"], result["added"], result["name"]), (1, ["a/b"], None))

    def test_bad_files_are_refused_and_change_nothing(self):
        outside = Path(tempfile.mkdtemp()) / "pack.json"
        outside.write_text(json.dumps({"schemaVersion": 1, "plugins": ["a/b"]}), encoding="utf-8")
        for label, path in {
            "outside the home folder": str(outside),
            "not json": self.pack("{nope"),
            "wrong version": self.pack({"schemaVersion": 2, "plugins": ["a/b"]}),
            "no plugins list": self.pack({"schemaVersion": 1}),
            "nothing usable": self.pack({"schemaVersion": 1, "plugins": ["../x", {"repo": 1}]}),
            "a list": self.pack(["a/b"]),
            "not a json file": self.pack("x", "pack.txt"),
            "missing": str(self.home / "Downloads" / "none.json"),
            "too large": self.pack(" " * (packs.MAX_PACK_BYTES + 1)),
        }.items():
            with self.subTest(label), self.assertRaises(ValueError):
                asyncio.run(self.plugin.import_plugin_pack(path))
        self.assertEqual((self.plugin.settings["customRepos"], self.saved), ([], []))
        self.assertFalse((self.settings_dir / PENDING_INSTALLS_FILE).exists())

    def test_a_huge_pack_is_cut_to_the_limit(self):
        many = [f"owner/plugin{number}" for number in range(packs.MAX_PACK_PLUGINS + 50)]
        result = asyncio.run(self.plugin.import_plugin_pack(self.pack({"schemaVersion": 1, "plugins": many})))
        self.assertEqual(result["count"], packs.MAX_PACK_PLUGINS)


if __name__ == "__main__":
    unittest.main()
