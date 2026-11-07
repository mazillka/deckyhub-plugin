"""The plugin list: the official registry and user-added ones, fetched, validated and cached."""

import asyncio
import hashlib
import json
import os
import ssl
import threading
from http.client import HTTPException
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request

import decky

from .net import OPENER
from .validation import REPOSITORY_NAME, validate_registry_url

# DeckyHub's plugin list lives in its own repository.
REMOTE_REGISTRY_URL = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/refs/heads/main/registry/apps.json"
# The registry's develop branch: changes being tested before they reach main, for the
# Registry: Pre-release setting.
PRERELEASE_REGISTRY_URL = (
    "https://raw.githubusercontent.com/mazillka/deckyhub-registry/refs/heads/develop/registry/apps.json"
)
# The same list published as a file on the registry's GitHub releases, read first. Like
# DeckyHub's own channels: Stable takes the newest stable release (GitHub's "latest"
# link, no API call), Pre-release the newest release of all, stable ones included. The
# branch files above stay the fallback, and all that older releases read, so the
# registry keeps updating them.
LATEST_REGISTRY_RELEASE_URL = "https://github.com/mazillka/deckyhub-registry/releases/latest/download/apps.json"
REGISTRY_RELEASES_API_URL = "https://api.github.com/repos/mazillka/deckyhub-registry/releases?per_page=10"
# A cap so a broken or hostile registry can't exhaust memory. Releases up to 3.0.0 used
# 512 KB and keep it, so the official registry still stays under that (its test_docs.py).
MAX_REMOTE_REGISTRY_BYTES = 4 * 1024 * 1024
# How many user-added registries one install will track, so a bad list can't
# turn startup into an unbounded sequence of network fetches.
MAX_CUSTOM_REGISTRIES = 10

REQUIRED_FIELDS = {"id", "name", "repo", "category", "asset"}
STRING_FIELDS = ("id", "name", "repo", "category")
OPTIONAL_STRING_FIELDS = ("description", "releaseTagInclude")


def _string_list(value: object) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _valid_app(app: object) -> bool:
    # The frontend renders and lowercases these fields as-is, so a wrong type in
    # one entry would otherwise break the page for every app.
    if not isinstance(app, dict) or not REQUIRED_FIELDS <= app.keys():
        return False
    if not all(isinstance(app[key], str) for key in STRING_FIELDS):
        return False
    if not all(isinstance(app.get(key, ""), str) for key in OPTIONAL_STRING_FIELDS):
        return False
    if not REPOSITORY_NAME.fullmatch(app["repo"]):
        return False
    asset = app["asset"]
    if not isinstance(asset, dict) or not _string_list(asset.get("include")) or not _string_list(asset.get("exclude")):
        return False
    detect = app.get("detect", {})
    if not isinstance(detect, dict):
        return False
    return _string_list(detect.get("names", []))


def detect_names(app: dict) -> set[str]:
    """Installed plugins are matched by these names, and the match decides which plugin
    an Install/Update replaces - so a later source may not claim one an earlier source
    already did, nor DeckyHub's own (see _load_registry)."""
    return {name.casefold() for name in app.get("detect", {}).get("names", [])}


def known_issues(value: object) -> list[dict]:
    """An entry's knownIssues, known problems with the plugin itself, shown in its
    Manage window: each a {title, url} with an HTTPS link. A malformed one is dropped,
    not the whole entry."""
    if not isinstance(value, list):
        return []
    return [
        {"title": issue["title"].strip()[:200], "url": issue["url"]}
        for issue in value[:10]
        if isinstance(issue, dict)
        and isinstance(issue.get("title"), str)
        and issue["title"].strip()
        and isinstance(issue.get("url"), str)
        and issue["url"].startswith("https://")
    ]


def parse_registry(payload: object) -> list[dict]:
    """Validate the portable registry format and ignore malformed records."""
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1 or not isinstance(payload.get("apps"), list):
        raise ValueError("Unsupported registry format")
    return [
        {**app, "knownIssues": known_issues(app["knownIssues"])} if "knownIssues" in app else app
        for app in payload["apps"]
        if _valid_app(app)
    ]


def fetch_remote_registry(url: str) -> tuple[list[dict], str]:
    """Download the registry over HTTPS. Returns (apps, raw_text); raises on any failure."""
    if not url.startswith("https://"):
        raise ValueError("Registry URL must use HTTPS")
    request = Request(url, headers={"User-Agent": "DeckyHub"})
    try:
        with OPENER.open(request, timeout=10) as response:
            raw = response.read(MAX_REMOTE_REGISTRY_BYTES + 1)
    except RuntimeError as error:
        # HttpsOnlyRedirects refused a redirect off HTTPS. A URLError (not ValueError),
        # so the UI says "couldn't reach" rather than "not a registry".
        raise URLError(str(error)) from error
    except HTTPException as error:
        # IncompleteRead and friends aren't OSError; report them as the network errors they are.
        raise ConnectionError(f"{type(error).__name__}: {error}") from error
    if len(raw) > MAX_REMOTE_REGISTRY_BYTES:
        raise ValueError("Remote registry is too large")
    text = raw.decode("utf-8")
    return parse_registry(json.loads(text)), text


def newest_registry_release(prerelease: bool) -> str | None:
    """The `apps.json` link of the channel's newest registry release, if there is one."""
    if not prerelease:
        return LATEST_REGISTRY_RELEASE_URL
    # GitHub's "latest" skips pre-releases, so this asks the API (60 calls an hour per
    # address without a token; one per registry refresh).
    request = Request(
        REGISTRY_RELEASES_API_URL, headers={"User-Agent": "DeckyHub", "Accept": "application/vnd.github+json"}
    )
    with OPENER.open(request, timeout=10) as response:
        releases = json.loads(response.read(MAX_REMOTE_REGISTRY_BYTES))
    published = [release for release in releases if isinstance(release, dict) and not release.get("draft")]
    for release in sorted(published, key=lambda release: str(release.get("published_at") or ""), reverse=True):
        for asset in release.get("assets") or []:
            url = isinstance(asset, dict) and asset.get("name") == "apps.json" and asset.get("browser_download_url")
            if isinstance(url, str) and url.startswith("https://"):
                return url
    return None


def fetch_official_registry(url: str) -> tuple[list[dict], str]:
    """The official list from its channel's newest release, else from its branch (`url`)."""
    try:
        release = newest_registry_release(url == PRERELEASE_REGISTRY_URL)
        if release:
            apps, text = fetch_remote_registry(release)
            # An empty list is a broken publish; the branch may still have a good one.
            if apps:
                return apps, text
    except Exception as error:
        decky.logger.info("Registry release unavailable (%s); reading %s", error, url)
    return fetch_remote_registry(url)


# A user mistyping a registry URL is ordinary, not exceptional: add_custom_registry
# reports these as a reason code for the UI to translate instead of raising, so a
# Python exception never reaches the frontend. See CONTRIBUTING.md's error pattern
# on download_asset, which returns {"error": ...} for the same reason.
def registry_failure_reason(error: Exception) -> tuple[str, str]:
    if isinstance(error, HTTPError):
        return ("not-found", f"HTTP {error.code}") if error.code == 404 else ("unreachable", f"HTTP {error.code}")
    # urlopen wraps the real cause in URLError.reason, so unwrap before looking for TLS.
    cause = getattr(error, "reason", None) or error
    if isinstance(cause, ssl.SSLError):
        # verify_message is what makes this actionable when OpenSSL sets it: "certificate
        # has expired" points at the system clock, "self signed certificate" at a proxy or
        # a missing CA bundle. It isn't present on every verification error, so fall back.
        detail = getattr(cause, "verify_message", "") or "certificate could not be verified"
        return ("ssl-error", detail)
    if isinstance(error, ValueError):
        return ("not-registry", str(error))
    return ("unreachable", str(error))


class RegistryMixin:
    async def _refresh_registry_in_background(self):
        try:
            before = self.apps
            await self.refresh_registry()
            # Pages already open loaded the cached list; tell them to reload (index.tsx),
            # but only on a real change - the reload resets their page and every card.
            if self.apps != before:
                await decky.emit("registry_updated")
        except Exception as error:
            decky.logger.error("Background registry refresh failed: %s", error)

    def _load_registry(
        self, prefetched: tuple[str, tuple[list[dict], str]] | None = None, network: bool = True
    ) -> list[dict]:
        """Official registry first (GitHub -> cached copy), then any user-added ones.

        `prefetched` is a (url, payload) already downloaded this call, so adding a
        registry reuses the fetch that validated it instead of asking for it twice.
        `network=False` skips the downloads and reads only the caches.
        """

        def given(url):
            return prefetched[1] if prefetched and prefetched[0] == url else None

        official = self.official_registry_url()
        apps = self._fetch_registry(official, official=True, prefetched=given(official), network=network)
        if not apps and official != REMOTE_REGISTRY_URL:
            # The pre-release list is unreachable and never cached: the stable one beats none.
            apps = self._fetch_registry(
                REMOTE_REGISTRY_URL, official=True, prefetched=given(REMOTE_REGISTRY_URL), network=network
            )
        # First source wins: a user-added registry can add apps but never override
        # the detect rules or asset filters of an entry from the official registry,
        # nor reuse its id (the frontend matches cards by id), nor claim its detect
        # names (an Update would install this repo's release over that plugin).
        # Marked official: only these have a page on deckyhub.com (the frontend links to it).
        apps = [{**app, "official": True} for app in apps]
        seen = {app["repo"].casefold() for app in apps}
        seen_ids = {app["id"] for app in apps}
        seen_names = {"deckyhub"}.union(*map(detect_names, apps))
        # A copy: add/remove can change the list while this runs in a worker thread.
        for url in list(self.settings.get("customRegistries", [])):
            for app in self._fetch_registry(url, prefetched=given(url), network=network):
                names = detect_names(app)
                if app["repo"].casefold() not in seen and app["id"] not in seen_ids and not names & seen_names:
                    seen.add(app["repo"].casefold())
                    seen_ids.add(app["id"])
                    seen_names |= names
                    apps.append(app)
        return apps

    def official_registry_url(self) -> str:
        return (
            PRERELEASE_REGISTRY_URL
            if getattr(self, "settings", {}).get("registryChannel") == "prerelease"
            else REMOTE_REGISTRY_URL
        )

    def _fetch_registry(
        self, url: str, official: bool = False, prefetched: tuple[list[dict], str] | None = None, network: bool = True
    ) -> list[dict]:
        """One registry source: fetch it, cache it, else fall back to the cache (none: no apps)."""
        cache_path = self._registry_cache_path(url)
        if prefetched is not None:
            apps, text = prefetched
            self._cache_registry(cache_path, text, url)
            return apps
        if network:
            try:
                apps, text = fetch_official_registry(url) if official else fetch_remote_registry(url)
                # An empty official list is a broken publish, not "no apps": keep the
                # last good cache rather than overwrite it.
                if official and not apps:
                    raise ValueError("Registry has no usable apps")
            except (OSError, ValueError) as error:
                decky.logger.warning("Registry %s unavailable (%s); trying cached copy", url, error)
            else:
                # Removed while this download was in flight: don't recreate its cache.
                if official or url in self.settings.get("customRegistries", []):
                    self._cache_registry(cache_path, text, url)
                decky.logger.info("Loaded %d repositories from %s", len(apps), url)
                return apps
        try:
            return parse_registry(json.loads(cache_path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            decky.logger.warning("No cached copy of %s", url)
        return []

    def _cache_registry(self, cache_path: Path, text: str, url: str) -> None:
        """Best-effort: a registry that won't cache still works this session."""
        try:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            temp = cache_path.with_name(f"{cache_path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
            temp.write_text(text, encoding="utf-8")
            os.replace(temp, cache_path)
        except OSError as error:
            decky.logger.warning("Could not cache registry %s: %s", url, error)

    def _registry_cache_path(self, url: str) -> Path:
        # The official registry keeps the plain documented name; user-added ones get
        # their own file per URL so one bad registry can't clobber another's cache.
        directory = Path(decky.DECKY_PLUGIN_SETTINGS_DIR)
        if url == REMOTE_REGISTRY_URL:
            return directory / "registry-cache.json"
        if url == PRERELEASE_REGISTRY_URL:
            return directory / "registry-cache-prerelease.json"
        return directory / "registries" / f"{hashlib.sha256(url.encode('utf-8')).hexdigest()[:16]}.json"

    async def add_custom_registry(self, url: str):
        """Never raises for user input: returns added=False plus a reason code for the UI."""
        try:
            url = validate_registry_url(url)
        except ValueError as error:
            decky.logger.error("Refused to add invalid registry URL %r", url)
            return {"added": False, "url": url, "reason": "invalid-url", "detail": str(error)}

        def refused():
            if url in self.settings.get("customRegistries", []):
                return {"added": False, "url": url, "reason": "already-added", "detail": ""}
            if len(self.settings.get("customRegistries", [])) >= MAX_CUSTOM_REGISTRIES:
                return {"added": False, "url": url, "reason": "too-many", "detail": str(MAX_CUSTOM_REGISTRIES)}
            return None

        if refusal := refused():
            return refusal
        # Load it once before saving, so a dead or non-registry URL is reported here,
        # while the user is watching, instead of being skipped on every later start.
        try:
            apps, text = await asyncio.to_thread(fetch_remote_registry, url)
        except (OSError, ValueError) as error:
            reason, detail = registry_failure_reason(error)
            decky.logger.error("Can't load registry %s: %s", url, error)
            return {"added": False, "url": url, "reason": reason, "detail": detail}
        # Checked again: another add may have finished while this one was downloading.
        if refusal := refused():
            return refusal
        # A list whose every entry is already shown (the official one pinned to a
        # commit, say) would be saved and fetched on every refresh for nothing.
        repos = {app["repo"].casefold() for app in self.apps}
        ids = {app["id"] for app in self.apps}
        names = {"deckyhub"}.union(*map(detect_names, self.apps))
        if not any(
            app["repo"].casefold() not in repos and app["id"] not in ids and not detect_names(app) & names
            for app in apps
        ):
            return {"added": False, "url": url, "reason": "nothing-new", "detail": str(len(apps))}
        self.settings.setdefault("customRegistries", []).append(url)
        self._save_settings()
        # Hand the payload we already have to the reload and read the rest from their
        # caches, so adding costs exactly one request.
        self.apps = await asyncio.to_thread(self._load_registry, (url, (apps, text)), False)
        # Report what it actually contributed: entries already listed by an earlier
        # source are skipped, so "added with 12 repositories" could mean none showed up.
        # The prefetched entries are passed through as-is, so identity tells them apart.
        mine = {id(app) for app in apps}
        added = sum(id(app) in mine for app in self.apps)
        decky.logger.info("Added registry %s: %d entries, %d new", url, len(apps), added)
        return {"added": True, "url": url, "apps": added}

    async def remove_custom_registry(self, url: str):
        stored = url.strip() if isinstance(url, str) else ""
        if stored not in self.settings.get("customRegistries", []):
            return {"removed": False, "url": stored}
        self.settings["customRegistries"].remove(stored)
        self._save_settings()
        try:
            self._registry_cache_path(stored).unlink(missing_ok=True)
        except OSError as error:
            decky.logger.warning("Could not delete cache for %s: %s", stored, error)
        # Dropping a source needs no downloads: the rest come from their caches.
        self.apps = await asyncio.to_thread(self._load_registry, None, False)
        decky.logger.info("Removed registry %s", stored)
        return {"removed": True, "url": stored}

    async def refresh_registry(self):
        sources = list(self.settings.get("customRegistries", []))
        apps = await asyncio.to_thread(self._load_registry)
        if sources != self.settings.get("customRegistries", []):
            # A registry was added or removed mid-download, so `apps` reflects the old
            # list. Rebuild from the caches, which already hold what was just fetched.
            apps = await asyncio.to_thread(self._load_registry, None, False)
        self.apps = apps
        decky.logger.info("Reloaded %d registry entries", len(self.apps))
        return {"apps": len(self.apps)}
