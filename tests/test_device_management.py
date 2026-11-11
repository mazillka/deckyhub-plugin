import json
import secrets
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub.remote_install_queue import RequestConflictError
from deckyhub.remote_install_service import RemoteInstallService


class DeviceManagementTests(unittest.TestCase):
    def setUp(self):
        self.rows = []
        self.apps = [{"id": "example", "repo": "owner/example"}]
        self.service = RemoteInstallService(lambda: self.apps, installed=lambda: self.rows)
        secret = secrets.token_urlsafe(32)
        code = self.service.begin_pairing()["code"]
        pair = self.service.pair(code, "Browser", secret)["pairingId"]
        self.service.decide_pairing(pair, True)
        self.token = self.service.pair_status(pair, secret)["token"]

    def remote(self, **message):
        return self.service.remote({"token": self.token, **message})

    def installed(self):
        self.rows[:] = [
            {
                "id": "example",
                "name": "Example",
                "repo": "owner/example",
                "version": "1",
                "pluginName": "Example",
                "identityUnverified": False,
            }
        ]

    def request(self, action="install", key="key", **options):
        return self.remote(op="request", pluginId="example", action=action, idempotencyKey=key, **options)["requestId"]

    def test_authenticated_inventory_pagination_and_revocation(self):
        self.rows[:] = [
            {
                "id": None,
                "name": "\U0001f600" * 1000,
                "pluginName": "Unknown",
                "version": "1",
                "identityUnverified": True,
            }
        ] * 41
        first = self.remote(op="plugins")
        self.assertEqual((len(first["plugins"]), first["nextOffset"]), (20, 20))
        self.assertLess(len(json.dumps(first).encode()), 16384)
        self.assertEqual(self.remote(op="plugins", offset=40)["nextOffset"], None)
        for offset in (-1, True, "0"):
            with self.assertRaises(ValueError):
                self.remote(op="plugins", offset=offset)
        self.service.revoke(self.service.owner(self.token))
        with self.assertRaises(ValueError):
            self.remote(op="plugins")

    def test_actions_and_uninstall_completion(self):
        self.installed()
        request = self.request("uninstall")
        self.service.decide_request(request, True)
        claimed = self.service.claim(request)
        self.assertEqual(
            (claimed["action"], claimed["pluginName"], claimed["installedVersion"]), ("uninstall", "Example", "1")
        )
        self.assertEqual(self.service.finish(request, True)["status"], "uninstalled")
        self.assertEqual(self.remote(op="status", requestId=request)["status"], "uninstalled")
        self.rows.clear()
        self.assertEqual(self.request("uninstall"), request)

    def test_unverified_and_missing_identity_are_read_only(self):
        with self.assertRaises(ValueError):
            self.request("update")
        self.installed()
        self.rows[0]["identityUnverified"] = True
        for action in ("install", "update", "uninstall"):
            with self.assertRaises(ValueError):
                self.request(action)

    def test_action_conflict_and_stale_claim(self):
        self.installed()
        request = self.request("update")
        with self.assertRaises(RequestConflictError):
            self.request("uninstall")
        self.service.decide_request(request, True)
        self.rows[0]["version"] = "2"
        with self.assertRaises(ValueError):
            self.service.claim(request)
        self.assertEqual(self.remote(op="status", requestId=request)["status"], "failed")

    def test_install_appearance_and_registry_changes_invalidate_approval(self):
        request = self.request()
        self.service.decide_request(request, True)
        self.installed()
        with self.assertRaises(ValueError):
            self.service.claim(request)
        request = self.request("update", key="other")
        self.service.decide_request(request, True)
        self.apps[0]["repo"] = "owner/changed"
        with self.assertRaises(ValueError):
            self.service.claim(request)

    def test_uninstall_release_and_self_management_rejected(self):
        self.installed()
        with self.assertRaises(ValueError):
            self.request("uninstall", releaseTag="v1")
        self.rows[0]["pluginName"] = "DeckyHub"
        for action in ("update", "uninstall"):
            with self.assertRaises(ValueError):
                self.request(action)
