import secrets
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub.remote_install_queue import InvalidTransitionError
from deckyhub.remote_install_service import RemoteInstallService


class RemoteInstallServiceTests(unittest.TestCase):
    def setUp(self):
        self.now = 1000.0
        self.apps = [{"id": "plugin-one", "repo": "owner/one"}, {"id": "plugin-two", "repo": "owner/two"}]
        self.service = RemoteInstallService(apps=lambda: self.apps, clock=lambda: self.now)

    def _secret(self):
        return secrets.token_urlsafe(32)

    def test_begin_pairing_returns_six_digit_code_and_expires(self):
        p = self.service.begin_pairing()
        self.assertEqual(len(p["code"]), 6)
        self.assertTrue(p["code"].isdigit())
        self.assertEqual(p["expiresInSeconds"], 120)

    def test_pairing_link_is_single_use_and_requires_local_approval(self):
        grant = self.service.begin_pairing()
        secret = self._secret()
        result = self.service.remote(
            {"op": "pair", "pairingToken": grant["pairingToken"], "name": "Phone", "pairingSecret": secret}
        )
        self.assertEqual(self.service.pair_status(result["pairingId"], secret), {"status": "pending"})
        with self.assertRaises(ValueError):
            self.service.pair(None, "Other browser", self._secret(), grant["pairingToken"])
        with self.assertRaises(ValueError):
            self.service.pair(grant["code"], "Other browser", self._secret())
        self.service.decide_pairing(result["pairingId"], True)
        self.assertEqual(len(self.service.pair_status(result["pairingId"], secret)["token"]), 43)

    def test_pairing_link_expires(self):
        grant = self.service.begin_pairing()
        self.now += grant["expiresInSeconds"]
        with self.assertRaises(ValueError):
            self.service.pair(None, "Phone", self._secret(), grant["pairingToken"])

    def test_pair_and_pair_status_workflow(self):
        p = self.service.begin_pairing()
        code = p["code"]
        secret = self._secret()

        # Pair with valid code
        res = self.service.pair(code, "Chrome on Linux", secret)
        self.assertIn("pairingId", res)
        pair_id = res["pairingId"]

        # Status before decision
        status = self.service.pair_status(pair_id, secret)
        self.assertEqual(status["status"], "pending")
        self.assertNotIn("token", status)

        # Visible in list_pairings
        pairings = self.service.list_pairings()
        self.assertEqual(len(pairings), 1)
        self.assertEqual(pairings[0]["id"], pair_id)
        self.assertEqual(pairings[0]["name"], "Chrome on Linux")

        # Approval on Deck
        decide = self.service.decide_pairing(pair_id, True)
        self.assertEqual(decide["status"], "approved")

        # Status after approval returns token
        status_after = self.service.pair_status(pair_id, secret)
        self.assertEqual(status_after["status"], "approved")
        self.assertIn("token", status_after)
        token = status_after["token"]

        # Device listed
        devices = self.service.list_devices()
        self.assertEqual(len(devices), 1)
        self.assertEqual(devices[0]["name"], "Chrome on Linux")

        # Owner matches token
        device_id = self.service.owner(token)
        self.assertEqual(device_id, devices[0]["id"])

    def test_pair_rejection_workflow(self):
        p = self.service.begin_pairing()
        secret = self._secret()
        res = self.service.pair(p["code"], "Firefox on Phone", secret)
        pair_id = res["pairingId"]

        self.service.decide_pairing(pair_id, False)
        status = self.service.pair_status(pair_id, secret)
        self.assertEqual(status["status"], "rejected")
        self.assertNotIn("token", status)
        self.assertEqual(self.service.list_devices(), [])

    def test_pair_invalid_inputs_and_rate_limits(self):
        secret = self._secret()
        with self.assertRaises(ValueError):
            self.service.pair("123456", "Browser", secret)  # No begin_pairing called

        self.service.begin_pairing()
        with self.assertRaises(ValueError):
            self.service.pair("000000", "Browser", secret)  # Wrong code
        with self.assertRaises(ValueError):
            self.service.pair("123456", "", secret)  # Empty browser name
        with self.assertRaises(ValueError):
            self.service.pair("123456", "Browser", "short")  # Invalid secret format

        # Rate limit after 5 attempts
        for _ in range(3):
            try:
                self.service.pair("000000", "Browser", secret)
            except ValueError:
                pass
        with self.assertRaises(ValueError) as ctx:
            self.service.pair("000000", "Browser", secret)
        self.assertIn("too many pairing attempts", str(ctx.exception))

    def test_pairing_code_expiry(self):
        p = self.service.begin_pairing()
        self.now += 121
        secret = self._secret()
        with self.assertRaises(ValueError):
            self.service.pair(p["code"], "Browser", secret)

    def test_revoke_device_blocks_future_requests(self):
        p = self.service.begin_pairing()
        secret = self._secret()
        res = self.service.pair(p["code"], "Tablet", secret)
        self.service.decide_pairing(res["pairingId"], True)
        token = self.service.pair_status(res["pairingId"], secret)["token"]
        device_id = self.service.owner(token)

        self.assertTrue(self.service.revoke(device_id))
        self.assertEqual(self.service.list_devices(), [])
        with self.assertRaises(ValueError):
            self.service.owner(token)

    def test_revoke_cancels_pending_request(self):
        p = self.service.begin_pairing()
        secret = self._secret()
        pair = self.service.pair(p["code"], "Browser", secret)
        self.service.decide_pairing(pair["pairingId"], True)
        token = self.service.pair_status(pair["pairingId"], secret)["token"]
        owner = self.service.owner(token)
        request = self.service.remote(
            {"op": "request", "token": token, "idempotencyKey": "k", "pluginId": "plugin-one"}
        )
        self.service.revoke(owner)
        self.assertEqual(self.service.queue.get(owner, request["requestId"]).status, "cancelled")
        with self.assertRaises(InvalidTransitionError):
            self.service.decide_request(request["requestId"], True)

    def test_uncertain_install_is_not_reported_installed(self):
        request = self.service.queue.create("device", "key", "plugin-one", repository="owner/one")
        self.service.decide_request(request.id, True)
        self.service.claim(request.id)
        self.assertEqual(self.service.finish_unknown(request.id)["status"], "unknown")
        with self.assertRaises(InvalidTransitionError):
            self.service.finish(request.id, True)

    def test_revoke_blocks_approved_but_unclaimed_request(self):
        p = self.service.begin_pairing()
        secret = self._secret()
        pair = self.service.pair(p["code"], "Browser", secret)
        self.service.decide_pairing(pair["pairingId"], True)
        token = self.service.pair_status(pair["pairingId"], secret)["token"]
        owner = self.service.owner(token)
        request = self.service.remote(
            {"op": "request", "token": token, "idempotencyKey": "k", "pluginId": "plugin-one"}
        )
        self.service.decide_request(request["requestId"], True)
        self.service.revoke(owner)
        with self.assertRaises(InvalidTransitionError):
            self.service.claim(request["requestId"])

    def test_remote_install_request_flow(self):
        p = self.service.begin_pairing()
        secret = self._secret()
        pair_res = self.service.pair(p["code"], "Browser", secret)
        self.service.decide_pairing(pair_res["pairingId"], True)
        token = self.service.pair_status(pair_res["pairingId"], secret)["token"]

        # Reject unknown plugin ID
        with self.assertRaises(ValueError):
            self.service.remote({"op": "request", "token": token, "idempotencyKey": "k1", "pluginId": "unknown-plugin"})

        # Submit valid request
        req = self.service.remote(
            {
                "op": "request",
                "token": token,
                "idempotencyKey": "k1",
                "pluginId": "plugin-one",
                "releaseTag": "v1.0.0",
            }
        )
        self.assertIn("requestId", req)
        self.assertEqual(req["status"], "pending_confirmation")
        req_id = req["requestId"]

        # Check status via remote
        status = self.service.remote({"op": "status", "token": token, "requestId": req_id})
        self.assertEqual(status["status"], "pending_confirmation")

        # Listed on Deck
        pending = self.service.list_requests()
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["id"], req_id)
        self.assertEqual(pending[0]["pluginId"], "plugin-one")
        self.assertEqual(pending[0]["releaseTag"], "v1.0.0")
        self.assertEqual(pending[0]["ownerName"], "Browser")

        # Deck approves
        decision = self.service.decide_request(req_id, True)
        self.assertEqual(decision["status"], "approved")

        # Worker claims
        claim = self.service.claim(req_id)
        self.assertEqual(claim["status"], "installing")
        self.assertEqual(claim["pluginId"], "plugin-one")

        # Finish install
        finish = self.service.finish(req_id, True)
        self.assertEqual(finish["status"], "installed")

        # Remote query verifies installed state
        final_status = self.service.remote({"op": "status", "token": token, "requestId": req_id})
        self.assertEqual(final_status["status"], "installed")

    def test_remote_cancel_request(self):
        p = self.service.begin_pairing()
        secret = self._secret()
        pair_res = self.service.pair(p["code"], "Browser", secret)
        self.service.decide_pairing(pair_res["pairingId"], True)
        token = self.service.pair_status(pair_res["pairingId"], secret)["token"]

        req = self.service.remote(
            {
                "op": "request",
                "token": token,
                "idempotencyKey": "k2",
                "pluginId": "plugin-two",
            }
        )
        req_id = req["requestId"]
        cancel = self.service.remote({"op": "cancel", "token": token, "requestId": req_id})
        self.assertEqual(cancel["status"], "cancelled")

    def test_claim_fails_if_plugin_removed_from_registry(self):
        p = self.service.begin_pairing()
        secret = self._secret()
        pair_res = self.service.pair(p["code"], "Browser", secret)
        self.service.decide_pairing(pair_res["pairingId"], True)
        token = self.service.pair_status(pair_res["pairingId"], secret)["token"]

        req = self.service.remote(
            {
                "op": "request",
                "token": token,
                "idempotencyKey": "k3",
                "pluginId": "plugin-one",
            }
        )
        req_id = req["requestId"]
        self.service.decide_request(req_id, True)

        # Remove plugin from registry before claim
        self.apps.clear()
        with self.assertRaises(ValueError):
            self.service.claim(req_id)
        status = self.service.remote({"op": "status", "token": token, "requestId": req_id})
        self.assertEqual(status["status"], "failed")


if __name__ == "__main__":
    unittest.main()
