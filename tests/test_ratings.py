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
from deckyhub import ratings  # noqa: E402
from deckyhub.settings import coerce_settings  # noqa: E402

from main import Plugin  # noqa: E402


class RatingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.plugin = Plugin()
        self.plugin.settings_path = Path(self.temp.name) / "settings.json"
        self.plugin.settings = {**coerce_settings({}), "customRepos": [], "customRegistries": [], "repoSettings": {}}
        self.sent = []

        def send(method, body):
            self.sent.append((method, body))

        patcher = patch.object(self.plugin, "_send_rating", side_effect=send)
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_async(self, call):
        return asyncio.run(call)

    def test_nothing_is_sent_until_share_ratings_is_on(self):
        self.assertIs(self.plugin.settings["shareRatings"], False)
        with self.assertRaises(ValueError):
            self.run_async(self.plugin.rate_plugin("o/p", "1.0", 5, True))
        self.assertEqual(self.sent, [])

    def test_a_rating_goes_out_with_a_random_device_id_that_is_kept(self):
        self.plugin.settings["shareRatings"] = True
        result = self.run_async(self.plugin.rate_plugin("o/p", "1.2.3", 4, False))
        self.assertEqual(result, {"sent": True, "rating": {"stars": 4, "works": False}})
        method, body = self.sent[0]
        self.assertEqual(
            (method, body["plugin"], body["stars"], body["works"], body["version"]), ("POST", "o/p", 4, False, "1.2.3")
        )
        self.assertRegex(body["device"], r"^[A-Za-z0-9_-]{43}$")
        self.assertEqual(self.plugin.settings["ratingDevice"], body["device"])
        self.assertEqual(self.plugin.settings["myRatings"], {"o/p": {"stars": 4, "works": False}})
        # The same device again: the same id, and the rating is replaced.
        self.run_async(self.plugin.rate_plugin("o/p", None, 5, None))
        self.assertEqual(self.sent[1][1]["device"], body["device"])
        self.assertEqual(self.plugin.settings["myRatings"], {"o/p": {"stars": 5}})
        saved = json.loads(self.plugin.settings_path.read_text(encoding="utf-8"))
        self.assertEqual(saved["ratingDevice"], body["device"])

    def test_bad_ratings_are_refused_before_anything_is_sent(self):
        self.plugin.settings["shareRatings"] = True
        for repo, stars, works in (
            ("x", 5, None),
            ("o/p", 0, None),
            ("o/p", 6, None),
            ("o/p", True, None),
            ("o/p", None, None),
            ("o/p", 3, "yes"),
        ):
            with self.assertRaises(ValueError, msg=(repo, stars, works)):
                self.run_async(self.plugin.rate_plugin(repo, None, stars, works))
        self.assertEqual(self.sent, [])

    def test_a_failed_send_keeps_nothing_and_says_so(self):
        self.plugin.settings["shareRatings"] = True
        with patch.object(self.plugin, "_send_rating", side_effect=OSError("offline")):
            self.assertEqual(self.run_async(self.plugin.rate_plugin("o/p", None, 5, None)), {"sent": False})
        self.assertEqual(self.plugin.settings["myRatings"], {} if "myRatings" in self.plugin.settings else {})

    def test_taking_a_rating_back_tells_the_worker_and_forgets_it_here(self):
        self.plugin.settings["shareRatings"] = True
        self.run_async(self.plugin.rate_plugin("o/p", None, 5, True))
        self.assertEqual(self.run_async(self.plugin.withdraw_rating("o/p")), {"removed": True})
        method, body = self.sent[-1]
        self.assertEqual((method, body["plugin"]), ("DELETE", "o/p"))
        self.assertEqual(self.plugin.settings["myRatings"], {})
        # If the Worker can't be reached the rating stays, so it can be taken back later.
        self.run_async(self.plugin.rate_plugin("o/p", None, 5, True))
        with patch.object(self.plugin, "_send_rating", side_effect=OSError("offline")):
            self.assertEqual(self.run_async(self.plugin.withdraw_rating("o/p")), {"removed": False})
        self.assertIn("o/p", self.plugin.settings["myRatings"])

    def test_a_form_saved_by_the_frontend_keeps_the_device_id_and_the_ratings(self):
        self.plugin.settings["shareRatings"] = True
        self.run_async(self.plugin.rate_plugin("o/p", None, 3, None))
        device = self.plugin.settings["ratingDevice"]
        form = {**self.plugin.settings, "ratingDevice": "", "myRatings": {}, "shareRatings": True}
        saved = self.run_async(self.plugin.save_settings(form))
        self.assertEqual(saved["ratingDevice"], device)
        self.assertEqual(saved["myRatings"], {"o/p": {"stars": 3}})

    def test_settings_read_from_a_file_are_cleaned(self):
        settings = coerce_settings(
            {
                "shareRatings": "yes",
                "ratingDevice": "short",
                "myRatings": {"o/p": {"stars": 9, "works": True}, "bad": {"stars": 1}, "o/q": {"stars": 2}},
            }
        )
        self.assertIs(settings["shareRatings"], False)
        self.assertEqual(settings["ratingDevice"], "")
        self.assertEqual(settings["myRatings"], {"o/p": {"works": True}, "o/q": {"stars": 2}})
        self.assertEqual(ratings.coerce_device("a" * 43), "a" * 43)


if __name__ == "__main__":
    unittest.main()
