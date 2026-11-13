import secrets
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub.remote_install_service import MAX_SUMMARY, RemoteInstallService


class SummaryTests(unittest.TestCase):
    def setUp(self):
        self.service = RemoteInstallService(apps=lambda: [], installed=lambda: [], wall=lambda: 1000.4)
        grant = self.service.begin_pairing()
        secret = secrets.token_urlsafe(32)
        pairing = self.service.remote(
            {"op": "pair", "name": "Phone", "pairingSecret": secret, "pairingToken": grant["pairingToken"]}
        )
        self.service.decide_pairing(pairing["pairingId"], True)
        self.token = self.service.pair_status(pairing["pairingId"], secret)["token"]

    def ask(self):
        return self.service.remote({"op": "summary", "token": self.token})

    def test_nothing_is_known_until_the_device_reports(self):
        self.assertEqual(self.ask()["updates"], [])
        self.assertIsNone(self.ask()["checkedAt"])

    def test_a_paired_browser_reads_what_the_device_reported(self):
        self.service.set_updates([{"name": "A", "version": "2.0", "extra": "dropped"}])
        answer = self.ask()
        self.assertEqual(answer["updates"], [{"name": "A", "version": "2.0"}])
        self.assertEqual(answer["checkedAt"], 1000)

    def test_bad_entries_are_dropped_and_the_list_is_capped(self):
        self.service.set_updates(
            [{"name": "", "version": "1"}, {"name": "A"}, 5, {"name": "x" * 101, "version": "1"}]
            + [{"name": f"P{n}", "version": "1"} for n in range(MAX_SUMMARY + 10)]
        )
        self.assertLessEqual(len(self.ask()["updates"]), MAX_SUMMARY)
        with self.assertRaises(ValueError):
            self.service.set_updates("nope")

    def test_an_unknown_browser_cannot_ask(self):
        with self.assertRaises(ValueError):
            self.service.remote({"op": "summary", "token": secrets.token_urlsafe(32)})


if __name__ == "__main__":
    unittest.main()
