import asyncio
import logging
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub.remote_install import RemoteInstallMixin
from deckyhub.settings import coerce_settings


def run_coro(coro):
    while True:
        try:
            coro.send(None)
        except StopIteration as e:
            return e.value


class DummyPlugin(RemoteInstallMixin):
    def __init__(self):
        self.settings = {"remoteInstall": False, "remoteInstallFeature": True}
        self.apps = [{"id": "plugin-test", "repo": "test/plugin"}]
        self._init_remote_install()

    def _save_settings(self):
        pass

    async def get_settings(self):
        return self.settings


class RemoteInstallMixinTests(unittest.TestCase):
    def setUp(self):
        self.plugin = DummyPlugin()

    def test_get_status_when_disabled(self):
        status = run_coro(self.plugin.get_remote_install_status())
        self.assertFalse(status["enabled"])
        self.assertFalse(status["active"])
        self.assertIsNone(status["address"])
        self.assertIsNone(status["fingerprint"])
        self.assertEqual(status["pairings"], [])
        self.assertEqual(status["devices"], [])
        self.assertEqual(status["requests"], [])

    def test_enable_and_disable_remote_install(self):
        mock_server = types.SimpleNamespace(close=MagicMock())

        async def fake_start(service):
            return mock_server, "https://192.168.1.100:8765/remote-install", "aabb" * 16

        with patch("deckyhub.remote_install.start_transport", side_effect=fake_start):
            # Enable
            status = run_coro(self.plugin.set_remote_install_enabled(True))
            self.assertTrue(status["enabled"])
            self.assertTrue(status["active"])
            self.assertEqual(status["address"], "https://192.168.1.100:8765/remote-install")
            self.assertEqual(status["fingerprint"], "aabb" * 16)
            self.assertIsNone(status["error"])

            # Disable
            status_off = run_coro(self.plugin.set_remote_install_enabled(False))
            self.assertFalse(status_off["enabled"])
            self.assertFalse(status_off["active"])
            mock_server.close.assert_called_once()

    def test_start_transport_failure_records_error_without_crashing(self):
        async def fake_fail(service):
            raise RuntimeError("QUIC failed")

        with patch("deckyhub.remote_install.start_transport", side_effect=fake_fail):
            status = run_coro(self.plugin.set_remote_install_enabled(True))
            self.assertTrue(status["enabled"])
            self.assertFalse(status["active"])
            self.assertEqual(status["error"], "QUIC failed")

    def test_invalid_enable_does_not_activate_listener(self):
        with self.assertRaises(ValueError):
            run_coro(self.plugin.set_remote_install_enabled("false"))
        self.assertFalse(self.plugin.settings["remoteInstall"])

    def test_feature_flag_blocks_listener_and_disabling_closes_it(self):
        server = types.SimpleNamespace(close=MagicMock())

        async def fake_start(service):
            return server, "https://example.test/remote-install", "fingerprint"

        with patch("deckyhub.remote_install.start_transport", side_effect=fake_start):
            run_coro(self.plugin.set_remote_install_enabled(True))
            run_coro(self.plugin.set_remote_install_feature_enabled(False))
            server.close.assert_called_once()
            self.assertFalse(self.plugin.settings["remoteInstall"])
            with self.assertRaises(ValueError):
                run_coro(self.plugin.set_remote_install_enabled(True))

    def test_address_change_rebinds_without_discarding_pairing_or_certificate(self):
        plugin = self.plugin
        plugin.settings.update(remoteInstall=True, remoteInstallFeature=True)
        service = plugin.remote_install_service
        service.transport_identity = object()
        identity = service.transport_identity
        old_server = types.SimpleNamespace(close=MagicMock())
        new_server = types.SimpleNamespace(close=MagicMock())
        plugin.remote_install_server = old_server
        plugin.remote_install_address = "https://192.168.1.100:8765/remote-install"

        async def fake_start(current_service):
            self.assertIs(current_service, service)
            self.assertIs(current_service.transport_identity, identity)
            return new_server, "https://192.168.1.101:8765/remote-install", "same-fingerprint"

        with (
            patch("deckyhub.remote_install.lan_address", return_value="192.168.1.101"),
            patch("deckyhub.remote_install.start_transport", side_effect=fake_start),
        ):
            run_coro(plugin._refresh_remote_address())
        old_server.close.assert_called_once()
        self.assertIs(plugin.remote_install_service, service)
        self.assertIs(plugin.remote_install_server, new_server)
        self.assertEqual(plugin.remote_install_fingerprint, "same-fingerprint")

    def test_disabled_feature_cannot_claim_request(self):
        self.plugin.settings.update(remoteInstall=True, remoteInstallFeature=False)
        with patch.object(self.plugin.remote_install_service, "claim") as claim:
            with self.assertRaisesRegex(ValueError, "Remote install is disabled"):
                run_coro(self.plugin.claim_remote_request("pending"))
        claim.assert_not_called()

    def test_invalid_persisted_values_do_not_enable_listener(self):
        for value in ("false", 1, None, [], {}):
            with self.subTest(value=value):
                self.assertFalse(coerce_settings({"remoteInstall": value})["remoteInstall"])
        self.assertTrue(coerce_settings({"remoteInstall": True})["remoteInstall"])

    def test_remote_install_feature_defaults_off_and_blocks_startup(self):
        self.assertFalse(coerce_settings({})["remoteInstallFeature"])
        for value in ("true", 1, None, [], {}):
            self.assertFalse(coerce_settings({"remoteInstallFeature": value})["remoteInstallFeature"])
        self.plugin.settings = coerce_settings({"remoteInstall": True})
        with patch("deckyhub.remote_install.start_transport") as start:
            run_coro(self.plugin._start_remote_transport())
            start.assert_not_called()
        self.assertIsNone(self.plugin.remote_install_server)

    def test_disable_during_start_closes_late_listener(self):
        async def scenario():
            starting = asyncio.Event()
            resume = asyncio.Event()
            server = types.SimpleNamespace(close=MagicMock())

            async def delayed_start(service):
                starting.set()
                await resume.wait()
                return server, "https://192.168.1.100:8765/remote-install", "aabb" * 16

            with patch("deckyhub.remote_install.start_transport", side_effect=delayed_start):
                enabling = asyncio.create_task(self.plugin.set_remote_install_enabled(True))
                await asyncio.wait_for(starting.wait(), 2)
                disabling = asyncio.create_task(self.plugin.set_remote_install_enabled(False))
                await asyncio.sleep(0)
                resume.set()
                await asyncio.gather(enabling, disabling)
                server.close.assert_called_once()
                self.assertIsNone(self.plugin.remote_install_server)
                self.assertFalse(self.plugin.settings["remoteInstall"])

        asyncio.run(scenario())

    def test_pairing_and_request_rpc_workflow(self):
        mock_server = types.SimpleNamespace(close=MagicMock())

        async def fake_start(service):
            return mock_server, "https://192.168.1.100:8765/remote-install", "aabb" * 16

        with patch("deckyhub.remote_install.start_transport", side_effect=fake_start):
            run_coro(self.plugin.set_remote_install_enabled(True))

            # Begin pairing
            pairing = run_coro(self.plugin.begin_remote_pairing())
            self.assertEqual(len(pairing["code"]), 6)

            # Status reflects pairing code
            status = run_coro(self.plugin.get_remote_install_status())
            self.assertEqual(status["pairingCode"], pairing["code"])

            # Device pairs remotely
            pair_res = self.plugin.remote_install_service.pair(pairing["code"], "TestBrowser", "a" * 43)
            pair_id = pair_res["pairingId"]

            # Visible in status pairings
            status_p = run_coro(self.plugin.get_remote_install_status())
            self.assertEqual(len(status_p["pairings"]), 1)
            self.assertEqual(status_p["pairings"][0]["id"], pair_id)

            # Approve pairing via RPC
            decide = run_coro(self.plugin.decide_remote_pairing(pair_id, True))
            self.assertEqual(decide["status"], "approved")

            # Device submits request remotely
            token = self.plugin.remote_install_service.pair_status(pair_id, "a" * 43)["token"]
            req_res = self.plugin.remote_install_service.remote(
                {
                    "op": "request",
                    "token": token,
                    "idempotencyKey": "k1",
                    "pluginId": "plugin-test",
                }
            )
            req_id = req_res["requestId"]

            # Visible in status requests
            status_req = run_coro(self.plugin.get_remote_install_status())
            self.assertEqual(len(status_req["requests"]), 1)
            self.assertEqual(status_req["requests"][0]["id"], req_id)

            # Approve request via RPC
            decide_req = run_coro(self.plugin.decide_remote_request(req_id, True))
            self.assertEqual(decide_req["status"], "approved")

            # Claim request
            claimed = run_coro(self.plugin.claim_remote_request(req_id))
            self.assertEqual(claimed["status"], "installing")

            # Finish request
            finished = run_coro(self.plugin.finish_remote_request(req_id, True))
            self.assertEqual(finished["status"], "installed")

            # Revoke device
            device_id = self.plugin.remote_install_service.owner(token)
            revoke = run_coro(self.plugin.revoke_remote_device(device_id))
            self.assertTrue(revoke["revoked"])


if __name__ == "__main__":
    unittest.main()
