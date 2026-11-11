import secrets
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub.remote_install_service import RemoteInstallService


def row(name, repo=None, version="1.0"):
    return {"id": None, "name": name, "repo": repo, "version": version, "pluginName": name, "identityUnverified": True}


class Base(unittest.TestCase):
    def setUp(self):
        self.rows = [
            row("KDE Connect", "owner/kde"),
            row("Twin"),
            row("Twin"),
            row("DeckyHub", "mazillka/deckyhub-plugin"),
        ]
        self.service = RemoteInstallService(apps=lambda: [], installed=lambda: self.rows)
        grant = self.service.begin_pairing()
        secret = secrets.token_urlsafe(32)
        pairing = self.service.remote(
            {"op": "pair", "name": "Phone", "pairingSecret": secret, "pairingToken": grant["pairingToken"]}
        )
        self.service.decide_pairing(pairing["pairingId"], True)
        self.token = self.service.pair_status(pairing["pairingId"], secret)["token"]

    def request(self, **fields):
        return self.service.remote(
            {"op": "request", "token": self.token, "idempotencyKey": secrets.token_urlsafe(8), **fields},
            installed=self.rows,
        )


class UninstallByNameTests(Base):
    def test_a_plugin_outside_the_registry_can_be_uninstalled_by_name_after_local_approval(self):
        result = self.request(action="uninstall", pluginName="kde connect")
        self.assertEqual(self.service.list_requests()[0]["pluginName"], "KDE Connect")
        self.service.decide_request(result["requestId"], True)
        claim = self.service.claim(result["requestId"], installed=self.rows)
        self.assertEqual((claim["pluginId"], claim["pluginName"], claim["action"]), (None, "KDE Connect", "uninstall"))

    def test_the_plugin_must_still_match_when_claimed(self):
        result = self.request(action="uninstall", pluginName="KDE Connect")
        self.service.decide_request(result["requestId"], True)
        self.rows[0]["version"] = "2.0"
        with self.assertRaises(ValueError):
            self.service.claim(result["requestId"], installed=self.rows)

    def test_ambiguous_missing_and_deckyhub_names_are_refused(self):
        for name in ("Twin", "Nothing", "DeckyHub", "", None):
            with self.assertRaises(ValueError, msg=name):
                self.request(action="uninstall", pluginName=name)

    def test_only_uninstall_can_use_a_name(self):
        for action in ("install", "update"):
            with self.assertRaises(ValueError):
                self.request(action=action, pluginName="KDE Connect")

    def test_a_retry_returns_the_same_request_and_a_different_plugin_conflicts(self):
        first = self.service.remote(
            {
                "op": "request",
                "token": self.token,
                "idempotencyKey": "k",
                "action": "uninstall",
                "pluginName": "KDE Connect",
            },
            installed=self.rows,
        )
        again = self.service.remote(
            {
                "op": "request",
                "token": self.token,
                "idempotencyKey": "k",
                "action": "uninstall",
                "pluginName": "KDE Connect",
            },
            installed=self.rows,
        )
        self.assertEqual(first["requestId"], again["requestId"])
        with self.assertRaises(Exception):
            self.service.remote(
                {
                    "op": "request",
                    "token": self.token,
                    "idempotencyKey": "k",
                    "action": "uninstall",
                    "pluginName": "Other",
                },
                installed=self.rows + [row("Other")],
            )


class TrustedDeviceTests(Base):
    def test_a_trusted_device_needs_no_local_approval_and_an_untrusted_one_does(self):
        first = self.request(action="uninstall", pluginName="KDE Connect")
        self.assertEqual((first["status"], self.service.list_trusted_requests()), ("pending_confirmation", []))
        device = self.service.list_devices()[0]
        self.assertFalse(device["trusted"])
        self.service.set_trusted(device["id"], True)
        second = self.request(action="uninstall", pluginName="KDE Connect")
        self.assertEqual(second["status"], "approved")
        self.assertEqual([r["id"] for r in self.service.list_trusted_requests()], [second["requestId"]])
        self.assertEqual(len(self.service.list_requests()), 1)
        self.service.claim(second["requestId"], installed=self.rows)

    def test_trust_is_only_set_locally_for_a_known_device_and_ends_on_revoke(self):
        device = self.service.list_devices()[0]["id"]
        self.service.set_trusted(device, True)
        for args in (("nope", True), (device, "yes")):
            with self.assertRaises(ValueError):
                self.service.set_trusted(*args)
        with self.assertRaises(ValueError):
            self.service.remote({"op": "set_trusted", "token": self.token, "deviceId": device}, installed=self.rows)
        self.service.revoke(device)
        self.assertEqual(self.service.list_trusted_requests(), [])


if __name__ == "__main__":
    unittest.main()


class AuditFixTests(Base):
    def setUp(self):
        self.now = 1000.0
        self.wall_now = 1_000_000.0
        self.rows = [row("KDE Connect", "owner/kde")]
        self.service = RemoteInstallService(
            apps=lambda: [], installed=lambda: self.rows, clock=lambda: self.now, wall=lambda: self.wall_now
        )
        grant = self.service.begin_pairing()
        secret = secrets.token_urlsafe(32)
        pairing = self.service.remote(
            {"op": "pair", "name": "Phone", "pairingSecret": secret, "pairingToken": grant["pairingToken"]}
        )
        self.service.decide_pairing(pairing["pairingId"], True)
        self.token = self.service.pair_status(pairing["pairingId"], secret)["token"]
        self.device = self.service.list_devices()[0]["id"]

    def test_an_approved_request_nobody_started_expires(self):
        self.service.set_trusted(self.device, True)
        result = self.request(action="uninstall", pluginName="KDE Connect")
        self.assertEqual(len(self.service.list_trusted_requests()), 1)
        self.now += 121
        self.assertEqual(self.service.list_trusted_requests(), [])
        with self.assertRaises(Exception):
            self.service.claim(result["requestId"], installed=self.rows)

    def test_only_a_trusted_devices_request_wakes_the_runner(self):
        woken = []
        self.service.on_trusted_request = lambda: woken.append(True)
        self.request(action="uninstall", pluginName="KDE Connect")
        self.assertEqual(woken, [])
        self.service.set_trusted(self.device, True)
        self.request(action="uninstall", pluginName="KDE Connect", idempotencyKey="second-key")
        self.assertEqual(woken, [True])

    def test_approving_restarts_the_request_clock(self):
        result = self.request(action="uninstall", pluginName="KDE Connect")
        self.now += 100
        self.service.decide_request(result["requestId"], True)
        self.now += 100
        self.service.claim(result["requestId"], installed=self.rows)

    def test_removing_trust_cancels_requests_approved_on_trust(self):
        self.service.set_trusted(self.device, True)
        result = self.request(action="uninstall", pluginName="KDE Connect")
        self.service.set_trusted(self.device, False)
        self.assertEqual(self.service.list_trusted_requests(), [])
        with self.assertRaises(Exception):
            self.service.claim(result["requestId"], installed=self.rows)

    def test_a_device_unused_for_30_days_is_forgotten_and_use_keeps_it_alive(self):
        self.wall_now += 20 * 24 * 3600
        self.service.owner(self.token)
        self.wall_now += 20 * 24 * 3600
        self.service.owner(self.token)
        self.wall_now += 31 * 24 * 3600
        with self.assertRaises(ValueError):
            self.service.owner(self.token)
        self.assertEqual(self.service.list_devices(), [])
