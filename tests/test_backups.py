import asyncio
import io
import json
import logging
import sys
import tarfile
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub import backups  # noqa: E402


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name) / "homebrew"
        self.own = self.home / "settings" / "DeckyHub"
        self.own.mkdir(parents=True)
        decky = sys.modules["decky"]
        self.originals = {key: getattr(decky, key, None) for key in ("DECKY_HOME", "DECKY_PLUGIN_SETTINGS_DIR")}
        decky.DECKY_HOME = str(self.home)
        decky.DECKY_PLUGIN_SETTINGS_DIR = str(self.own)
        plugin = self.home / "plugins" / "Some Plugin"
        plugin.mkdir(parents=True)
        (plugin / "plugin.json").write_text(json.dumps({"name": "Some Plugin"}), encoding="utf-8")
        self.settings = self.home / "settings" / "Some Plugin"
        self.settings.mkdir()
        (self.settings / "config.json").write_text('{"volume": 7}', encoding="utf-8")

    def tearDown(self):
        decky = sys.modules["decky"]
        for key, value in self.originals.items():
            if value is None:
                delattr(decky, key)
            else:
                setattr(decky, key, value)
        self.temp.cleanup()

    def test_a_plugins_settings_are_archived_and_restored_over_changed_ones(self):
        made = backups.make_backup("Some Plugin")
        self.assertRegex(made["file"], r"^Some Plugin--\d{8}-\d{6}\.tar\.gz$")
        self.assertEqual([item["file"] for item in backups.list_backups()], [made["file"]])
        (self.settings / "config.json").write_text('{"volume": 1}', encoding="utf-8")
        (self.settings / "extra.txt").write_text("new", encoding="utf-8")
        self.assertEqual(backups.restore_backup("Some Plugin", made["file"]), {"restored": True})
        self.assertEqual((self.settings / "config.json").read_text(encoding="utf-8"), '{"volume": 7}')
        self.assertFalse((self.settings / "extra.txt").exists())
        # The settings that were replaced were saved first, so the restore can be undone.
        self.assertEqual(len(backups.list_backups()), 2)
        self.assertEqual([path.name for path in (self.home / "settings").iterdir() if path.name.startswith(".")], [])

    def test_nothing_to_save_a_missing_folder_and_a_bad_name_are_not_errors_that_stop_anything(self):
        (self.settings / "config.json").unlink()
        self.assertEqual(backups.make_backup("Some Plugin"), {"skipped": True})
        self.assertEqual(backups.make_backup("Missing"), {"skipped": True})
        for bad in ("", "../Some Plugin", "a/b", ".hidden"):
            self.assertIn("error", backups.make_backup(bad))

    def test_only_the_newest_five_per_plugin_are_kept_and_a_huge_folder_is_refused(self):
        folder = self.home / "backups-source"
        stamps = [f"20260101-00000{number}" for number in range(7)]
        target = self.own / "backups" / "Some Plugin"
        target.mkdir(parents=True)
        for stamp in stamps:
            (target / f"Some Plugin--{stamp}.tar.gz").write_bytes(b"x")
        backups.make_backup("Some Plugin")
        kept = sorted(path.name for path in target.glob("*.tar.gz"))
        self.assertEqual(len(kept), backups.KEEP)
        self.assertNotIn("Some Plugin--20260101-000000.tar.gz", kept)
        self.assertFalse(folder.exists())
        with patch.object(backups, "MAX_BYTES", 3):
            self.assertIn("larger", backups.make_backup("Some Plugin")["error"])

    def archive(self, add):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode="w:gz") as archive:
            add(archive)
        folder = self.own / "backups" / "Some Plugin"
        folder.mkdir(parents=True, exist_ok=True)
        name = "Some Plugin--20260102-030405.tar.gz"
        (folder / name).write_bytes(data.getvalue())
        return name

    def test_a_backup_with_links_or_paths_that_climb_out_is_refused_and_changes_nothing(self):
        def file(archive, name, content=b"x"):
            info = tarfile.TarInfo(name)
            info.size = len(content)
            archive.addfile(info, io.BytesIO(content))

        def link(archive):
            info = tarfile.TarInfo("evil")
            info.type = tarfile.SYMTYPE
            info.linkname = "/etc/passwd"
            archive.addfile(info)

        for label, add in {
            "parent path": lambda a: file(a, "../outside.txt"),
            "absolute path": lambda a: file(a, "/tmp/outside.txt"),
            "symlink": link,
        }.items():
            with self.subTest(label):
                name = self.archive(add)
                with self.assertRaises(ValueError):
                    backups.restore_backup("Some Plugin", name)
                self.assertEqual((self.settings / "config.json").read_text(encoding="utf-8"), '{"volume": 7}')
                self.assertFalse((self.home / "outside.txt").exists())
                self.assertEqual(
                    [path.name for path in (self.home / "settings").iterdir() if path.name.startswith(".")], []
                )

    def test_only_a_listed_backup_of_that_plugin_can_be_restored_or_deleted(self):
        made = backups.make_backup("Some Plugin")["file"]
        for folder, file in (
            ("Other", made),
            ("Some Plugin", "../../config.json"),
            ("Some Plugin", "Some Plugin--20260101-000000.tar.gz"),
            ("../Some Plugin", made),
        ):
            with self.subTest(folder=folder, file=file), self.assertRaises(ValueError):
                backups._backup_path(folder, file)
        result = asyncio.run(backups.BackupsMixin().restore_settings_backup("Other", made))
        self.assertIn("error", result)
        self.assertEqual(
            asyncio.run(backups.BackupsMixin().delete_settings_backup("Some Plugin", made)), {"deleted": True}
        )
        self.assertEqual(backups.list_backups(), [])

    def test_the_rpc_finds_the_folder_from_the_plugins_name_and_skips_an_unknown_or_ambiguous_one(self):
        mixin = backups.BackupsMixin()
        self.assertIn("file", asyncio.run(mixin.backup_plugin_settings("some plugin")))
        self.assertEqual(asyncio.run(mixin.backup_plugin_settings("Not installed")), {"skipped": True})
        twin = self.home / "plugins" / "Copy"
        twin.mkdir()
        (twin / "plugin.json").write_text(json.dumps({"name": "Some Plugin"}), encoding="utf-8")
        self.assertEqual(asyncio.run(mixin.backup_plugin_settings("Some Plugin")), {"skipped": True})


if __name__ == "__main__":
    unittest.main()
