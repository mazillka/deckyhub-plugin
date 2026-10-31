import asyncio
import io
import json
import logging
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

sys.modules.setdefault("decky", types.SimpleNamespace(logger=logging.getLogger("decky-test")))
import main
from main import LATEST_REGISTRY_RELEASE_URL, PRERELEASE_REGISTRY_URL, REMOTE_REGISTRY_URL, newest_registry_release, parse_registry, validate_registry_url
from main import Plugin

ROOT = Path(__file__).resolve().parent.parent
CUSTOM_URL = "https://raw.githubusercontent.com/someone/their-registry/refs/heads/main/registry/apps.json"
OTHER_URL = "https://example.com/apps.json"


def payload(*repos: str) -> dict:
    return {
        "schemaVersion": 1,
        "apps": [
            {
                "id": repo,
                "name": repo,
                "repo": repo,
                "category": "Test",
                "asset": {"include": [".zip"], "exclude": []},
            }
            for repo in repos
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


def fake_fetch(responses: dict):
    """Stand in for fetch_remote_registry: map URL -> payload, Exception to raise, or a FakeResponse."""

    def fetch(url, *args, **kwargs):
        result = responses[url]
        if isinstance(result, Exception):
            raise result
        if isinstance(result, FakeResponse):
            return parse_registry(json.loads(result.body.decode("utf-8"))), result.body.decode("utf-8")
        return parse_registry(result), json.dumps(result)

    return fetch


# Where the stubbed release lookup says the newest pre-release's list is.
NEWEST_RELEASE_URL = "https://release.test/registry-2026.10.31-2-develop/apps.json"


class CustomRegistryTests(unittest.TestCase):
    def setUp(self):
        # Never ask GitHub's API from a test: the newest pre-release is a fixed link.
        stub = patch.object(main, "newest_registry_release", lambda prerelease: NEWEST_RELEASE_URL if prerelease else LATEST_REGISTRY_RELEASE_URL)
        stub.start()
        self.addCleanup(stub.stop)

    @staticmethod
    def _verified(message):
        """A verification error, with or without the OpenSSL verify_message set."""
        import ssl

        error = ssl.SSLCertVerificationError(message or "certificate verify failed")
        if message is not None:
            error.verify_message = message
        return error

    def plugin(self, home: str, registries: list[str] | None = None) -> Plugin:
        sys.modules["decky"].DECKY_PLUGIN_SETTINGS_DIR = home
        sys.modules["decky"].DECKY_PLUGIN_DIR = str(ROOT)
        plugin = Plugin()
        plugin.settings_path = Path(home) / "settings.json"
        plugin.settings = {**main._coerce_settings({}), "customRepos": [], "customRegistries": list(registries or []), "repoSettings": {}}
        # Persist, so _load_settings() sees the same state as the live object.
        plugin.settings_path.write_text(json.dumps(plugin.settings), encoding="utf-8")
        plugin.apps = []  # what _main would have loaded; tests that care set it
        return plugin

    @staticmethod
    def seed_cache(plugin: Plugin, url: str, data: dict) -> Path:
        cache = plugin._registry_cache_path(url)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(data), encoding="utf-8")
        return cache

    # validate_registry_url

    def test_rejects_non_https_and_non_json_urls(self):
        for url in ("http://example.com/apps.json", "ftp://example.com/a.json", "https://example.com/apps.txt", "https://example.com/", "not a url", ""):
            with self.assertRaises(ValueError):
                validate_registry_url(url)

    def test_accepts_and_trims_an_https_json_url(self):
        self.assertEqual(validate_registry_url(f"  {CUSTOM_URL}  "), CUSTOM_URL)

    def test_rejects_absurdly_long_urls(self):
        with self.assertRaises(ValueError):
            validate_registry_url("https://example.com/" + "a" * 4000 + ".json")

    # settings coercion

    def test_settings_keep_only_valid_unique_registries(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            plugin.settings_path.write_text(json.dumps({"customRegistries": [f" {CUSTOM_URL} ", CUSTOM_URL, "http://bad/a.json", "https://example.com/x.txt", OTHER_URL, 42]}), encoding="utf-8")
            self.assertEqual(plugin._load_settings()["customRegistries"], [CUSTOM_URL, OTHER_URL])

    def test_save_settings_keeps_registries(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            asyncio.run(plugin.save_settings({"language": "de"}))
            self.assertEqual(plugin._load_settings()["customRegistries"], [CUSTOM_URL])

    # registry channel

    def test_prerelease_registry_reads_develop_into_its_own_cache(self):
        self.assertEqual(main._coerce_settings({})["registryChannel"], "stable")
        self.assertEqual(main._coerce_settings({"registryChannel": "nightly"})["registryChannel"], "stable")
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            plugin.settings["registryChannel"] = "prerelease"
            responses = {PRERELEASE_REGISTRY_URL: payload("owner/testing"), REMOTE_REGISTRY_URL: payload("owner/stable")}
            with patch.object(main, "fetch_remote_registry", fake_fetch(responses)):
                self.assertEqual([app["repo"] for app in plugin._load_registry()], ["owner/testing"])
            # Switching back finds the stable list's cache untouched.
            self.assertNotEqual(plugin._registry_cache_path(PRERELEASE_REGISTRY_URL), plugin._registry_cache_path(REMOTE_REGISTRY_URL))
            self.assertFalse(plugin._registry_cache_path(REMOTE_REGISTRY_URL).exists())

    def test_prerelease_registry_falls_back_to_stable_when_develop_cant_be_read(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            plugin.settings["registryChannel"] = "prerelease"
            responses = {PRERELEASE_REGISTRY_URL: URLError("404"), REMOTE_REGISTRY_URL: payload("owner/stable")}
            with patch.object(main, "fetch_remote_registry", fake_fetch(responses)):
                self.assertEqual([app["repo"] for app in plugin._load_registry()], ["owner/stable"])

    def test_changing_the_registry_channel_reloads_the_list(self):
        events = []

        async def emit(event, *args):
            events.append(event)

        with tempfile.TemporaryDirectory() as home, patch.object(sys.modules["decky"], "emit", emit, create=True):
            plugin = self.plugin(home)
            plugin.apps = parse_registry(payload("owner/stable"))
            responses = {PRERELEASE_REGISTRY_URL: payload("owner/testing"), REMOTE_REGISTRY_URL: payload("owner/stable")}

            async def switch(settings):
                await plugin.save_settings(settings)
                await getattr(plugin, "registry_task", asyncio.sleep(0))

            with patch.object(main, "fetch_remote_registry", fake_fetch(responses)):
                asyncio.run(switch({**plugin.settings, "language": "de"}))
                self.assertEqual(events, [])
                asyncio.run(switch({**plugin.settings, "registryChannel": "prerelease"}))
            self.assertEqual([app["repo"] for app in plugin.apps], ["owner/testing"])
            self.assertEqual(events, ["registry_updated"])

    # registry releases

    def test_official_registry_reads_its_release_first_into_the_same_cache(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            responses = {LATEST_REGISTRY_RELEASE_URL: payload("owner/released"), REMOTE_REGISTRY_URL: payload("owner/branch")}
            with patch.object(main, "fetch_remote_registry", fake_fetch(responses)):
                self.assertEqual([app["repo"] for app in plugin._load_registry()], ["owner/released"])
            # Same file as before, so an update keeps the cached list and older releases' name.
            cached = json.loads(plugin._registry_cache_path(REMOTE_REGISTRY_URL).read_text(encoding="utf-8"))
            self.assertEqual(cached, payload("owner/released"))

    def test_official_registry_falls_back_to_its_branch_when_the_release_fails(self):
        for failure in (URLError("404"), ValueError("Unsupported registry format"), payload()):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as home:
                plugin = self.plugin(home)
                plugin.settings["registryChannel"] = "prerelease"
                responses = {NEWEST_RELEASE_URL: failure, PRERELEASE_REGISTRY_URL: payload("owner/testing")}
                with patch.object(main, "fetch_remote_registry", fake_fetch(responses)):
                    self.assertEqual([app["repo"] for app in plugin._load_registry()], ["owner/testing"])

    def test_prerelease_takes_the_newest_release_of_all(self):
        def release(tag, published, *, prerelease=False, draft=False, asset="apps.json"):
            return {"tag_name": tag, "published_at": published, "prerelease": prerelease, "draft": draft,
                    "assets": [{"name": asset, "browser_download_url": f"https://github.com/r/releases/download/{tag}/{asset}"}]}

        def newest(releases):
            class Response(io.BytesIO):
                def __enter__(self):
                    return self

                def __exit__(self, *args):
                    self.close()

            with patch.object(main._OPENER, "open", lambda request, timeout: Response(json.dumps(releases).encode())):
                return newest_registry_release(True)

        # Not trusting the API's order; a newer stable one wins; drafts and other files are skipped.
        self.assertEqual(newest([release("a-develop", "2026-10-01T00:00:00Z", prerelease=True), release("b-develop", "2026-10-03T00:00:00Z", prerelease=True), release("c", "2026-10-02T00:00:00Z")]),
                         "https://github.com/r/releases/download/b-develop/apps.json")
        self.assertEqual(newest([release("a-develop", "2026-10-01T00:00:00Z", prerelease=True), release("c", "2026-10-02T00:00:00Z")]),
                         "https://github.com/r/releases/download/c/apps.json")
        self.assertEqual(newest([release("d", "2026-10-05T00:00:00Z", draft=True), release("e", "2026-10-04T00:00:00Z", asset="notes.txt"), release("c", "2026-10-02T00:00:00Z")]),
                         "https://github.com/r/releases/download/c/apps.json")
        self.assertIsNone(newest([]))
        # Stable never asks the API.
        self.assertEqual(newest_registry_release(False), LATEST_REGISTRY_RELEASE_URL)

    def test_custom_registries_have_no_release_to_try(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            self.seed_cache(plugin, REMOTE_REGISTRY_URL, payload("owner/official"))
            calls = []
            fetch = fake_fetch({CUSTOM_URL: payload("owner/custom")})

            def counting(url, *args, **kwargs):
                calls.append(url)
                return fetch(url)

            plugin.settings["customRegistries"] = [CUSTOM_URL]
            with patch.object(main, "fetch_remote_registry", counting):
                plugin._fetch_registry(CUSTOM_URL)
            self.assertEqual(calls, [CUSTOM_URL])

    # add / remove

    def test_add_verifies_the_registry_then_persists_and_reloads(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            self.seed_cache(plugin, REMOTE_REGISTRY_URL, payload("owner/official"))
            with patch.object(main, "fetch_remote_registry", fake_fetch({CUSTOM_URL: payload("owner/custom")})):
                result = asyncio.run(plugin.add_custom_registry(CUSTOM_URL))
            self.assertEqual((result["added"], result["apps"]), (True, 1))
            self.assertEqual([app["repo"] for app in plugin.apps], ["owner/official", "owner/custom"])
            self.assertEqual(plugin._load_settings()["customRegistries"], [CUSTOM_URL])

    def test_add_maps_tls_failures_to_ssl_error(self):
        from urllib.error import URLError
        import ssl

        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            # urlopen wraps the real cause in URLError.reason, so that path must unwrap.
            # verify_message is what makes the log actionable - "certificate has expired"
            # means the system clock, "self signed" means a proxy or missing CA bundle.
            cases = {
                URLError(self._verified("certificate has expired")): "certificate has expired",
                URLError(self._verified("self signed certificate")): "self signed certificate",
                URLError(self._verified(None)): "certificate could not be verified",
                URLError(ssl.SSLError("wrong version number")): "certificate could not be verified",
            }
            for error, detail in cases.items():
                with self.subTest(detail=detail):
                    with patch.object(main, "fetch_remote_registry", fake_fetch({CUSTOM_URL: error})):
                        result = asyncio.run(plugin.add_custom_registry(CUSTOM_URL))
                    self.assertEqual((result["added"], result["reason"], result["detail"]), (False, "ssl-error", detail))

    def test_add_downloads_the_new_registry_only_once(self):
        # Adding used to fetch to validate, discard the payload, then re-download it
        # during the reload - two requests, and a flaky second one lost the registry.
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            self.seed_cache(plugin, REMOTE_REGISTRY_URL, payload())
            calls = []

            def counting(url, *args, **kwargs):
                calls.append(url)
                return parse_registry(payload("owner/custom")), json.dumps(payload("owner/custom"))

            with patch.object(main, "fetch_remote_registry", counting):
                result = asyncio.run(plugin.add_custom_registry(CUSTOM_URL))
            self.assertTrue(result["added"])
            self.assertEqual(calls.count(CUSTOM_URL), 1)
            # The other sources reload from their caches: adding costs one request.
            self.assertEqual(calls, [CUSTOM_URL])
            # And the payload we already had is cached, so an offline restart still works.
            self.assertEqual(json.loads(plugin._registry_cache_path(CUSTOM_URL).read_text(encoding="utf-8")), payload("owner/custom"))
            self.assertEqual([app["repo"] for app in plugin.apps], ["owner/custom"])

    def test_add_reports_an_unloadable_url_without_raising(self):
        # A mistyped URL is ordinary user error: it must never reach the frontend
        # as a Python exception, or Decky wraps it as "PythonException: ...".
        cases = {URLError("no route to host"): "unreachable", ValueError("Unsupported registry format"): "not-registry"}
        for error, reason in cases.items():
            with self.subTest(reason=reason), tempfile.TemporaryDirectory() as home:
                plugin = self.plugin(home)
                with patch.object(main, "fetch_remote_registry", fake_fetch({CUSTOM_URL: error})):
                    result = asyncio.run(plugin.add_custom_registry(CUSTOM_URL))
                self.assertEqual((result["added"], result["reason"]), (False, reason))
                self.assertEqual(plugin._load_settings()["customRegistries"], [])

    def test_add_maps_a_404_to_not_found(self):
        from urllib.error import HTTPError

        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            missing = HTTPError(CUSTOM_URL, 404, "Not Found", {}, None)
            with patch.object(main, "fetch_remote_registry", fake_fetch({CUSTOM_URL: missing})):
                result = asyncio.run(plugin.add_custom_registry(CUSTOM_URL))
            self.assertEqual((result["added"], result["reason"], result["detail"]), (False, "not-found", "HTTP 404"))

    def test_add_maps_a_server_error_to_unreachable(self):
        from urllib.error import HTTPError

        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            broken = HTTPError(CUSTOM_URL, 503, "Service Unavailable", {}, None)
            with patch.object(main, "fetch_remote_registry", fake_fetch({CUSTOM_URL: broken})):
                result = asyncio.run(plugin.add_custom_registry(CUSTOM_URL))
            self.assertEqual((result["added"], result["reason"]), (False, "unreachable"))

    def test_add_reports_an_unusable_url_shape_without_raising(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            for url in ("http://example.com/apps.json", "https://example.com/apps.txt"):
                result = asyncio.run(plugin.add_custom_registry(url))
                self.assertEqual((result["added"], result["reason"]), (False, "invalid-url"))
            self.assertEqual(plugin._load_settings()["customRegistries"], [])

    def test_add_ignores_a_repeat(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            self.assertEqual(asyncio.run(plugin.add_custom_registry(CUSTOM_URL))["reason"], "already-added")
            self.assertEqual(plugin._load_settings()["customRegistries"], [CUSTOM_URL])

    def test_add_refuses_the_official_list_as_nothing_new(self):
        # Any spelling of the official URL lists only what's already shown.
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            plugin.apps = parse_registry(payload("owner/official"))
            url = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/HEAD/registry/apps.json"
            with patch.object(main, "fetch_remote_registry", fake_fetch({url: payload("owner/official")})):
                self.assertEqual(asyncio.run(plugin.add_custom_registry(url))["reason"], "nothing-new")

    def test_add_stops_at_the_registr_cap(self):
        with tempfile.TemporaryDirectory() as home, patch.object(main, "MAX_CUSTOM_REGISTRIES", 1):
            plugin = self.plugin(home, [CUSTOM_URL])
            result = asyncio.run(plugin.add_custom_registry(OTHER_URL))
            self.assertEqual((result["added"], result["reason"], result["detail"]), (False, "too-many", "1"))
            self.assertEqual(plugin._load_settings()["customRegistries"], [CUSTOM_URL])

    def test_remove_drops_the_url_and_reloads(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            self.seed_cache(plugin, REMOTE_REGISTRY_URL, payload("owner/official"))
            custom_cache = self.seed_cache(plugin, CUSTOM_URL, payload("owner/custom"))
            # No fetch is patched: removing must not touch the network.
            with patch.object(main, "fetch_remote_registry", fake_fetch({})):
                self.assertTrue(asyncio.run(plugin.remove_custom_registry(CUSTOM_URL))["removed"])
            self.assertEqual([app["repo"] for app in plugin.apps], ["owner/official"])
            self.assertFalse(custom_cache.exists())
            self.assertEqual(plugin._load_settings()["customRegistries"], [])
            self.assertFalse(asyncio.run(plugin.remove_custom_registry(CUSTOM_URL))["removed"])

    # merging and fallbacks

    def test_official_entries_win_over_a_custom_duplicate(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            responses = {
                REMOTE_REGISTRY_URL: payload("owner/shared", "owner/official"),
                CUSTOM_URL: payload("owner/shared", "owner/custom"),
            }
            with patch.object(main, "fetch_remote_registry", fake_fetch(responses)):
                apps = plugin._load_registry()
            self.assertEqual([app["repo"] for app in apps], ["owner/shared", "owner/official", "owner/custom"])

    def test_each_registry_gets_its_own_cache_file(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            official = plugin._registry_cache_path(REMOTE_REGISTRY_URL)
            first = plugin._registry_cache_path(CUSTOM_URL)
            second = plugin._registry_cache_path(OTHER_URL)
            self.assertEqual(official.name, "registry-cache.json")
            self.assertEqual(len({official, first, second}), 3)
            self.assertEqual(first, plugin._registry_cache_path(CUSTOM_URL))

    def test_offline_registry_falls_back_to_its_own_cache(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            cache = plugin._registry_cache_path(CUSTOM_URL)
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(payload("owner/cached")), encoding="utf-8")
            # The official registry has no cache here, so it contributes nothing;
            # the point is that the custom registry still contributes its own.
            with patch.object(main, "fetch_remote_registry", fake_fetch({REMOTE_REGISTRY_URL: URLError("offline"), CUSTOM_URL: URLError("offline")})):
                apps = plugin._load_registry()
            self.assertEqual([app["repo"] for app in apps], ["owner/cached"])

    def test_a_broken_custom_registry_is_skipped_not_fatal(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            with patch.object(main, "fetch_remote_registry", fake_fetch({REMOTE_REGISTRY_URL: payload("owner/official"), CUSTOM_URL: URLError("gone")})):
                self.assertEqual([app["repo"] for app in plugin._load_registry()], ["owner/official"])

    def test_successful_fetch_is_cached_for_next_time(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            responses = {REMOTE_REGISTRY_URL: payload("owner/official"), CUSTOM_URL: payload("owner/custom")}
            with patch.object(main, "fetch_remote_registry", fake_fetch(responses)):
                plugin._load_registry()
            self.assertEqual(json.loads(plugin._registry_cache_path(CUSTOM_URL).read_text(encoding="utf-8")), payload("owner/custom"))
            with patch.object(main, "fetch_remote_registry", fake_fetch({REMOTE_REGISTRY_URL: URLError("offline"), CUSTOM_URL: URLError("offline")})):
                self.assertEqual([app["repo"] for app in plugin._load_registry()], ["owner/official", "owner/custom"])

    def test_an_empty_official_registry_keeps_the_last_good_cache(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            cache = self.seed_cache(plugin, REMOTE_REGISTRY_URL, payload("owner/official"))
            with patch.object(main, "fetch_remote_registry", fake_fetch({REMOTE_REGISTRY_URL: payload()})):
                self.assertEqual([app["repo"] for app in plugin._load_registry()], ["owner/official"])
            self.assertEqual(json.loads(cache.read_text(encoding="utf-8")), payload("owner/official"))

    def test_malformed_entries_are_dropped_not_fatal(self):
        good = payload("owner/good")["apps"][0]
        bad = [
            "not a dict",
            {**good, "repo": ["owner/list"]},
            {**good, "repo": "../.."},
            {**good, "repo": "owner/name/releases"},
            {**good, "name": {}},
            {**good, "id": 7},
            {**good, "description": ["x"]},
            {**good, "asset": "zip"},
            {**good, "asset": {"include": [1], "exclude": []}},
            {**good, "detect": "decky-plugin"},
            {**good, "detect": {"type": "decky-plugin", "names": [1]}},
        ]
        self.assertEqual([app["repo"] for app in parse_registry({"schemaVersion": 1, "apps": [*bad, good]})], ["owner/good"])

    def test_a_newer_schema_falls_back_to_the_cache(self):
        # Old installs read main's registry too: a breaking format change must bump
        # schemaVersion, which they reject, keeping their last good list.
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            self.seed_cache(plugin, REMOTE_REGISTRY_URL, payload("owner/official"))
            newer = FakeResponse(json.dumps({**payload("owner/new"), "schemaVersion": 2}).encode("utf-8"))
            with patch.object(main, "fetch_remote_registry", fake_fetch({REMOTE_REGISTRY_URL: newer})):
                self.assertEqual([app["repo"] for app in plugin._load_registry()], ["owner/official"])

    def test_a_registry_removed_during_refresh_does_not_come_back(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            fetch = fake_fetch({REMOTE_REGISTRY_URL: payload("owner/official"), CUSTOM_URL: payload("owner/custom")})

            def removed_mid_download(url, *args, **kwargs):
                if url == CUSTOM_URL:
                    plugin.settings["customRegistries"].remove(CUSTOM_URL)
                return fetch(url, *args, **kwargs)

            with patch.object(main, "fetch_remote_registry", removed_mid_download):
                asyncio.run(plugin.refresh_registry())
            self.assertEqual([app["repo"] for app in plugin.apps], ["owner/official"])
            self.assertFalse(plugin._registry_cache_path(CUSTOM_URL).exists())

    def test_a_custom_entry_cannot_reuse_an_official_id(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            clash = payload("owner/other", "owner/custom")
            clash["apps"][0]["id"] = "owner/official"
            responses = {REMOTE_REGISTRY_URL: payload("owner/official"), CUSTOM_URL: clash}
            with patch.object(main, "fetch_remote_registry", fake_fetch(responses)):
                self.assertEqual([app["repo"] for app in plugin._load_registry()], ["owner/official", "owner/custom"])

    def test_a_custom_entry_cannot_claim_a_taken_detect_name(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            official = payload("owner/official")
            official["apps"][0]["detect"] = {"type": "decky-plugin", "names": ["CSS Loader"]}
            clash = payload("attacker/one", "attacker/two", "owner/custom")
            clash["apps"][0]["detect"] = {"type": "decky-plugin", "names": ["css loader"]}
            clash["apps"][1]["detect"] = {"type": "decky-plugin", "names": ["DeckyHub"]}
            responses = {REMOTE_REGISTRY_URL: official, CUSTOM_URL: clash}
            with patch.object(main, "fetch_remote_registry", fake_fetch(responses)):
                self.assertEqual([app["repo"] for app in plugin._load_registry()], ["owner/official", "owner/custom"])

    def test_two_adds_racing_save_the_registry_once(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            self.seed_cache(plugin, REMOTE_REGISTRY_URL, payload("owner/official"))
            fetch = fake_fetch({CUSTOM_URL: payload("owner/custom")})

            async def both():
                return await asyncio.gather(plugin.add_custom_registry(CUSTOM_URL), plugin.add_custom_registry(CUSTOM_URL))

            with patch.object(main, "fetch_remote_registry", fetch):
                results = asyncio.run(both())
            self.assertEqual(sorted(result["added"] for result in results), [False, True])
            self.assertEqual(plugin.settings["customRegistries"], [CUSTOM_URL])

    def test_repository_names_reject_dot_only_parts(self):
        for repo in ("../..", "owner/..", "./x", "a/b/c", "a"):
            self.assertIsNone(main.REPOSITORY_NAME.fullmatch(repo), repo)
        for repo in ("owner/name", "o.w-n_er/na.me", "..a/b.."):
            self.assertIsNotNone(main.REPOSITORY_NAME.fullmatch(repo), repo)

    def test_add_reports_only_the_apps_it_contributed(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            self.seed_cache(plugin, REMOTE_REGISTRY_URL, payload("owner/official"))
            with patch.object(main, "fetch_remote_registry", fake_fetch({CUSTOM_URL: payload("owner/official", "owner/new")})):
                result = asyncio.run(plugin.add_custom_registry(CUSTOM_URL))
            self.assertEqual((result["added"], result["apps"]), (True, 1))

    def test_add_refuses_a_registry_that_adds_nothing_new(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            plugin.apps = parse_registry(payload("owner/official"))
            for data in (payload("owner/official"), payload()):
                with self.subTest(apps=len(data["apps"])), patch.object(main, "fetch_remote_registry", fake_fetch({CUSTOM_URL: data})):
                    result = asyncio.run(plugin.add_custom_registry(CUSTOM_URL))
                    self.assertEqual((result["added"], result["reason"]), (False, "nothing-new"))
            self.assertEqual(plugin._load_settings()["customRegistries"], [])

    def test_background_refresh_tells_the_frontend_only_on_a_change(self):
        events = []

        async def emit(event, *args):
            events.append(event)

        with tempfile.TemporaryDirectory() as home, patch.object(main.decky, "emit", emit, create=True):
            plugin = self.plugin(home)
            plugin.apps = parse_registry(payload("owner/official"))
            with patch.object(main, "fetch_remote_registry", fake_fetch({REMOTE_REGISTRY_URL: payload("owner/official")})):
                asyncio.run(plugin._refresh_registry_in_background())
            self.assertEqual(events, [])
            with patch.object(main, "fetch_remote_registry", fake_fetch({REMOTE_REGISTRY_URL: payload("owner/official", "owner/new")})):
                asyncio.run(plugin._refresh_registry_in_background())
            self.assertEqual(events, ["registry_updated"])

    def test_cache_writes_leave_no_temp_files(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home, [CUSTOM_URL])
            with patch.object(main, "fetch_remote_registry", fake_fetch({REMOTE_REGISTRY_URL: payload("owner/official"), CUSTOM_URL: payload("owner/custom")})):
                plugin._load_registry()
            self.assertEqual(list(Path(home).rglob("*.tmp")), [])
            self.assertEqual(json.loads(plugin._registry_cache_path(CUSTOM_URL).read_text(encoding="utf-8")), payload("owner/custom"))

    def test_offline_without_a_cache_lists_nothing(self):
        with tempfile.TemporaryDirectory() as home:
            plugin = self.plugin(home)
            offline = {REMOTE_REGISTRY_URL: URLError("offline")}
            with patch.object(main, "fetch_remote_registry", fake_fetch(offline)):
                self.assertEqual(plugin._load_registry(), [])
                self.assertEqual(asyncio.run(plugin.refresh_registry())["apps"], 0)


if __name__ == "__main__":
    unittest.main()
