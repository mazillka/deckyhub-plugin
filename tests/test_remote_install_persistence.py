import datetime
import importlib.util
import secrets
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub import remote_install_transport as transport
from deckyhub.remote_install_service import RemoteInstallService
from deckyhub.remote_install_store import RemoteInstallStore


def pair(service, code=None, token=None):
    secret = secrets.token_urlsafe(32)
    result = service.remote(
        {
            "op": "pair",
            "name": "Phone",
            "pairingSecret": secret,
            **({"pairingToken": token} if token else {"code": code}),
        }
    )
    service.decide_pairing(result["pairingId"], True)
    return service.pair_status(result["pairingId"], secret)["token"]


class PersistenceTests(unittest.TestCase):
    def test_paired_devices_survive_a_restart_and_revocation_is_saved(self):
        with tempfile.TemporaryDirectory() as folder:
            store = RemoteInstallStore(Path(folder) / "remote-install.json")
            first = RemoteInstallService(apps=lambda: [], store=store)
            token = pair(first, token=first.begin_pairing()["pairingToken"])
            second = RemoteInstallService(apps=lambda: [], store=store)
            device = second.owner(token)
            self.assertTrue(second.revoke(device))
            with self.assertRaises(ValueError):
                RemoteInstallService(apps=lambda: [], store=store).owner(token)

    def test_a_browsers_id_survives_a_restart_so_pairing_again_still_replaces_its_entry(self):
        with tempfile.TemporaryDirectory() as folder:
            store = RemoteInstallStore(Path(folder) / "remote-install.json")
            first = RemoteInstallService(apps=lambda: [], store=store)
            browser = secrets.token_urlsafe(32)

            def pair_with_id(service):
                secret = secrets.token_urlsafe(32)
                pairing = service.begin_pairing()["pairingToken"]
                pair_id = service.pair(None, "Phone", secret, pairing, browser)["pairingId"]
                service.decide_pairing(pair_id, True)
                return service.pair_status(pair_id, secret)["token"]

            old = pair_with_id(first)
            second = RemoteInstallService(apps=lambda: [], store=store)
            new = pair_with_id(second)
            self.assertEqual(len(second.devices), 1)
            with self.assertRaises(ValueError):
                second.owner(old)
            second.owner(new)

    def test_reset_session_keeps_devices_but_drops_pending_state(self):
        service = RemoteInstallService(apps=lambda: [])
        token = pair(service, token=service.begin_pairing()["pairingToken"])
        service.begin_pairing()
        service.reset_session()
        self.assertIsNone(service.code)
        service.owner(token)

    def test_wrong_codes_are_limited_but_a_pairing_link_is_not_blocked(self):
        service = RemoteInstallService(apps=lambda: [])
        grant = service.begin_pairing()
        for _ in range(5):
            with self.assertRaises(ValueError):
                service.pair("not-it", "Phone", secrets.token_urlsafe(32))
        with self.assertRaisesRegex(ValueError, "too many"):
            service.pair("not-it", "Phone", secrets.token_urlsafe(32))
        pair(service, token=grant["pairingToken"])

    def test_authenticated_answers_carry_the_certificate_pins(self):
        service = RemoteInstallService(apps=lambda: [])
        service.pins = {"fingerprint": "a" * 64, "nextFingerprint": "b" * 64}
        token = pair(service, token=service.begin_pairing()["pairingToken"])
        result = service.remote({"op": "plugins", "token": token}, installed=[])
        self.assertEqual(result["fingerprint"], "a" * 64)
        self.assertEqual(result["nextFingerprint"], "b" * 64)


@unittest.skipUnless(importlib.util.find_spec("cryptography"), "requires requirements-remote.txt")
class RotationTests(unittest.TestCase):
    def test_identity_is_kept_announced_and_rotated_before_it_expires(self):
        with tempfile.TemporaryDirectory() as folder:
            store = RemoteInstallStore(Path(folder) / "remote-install.json")
            service = RemoteInstallService(apps=lambda: [], store=store)
            start = datetime.datetime.now(datetime.timezone.utc)
            _, _, first = transport.prepare_identity(service, start)
            self.assertNotIn("nextFingerprint", service.pins)

            restarted = RemoteInstallService(apps=lambda: [], store=store)
            self.assertEqual(transport.prepare_identity(restarted, start)[2], first)

            day7 = start + datetime.timedelta(days=7)
            self.assertEqual(transport.prepare_identity(restarted, day7)[2], first)
            upcoming = restarted.pins["nextFingerprint"]

            day12 = start + datetime.timedelta(days=12, hours=1)
            self.assertEqual(transport.prepare_identity(restarted, day12)[2], upcoming)
            self.assertNotEqual(upcoming, first)


if __name__ == "__main__":
    unittest.main()
