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
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_remote_uninstall_by_name as by_name

from deckyhub import apps as apps_module
from deckyhub.apps import AppsMixin


class ToggleTests(by_name.Base):
    def test_one_request_switches_several_plugins_after_local_approval(self):
        self.rows.append(by_name.row("Other", "owner/other"))
        result = self.request(action="disable", pluginNames=["kde connect", "KDE Connect", "Other"])
        pending = self.service.list_requests()[0]
        self.assertEqual((pending["action"], pending["pluginNames"]), ("disable", ["KDE Connect", "Other"]))
        self.service.decide_request(result["requestId"], True)
        claim = self.service.claim(result["requestId"], installed=self.rows)
        self.assertEqual(claim["pluginNames"], ["KDE Connect", "Other"])
        self.assertEqual(self.service.finish(result["requestId"], True)["status"], "disabled")

    def test_enable_finishes_as_enabled(self):
        result = self.request(action="enable", pluginNames=["KDE Connect"])
        self.service.decide_request(result["requestId"], True)
        self.service.claim(result["requestId"], installed=self.rows)
        self.assertEqual(self.service.finish(result["requestId"], True)["status"], "enabled")

    def test_the_same_key_returns_the_same_request_and_a_changed_list_conflicts(self):
        fields = {"op": "request", "token": self.token, "idempotencyKey": "same", "action": "disable"}
        first = self.service.remote({**fields, "pluginNames": ["KDE Connect"]}, installed=self.rows)
        again = self.service.remote({**fields, "pluginNames": ["kde connect"]}, installed=self.rows)
        self.assertEqual(first["requestId"], again["requestId"])
        with self.assertRaises(Exception):
            self.service.remote({**fields, "pluginNames": ["Twin"]}, installed=self.rows)

    def test_bad_lists_deckyhub_and_unknown_plugins_are_refused(self):
        for names in ([], None, "KDE Connect", ["DeckyHub"], ["Nothing"], ["Twin"], [1], ["x"] * 51, [""]):
            with self.assertRaises(ValueError, msg=str(names)):
                self.request(action="enable", pluginNames=names)

    def test_a_toggle_cannot_name_a_registry_id_or_release(self):
        with self.assertRaises(ValueError):
            self.request(action="enable", pluginNames=["KDE Connect"], releaseTag="v1")

    def test_a_plugin_that_disappears_fails_the_claim(self):
        result = self.request(action="disable", pluginNames=["KDE Connect"])
        self.service.decide_request(result["requestId"], True)
        self.rows.pop(0)
        with self.assertRaises(ValueError):
            self.service.claim(result["requestId"], installed=self.rows)

    def test_the_plugin_list_says_which_plugins_are_disabled(self):
        self.rows[0]["disabled"] = True
        page = self.service.remote({"op": "plugins", "token": self.token}, installed=self.rows)
        flags = {p["name"]: p["disabled"] for p in page["plugins"]}
        self.assertEqual((flags["KDE Connect"], flags["Twin"]), (True, False))


class DisabledListTests(unittest.TestCase):
    def read(self, content):
        with tempfile.TemporaryDirectory() as home:
            if content is not None:
                (Path(home) / "settings").mkdir()
                (Path(home) / "settings" / "loader.json").write_text(content, encoding="utf-8")
            with patch.object(apps_module.decky, "DECKY_HOME", home, create=True):
                return AppsMixin._disabled_plugins(object())

    def test_reads_the_names_decky_loader_switched_off(self):
        self.assertEqual(self.read(json.dumps({"disabled_plugins": ["A", 3, "B"]})), {"A", "B"})

    def test_a_missing_or_broken_file_means_nothing_is_disabled(self):
        self.assertEqual(self.read(None), set())
        self.assertEqual(self.read("{nope"), set())
        self.assertEqual(self.read("[]"), set())


if __name__ == "__main__":
    unittest.main()
