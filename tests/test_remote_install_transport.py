import hashlib
import importlib.util
import sys
import types
import unittest
import unittest.mock
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub import remote_install_transport
from deckyhub.remote_install_service import RemoteInstallService


@unittest.skipUnless(importlib.util.find_spec("aioquic"), "requires requirements-remote.txt")
class RemoteInstallTransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_certificate_has_extensions_and_keeps_its_pin_across_address_changes(self):
        from cryptography import x509
        from cryptography.hazmat.primitives import serialization

        service = RemoteInstallService(apps=lambda: [])
        with (
            patch.object(remote_install_transport, "lan_address", side_effect=["192.168.1.20", "192.168.1.21"]),
            patch("aioquic.asyncio.serve") as serve,
        ):
            _, first_url, first_pin = await remote_install_transport.start_transport(service)
            _, second_url, second_pin = await remote_install_transport.start_transport(service)

        first, second = (call.kwargs["configuration"] for call in serve.await_args_list)
        names = first.certificate.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        self.assertEqual(names.get_values_for_type(x509.DNSName), ["deckyhub.local"])
        self.assertEqual(
            first_pin, hashlib.sha256(first.certificate.public_bytes(serialization.Encoding.DER)).hexdigest()
        )
        self.assertEqual(
            first.certificate.public_bytes(serialization.Encoding.DER),
            second.certificate.public_bytes(serialization.Encoding.DER),
        )
        self.assertEqual(first_pin, second_pin)
        self.assertEqual(first_url, "https://192.168.1.20:8765/remote-install")
        self.assertEqual(second_url, "https://192.168.1.21:8765/remote-install")


class ConnectionLogTests(unittest.TestCase):
    def test_a_log_line_goes_to_deckyhubs_logger_and_never_raises(self):
        logger = unittest.mock.MagicMock()
        with patch.dict(sys.modules, {"decky": types.SimpleNamespace(logger=logger)}):
            remote_install_transport._log("Remote Install: %s connected (%s)", "192.168.1.50", "h3")
        logger.info.assert_called_once_with("Remote Install: %s connected (%s)", "192.168.1.50", "h3")
        # No logger, or one that breaks: the listener carries on.
        with patch.dict(sys.modules, {"decky": types.SimpleNamespace()}):
            remote_install_transport._log("x")
        broken = unittest.mock.MagicMock()
        broken.info.side_effect = RuntimeError("disk full")
        with patch.dict(sys.modules, {"decky": types.SimpleNamespace(logger=broken)}):
            remote_install_transport._log("x")
