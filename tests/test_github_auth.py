import asyncio
import io
import json
import logging
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub import github_auth  # noqa: E402

TOKEN = "gho_" + "a" * 36


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def answer(payload):
    return Response(json.dumps(payload).encode())


class SignInTests(unittest.TestCase):
    def setUp(self):
        self.mixin = github_auth.GithubAuthMixin()
        self.sent = []
        self.replies = []
        self.patches = [
            patch.object(github_auth, "GITHUB_CLIENT_ID", "Iv1.testclient"),
            patch.object(github_auth.OPENER, "open", side_effect=self.open),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in self.patches:
            item.stop()

    def open(self, request, timeout=None):
        self.sent.append((request.full_url, request.data.decode(), request.get_method()))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return answer(reply)

    def start(self, **changes):
        self.replies.append(
            {
                "device_code": "secret-device-code",
                "user_code": "ABCD-1234",
                "verification_uri": "https://github.com/login/device",
                "expires_in": 900,
                "interval": 5,
            }
            | changes
        )
        return asyncio.run(self.mixin.start_github_sign_in())

    def poll(self, reply):
        self.replies.append(reply)
        return asyncio.run(self.mixin.poll_github_sign_in())

    def test_starting_shows_the_user_code_and_keeps_the_device_code_in_the_backend(self):
        result = self.start()
        self.assertEqual(
            result,
            {
                "userCode": "ABCD-1234",
                "verificationUri": "https://github.com/login/device",
                "expiresIn": 900,
                "interval": 5,
            },
        )
        self.assertNotIn("secret-device-code", json.dumps(result))
        url, body, method = self.sent[0]
        self.assertEqual((url, method), ("https://github.com/login/device/code", "POST"))
        # No scope is asked for: the token only reads public data.
        self.assertIn("client_id=Iv1.testclient", body)
        self.assertIn("scope=", body)
        self.assertNotIn("repo", body)

    def test_it_is_off_without_a_client_id(self):
        with patch.object(github_auth, "GITHUB_CLIENT_ID", ""), self.assertRaises(ValueError):
            asyncio.run(self.mixin.start_github_sign_in())
        self.assertEqual(self.sent, [])

    def test_an_odd_answer_from_github_is_refused(self):
        for label, change in {
            "not github's page": {"verification_uri": "https://evil.example/login/device"},
            "bad user code": {"user_code": "<script>"},
            "no device code": {"device_code": ""},
            "huge lifetime": {"expires_in": 10**9},
            "text interval": {"interval": "5"},
        }.items():
            with self.subTest(label), self.assertRaises(ValueError):
                self.start(**change)
        self.assertIsNone(self.mixin._device_flow)

    def test_polling_waits_slows_down_and_hands_over_the_token_once_approved(self):
        self.start()
        self.assertEqual(self.poll({"error": "authorization_pending"}), {"status": "pending", "interval": 5})
        slowed = self.poll({"error": "slow_down", "interval": 10})
        self.assertEqual(slowed, {"status": "pending", "interval": 10})
        self.assertEqual(self.poll({"error": "slow_down"})["interval"], 15)
        done = self.poll({"access_token": TOKEN, "token_type": "bearer", "scope": ""})
        self.assertEqual(done, {"status": "signed-in", "token": TOKEN})
        self.assertEqual(asyncio.run(self.mixin.poll_github_sign_in()), {"status": "none"})
        poll_body = self.sent[1][1]
        self.assertIn("device_code=secret-device-code", poll_body)
        self.assertIn("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code", poll_body)

    def test_declined_expired_and_unexpected_endings(self):
        self.start()
        self.assertEqual(self.poll({"error": "access_denied"}), {"status": "denied"})
        self.start()
        self.assertEqual(self.poll({"error": "expired_token"}), {"status": "expired"})
        self.start()
        with patch.object(github_auth.time, "monotonic", return_value=10**9):
            self.assertEqual(asyncio.run(self.mixin.poll_github_sign_in()), {"status": "expired"})
        self.start()
        with self.assertRaisesRegex(ValueError, "device flow"):
            self.poll({"error": "device_flow_disabled"})
        self.start()
        with self.assertRaises(ValueError):
            self.poll({"error": "incorrect_client_credentials"})
        self.assertIsNone(self.mixin._device_flow)

    def test_a_token_that_is_not_one_is_never_passed_on(self):
        for bad in ("not a token", 12, "", "gho_short"):
            self.start()
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.poll({"access_token": bad})
            self.assertIsNone(self.mixin._device_flow)

    def test_network_failures_say_so_and_the_token_is_never_logged(self):
        self.start()
        self.replies.append(URLError("no route"))
        with (
            self.assertLogs("decky-test", level="WARNING") as logs,
            self.assertRaisesRegex(ValueError, "Couldn't reach GitHub"),
        ):
            asyncio.run(self.mixin.poll_github_sign_in())
        self.assertNotIn("secret-device-code", " ".join(logs.output))
        with self.assertLogs("decky-test", level="INFO") as logs:
            self.poll({"access_token": TOKEN})
        self.assertNotIn(TOKEN, " ".join(logs.output))

    def test_cancelling_forgets_the_flow(self):
        self.start()
        asyncio.run(self.mixin.cancel_github_sign_in())
        self.assertEqual(asyncio.run(self.mixin.poll_github_sign_in()), {"status": "none"})
        self.assertEqual(len(self.sent), 1)


if __name__ == "__main__":
    unittest.main()
