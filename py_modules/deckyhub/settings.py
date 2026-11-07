"""settings.json: reading it (old and hand-edited files included), coercing and saving it."""

import asyncio
import contextlib
import json
import os
from pathlib import Path

import decky

from . import paths
from .registry import MAX_CUSTOM_REGISTRIES
from .validation import GITHUB_TOKEN, REPOSITORY_NAME, validate_registry_url

HIDEABLE_BUTTONS = ("downloadZip", "install", "update", "releasePage")
SUPPORTED_LANGUAGES = {
    "auto",
    "en",
    "uk",
    "ru",
    "es",
    "de",
    "fr",
    "pt",
    "pt-PT",
    "it",
    "pl",
    "tr",
    "nl",
    "cs",
    "ja",
    "ko",
    "zh",
    "zh-TW",
}
DEFAULT_COLUMNS_PER_ROW = 3


def coerce_settings(settings: dict) -> dict:
    return {
        "overwriteExisting": bool(settings.get("overwriteExisting", True)),
        "updateChannel": "prerelease" if settings.get("updateChannel") == "prerelease" else "stable",
        # Which branch of the official registry to read (see official_registry_url()).
        "registryChannel": "prerelease" if settings.get("registryChannel") == "prerelease" else "stable",
        "language": settings.get("language") if settings.get("language") in SUPPORTED_LANGUAGES else "auto",
        "columnsPerRow": settings.get("columnsPerRow")
        if type(settings.get("columnsPerRow")) is int and settings["columnsPerRow"] in (1, 2, 3, 4)
        else DEFAULT_COLUMNS_PER_ROW,
        # Only the frontend's api.github.com calls send it (githubHeaders() in src/utils.ts).
        "githubToken": settings["githubToken"].strip()[:255] if isinstance(settings.get("githubToken"), str) else "",
        "density": "compact" if settings.get("density") == "compact" else "default",
        # True black backgrounds for OLED screens (applyOled() in src/styles.ts). Off for older settings files.
        "oled": settings.get("oled") is True,
        # A haptic tick on the Deck's trackpads as focus moves (hapticTick() in src/utils.ts).
        "haptics": bool(settings.get("haptics", True)),
        # DeckyHub's own icon in Steam's Quick Access tab strip (QuickAccessTab.tsx).
        # Off leaves DeckyHub in Decky's plugin list.
        "quickAccessTab": bool(settings.get("quickAccessTab", True)),
        # Quick Access' UI Style: the classic look, or the Experimental redesign (src/components/experimental/).
        "uiStyle": "experimental" if settings.get("uiStyle") == "experimental" else "default",
        # Manage-window buttons the user chose to hide (Display Settings).
        "hiddenButtons": [
            name
            for name in HIDEABLE_BUTTONS
            if isinstance(settings.get("hiddenButtons"), list) and name in settings["hiddenButtons"]
        ],
    }


def coerce_repo_settings(values) -> dict:
    values = values if isinstance(values, dict) else {}
    item = {"channel": "prerelease" if values.get("channel") == "prerelease" else "stable"}
    # The release tag the user chose to skip (Manage -> Skip this version); it stops
    # counting as an update until a newer release comes out.
    skip = values.get("skipVersion")
    if isinstance(skip, str) and skip.strip() and len(skip) <= 200:
        item["skipVersion"] = skip.strip()
    return item


# User-added registry URLs, normalized, de-duplicated and capped. Invalid entries
# are dropped rather than raised on: a settings file edited by hand shouldn't stop
# the plugin from starting, and add_custom_registry() is where typos get reported.
def coerce_registry_urls(values) -> list[str]:
    if not isinstance(values, list):
        return []
    urls: list[str] = []
    for value in values:
        try:
            url = validate_registry_url(value)
        except ValueError:
            continue
        if url not in urls:
            urls.append(url)
    return urls[:MAX_CUSTOM_REGISTRIES]


class SettingsMixin:
    def _load_settings(self) -> dict:
        try:
            settings = json.loads(self.settings_path.read_text(encoding="utf-8"))
            # Files saved before writes were owner-only (see _save_settings) get fixed here.
            with contextlib.suppress(OSError):
                os.chmod(self.settings_path, 0o600)
            repos = settings.get("customRepos")
            repo_settings = settings.get("repoSettings")
            return {
                **coerce_settings(settings),
                "customRepos": [repo for repo in repos if isinstance(repo, str) and REPOSITORY_NAME.fullmatch(repo)]
                if isinstance(repos, list)
                else [],
                "customRegistries": coerce_registry_urls(settings.get("customRegistries", [])),
                "repoSettings": {
                    repo: coerce_repo_settings(values)
                    for repo, values in repo_settings.items()
                    if REPOSITORY_NAME.fullmatch(repo)
                }
                if isinstance(repo_settings, dict)
                else {},
            }
        except (AttributeError, OSError, json.JSONDecodeError) as error:
            if self.settings_path.exists():
                decky.logger.error("Can't read %s, using defaults: %s", self.settings_path, error)
            return {**coerce_settings({}), "customRepos": [], "customRegistries": [], "repoSettings": {}}

    def _save_settings(self):
        # Write-then-rename, so a Deck losing power mid-save keeps the old file.
        self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.settings_path.with_name(self.settings_path.name + ".tmp")
        # Owner-only: it holds the GitHub token. The chmod covers a leftover temp file,
        # whose mode os.open's 0o600 wouldn't change.
        with open(temp, "w", encoding="utf-8", opener=lambda path, flags: os.open(path, flags, 0o600)) as file:
            os.chmod(temp, 0o600)
            json.dump(self.settings, file)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, self.settings_path)

    async def get_settings(self):
        return self.settings

    async def save_settings(self, settings: dict):
        channel = getattr(self, "settings", {}).get("registryChannel")
        self.settings = {
            **coerce_settings(settings),
            "customRepos": getattr(self, "settings", {}).get("customRepos", []),
            "customRegistries": getattr(self, "settings", {}).get("customRegistries", []),
            "repoSettings": getattr(self, "settings", {}).get("repoSettings", {}),
        }
        self._save_settings()
        decky.logger.info("Saved settings: %s", {**self.settings, "githubToken": bool(self.settings["githubToken"])})
        if channel is not None and channel != self.settings["registryChannel"]:
            # The other registry branch: load it now, and open pages reload when it lands.
            self.registry_task = asyncio.create_task(self._refresh_registry_in_background())
        return self.settings

    async def save_repo_settings(self, repo: str, values: dict):
        if not REPOSITORY_NAME.fullmatch(repo):
            decky.logger.error("Refused settings for invalid repository %r", repo)
            raise ValueError("Repository must be owner/name")
        item = coerce_repo_settings(values)
        self.settings["repoSettings"][repo] = item
        self._save_settings()
        decky.logger.info("Saved settings for %s: %s", repo, item)
        return item

    async def read_token_file(self, path: str):
        """A GitHub token from a small text file the user picked in their home folder (typing
        one on an on-screen keyboard is painful). Returns it for the token field; Save
        stores it. Never logs the file's contents."""
        source = Path(path).resolve()
        user_home = Path(paths.DEFAULT_DOWNLOAD_DIR).parent.resolve()
        if not source.is_relative_to(user_home) or not source.is_file() or source.stat().st_size > 4096:
            decky.logger.error("Refused to read a token from %s: not a small file inside %s", source, user_home)
            raise ValueError("Choose a small text file inside your home folder")
        match = GITHUB_TOKEN.search(source.read_text(encoding="utf-8", errors="replace"))
        if not match:
            decky.logger.info("No GitHub token in %s", source)
            return {"token": None}
        decky.logger.info("Read a GitHub token from %s", source)
        return {"token": match.group(0)}
