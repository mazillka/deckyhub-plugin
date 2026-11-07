import http.client
import json
import logging
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "py_modules"))
from deckyhub import registry

VALID = {
    "schemaVersion": 1,
    "apps": [
        {
            "id": "demo",
            "name": "Demo",
            "repo": "owner/demo",
            "category": "Test",
            "asset": {"include": [".zip"], "exclude": []},
        }
    ],
}


class FakeResponse:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self, size=-1):
        return self.body if size < 0 else self.body[:size]


class RemoteRegistryTests(unittest.TestCase):
    def test_rejects_non_https_url(self):
        with self.assertRaises(ValueError):
            registry.fetch_remote_registry("http://example.com/apps.json")

    def test_parses_remote_payload(self):
        body = json.dumps(VALID).encode("utf-8")
        with mock.patch.object(registry.OPENER, "open", return_value=FakeResponse(body)):
            apps, text = registry.fetch_remote_registry("https://example.com/apps.json")
        self.assertEqual([app["repo"] for app in apps], ["owner/demo"])
        self.assertEqual(json.loads(text), VALID)

    def test_known_issues_keep_only_titled_https_links(self):
        app = {
            **VALID["apps"][0],
            "knownIssues": [
                {"title": " Update stalls at 95% ", "url": "https://github.com/o/a/issues/1"},
                {"title": "no link", "url": "http://example.com"},
                {"title": "", "url": "https://example.com"},
                "junk",
            ],
        }
        apps = registry.parse_registry(
            {"schemaVersion": 1, "apps": [app, {**app, "id": "b", "repo": "o/b", "knownIssues": "junk"}]}
        )
        self.assertEqual(
            apps[0]["knownIssues"], [{"title": "Update stalls at 95%", "url": "https://github.com/o/a/issues/1"}]
        )
        # A malformed list leaves the plugin listed, without issues.
        self.assertEqual(apps[1]["knownIssues"], [])
        self.assertNotIn("knownIssues", registry.parse_registry(VALID)[0])

    def test_rejects_oversized_payload(self):
        body = b" " * (registry.MAX_REMOTE_REGISTRY_BYTES + 10)
        with mock.patch.object(registry.OPENER, "open", return_value=FakeResponse(body)):
            with self.assertRaises(ValueError):
                registry.fetch_remote_registry("https://example.com/apps.json")

    def test_invalid_payload_is_rejected(self):
        with mock.patch.object(registry.OPENER, "open", return_value=FakeResponse(b'{"schemaVersion": 2}')):
            with self.assertRaises(ValueError):
                registry.fetch_remote_registry("https://example.com/apps.json")

    def test_rejects_a_redirect_to_plain_http(self):
        # HttpsOnlyRedirects raises RuntimeError mid-open; the fetch reports it as a network error.
        refused = RuntimeError("Refused a redirect to a non-HTTPS URL: http://example.com/apps.json")
        with mock.patch.object(registry.OPENER, "open", side_effect=refused):
            with self.assertRaises(registry.URLError):
                registry.fetch_remote_registry("https://example.com/apps.json")

    def test_a_truncated_response_is_a_network_error(self):
        with mock.patch.object(registry.OPENER, "open", side_effect=http.client.IncompleteRead(b"{")):
            with self.assertRaises(ConnectionError):
                registry.fetch_remote_registry("https://example.com/apps.json")


if __name__ == "__main__":
    unittest.main()
