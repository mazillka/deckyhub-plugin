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
# 0 is Auto: the frontend fits as many cards as the window's width allows (src/columns.ts).
DEFAULT_COLUMNS_PER_ROW = 0
# Bumped to reset everybody's UI Style to Default once more (see _load_settings).
UI_STYLE_RESET = 1


def coerce_settings(settings: dict) -> dict:
    return {
        "overwriteExisting": bool(settings.get("overwriteExisting", True)),
        "updateChannel": "prerelease" if settings.get("updateChannel") == "prerelease" else "stable",
        # Which branch of the official registry to read (see official_registry_url()).
        "registryChannel": "prerelease" if settings.get("registryChannel") == "prerelease" else "stable",
        "language": settings.get("language") if settings.get("language") in SUPPORTED_LANGUAGES else "auto",
        "columnsPerRow": settings.get("columnsPerRow")
        if type(settings.get("columnsPerRow")) is int and settings["columnsPerRow"] in (0, 1, 2, 3, 4)
        else DEFAULT_COLUMNS_PER_ROW,
        # Only the frontend's api.github.com calls send it (githubHeaders() in src/utils.ts).
        "githubToken": settings["githubToken"].strip()[:255] if isinstance(settings.get("githubToken"), str) else "",
        "density": settings["density"] if settings.get("density") in ("compact", "large") else "default",
        # A haptic click on the Deck's trackpads, and Steam's navigation sound, as focus
        # moves (navFeedback() in src/haptics.ts).
        "haptics": bool(settings.get("haptics", True)),
        "navSound": bool(settings.get("navSound", True)),
        # DeckyHub's own icon in Steam's Quick Access tab strip (QuickAccessTab.tsx).
        # Off leaves DeckyHub in Decky's plugin list.
        "quickAccessTab": bool(settings.get("quickAccessTab", True)),
        # Quick Access' UI Style: the classic look ("default"), or one of the unfinished redesigns ("experimental",
        # src/components/experimental/, and "v2", src/components/v2/), which may be broken and are only for people
        # who pick them. Everybody starts on Default, new installs included; any other value falls back to it.
        "uiStyle": settings.get("uiStyle") if settings.get("uiStyle") in ("experimental", "v2") else "default",
        # Manage-window buttons the user chose to hide (Display Settings).
        "hiddenButtons": [
            name
            for name in HIDEABLE_BUTTONS
            if isinstance(settings.get("hiddenButtons"), list) and name in settings["hiddenButtons"]
        ],
        # Save a plugin's settings before DeckyHub updates, reinstalls or removes it (backups.py).
        "backupBeforeChange": settings.get("backupBeforeChange") is not False,
        # Preserve the off state of installations that used the old two-switch setup (remoteInstallFeature, no longer saved).
        "remoteInstall": settings.get("remoteInstall") is True and settings.get("remoteInstallFeature", True) is True,
    }


def coerce_repo_settings(values) -> dict:
    values = values if isinstance(values, dict) else {}
    item = {"channel": "prerelease" if values.get("channel") == "prerelease" else "stable"}
    # The release tag the user chose to skip (Manage -> Skip this version); it stops
    # counting as an update until a newer release comes out.
    skip = values.get("skipVersion")
    if isinstance(skip, str) and skip.strip() and len(skip) <= 200:
        item["skipVersion"] = skip.strip()
    # The version the user pinned the plugin at (Manage -> Pin): no update is offered for it until it is unpinned.
    pin = values.get("pinVersion")
    if isinstance(pin, str) and pin.strip() and len(pin) <= 200:
        item["pinVersion"] = pin.strip()
    # The Decky Loader name of an installed plugin DeckyHub couldn't verify and the user chose to trust (Manage ->
    # Trust this plugin). It only applies while that is still the one unambiguous name (App.uninstallName).
    trusted = values.get("trustedIdentity")
    if isinstance(trusted, str) and trusted.strip() and len(trusted) <= 200:
        item["trustedIdentity"] = trusted.strip()
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
            # Experimental and Experimental V2 are unfinished and may be broken. A file saved before this marker
            # existed goes back to Default once (nobody can tell a choice from the old new-install default);
            # every save writes the marker, so a style picked afterwards stays.
            if settings.get("uiStyleReset") != UI_STYLE_RESET:
                settings = {**settings, "uiStyle": "default"}
            repos = settings.get("customRepos")
            repo_settings = settings.get("repoSettings")
            return {
                **coerce_settings(settings),
                "uiStyleReset": UI_STYLE_RESET,
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
        except (AttributeError, OSError, ValueError) as error:
            if self.settings_path.exists():
                decky.logger.error("Can't read %s, using defaults: %s", self.settings_path, error)
                if not isinstance(error, OSError):
                    # The next save would replace the unreadable file with defaults, and its token, custom
                    # registries and pins with it: keep it beside the new one.
                    with contextlib.suppress(OSError):
                        os.replace(self.settings_path, self.settings_path.with_name(self.settings_path.name + ".bad"))
            return {
                **coerce_settings({}),
                "uiStyleReset": UI_STYLE_RESET,
                "customRepos": [],
                "customRegistries": [],
                "repoSettings": {},
            }

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
            "uiStyleReset": UI_STYLE_RESET,
            "customRepos": getattr(self, "settings", {}).get("customRepos", []),
            "customRegistries": getattr(self, "settings", {}).get("customRegistries", []),
            "repoSettings": getattr(self, "settings", {}).get("repoSettings", {}),
            # The dedicated remote-install RPC owns listener lifecycle. A stale
            # general settings form must not silently change its enabled state.
            "remoteInstall": getattr(self, "settings", {}).get("remoteInstall") is True,
        }
        self._save_settings()
        decky.logger.info("Saved settings: %s", {**self.settings, "githubToken": bool(self.settings["githubToken"])})
        if channel is not None and channel != self.settings["registryChannel"]:
            # The other registry branch: load it now, and open pages reload when it lands.
            # The refresh still running (startup's, say) would finish last with the old channel's list.
            if getattr(self, "registry_task", None):
                self.registry_task.cancel()
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
        user_home = paths.user_home()
        if not source.is_relative_to(user_home) or not source.is_file() or source.stat().st_size > 4096:
            decky.logger.error("Refused to read a token from %s: not a small file inside %s", source, user_home)
            raise ValueError("Choose a small text file inside your home folder")
        match = GITHUB_TOKEN.search(source.read_text(encoding="utf-8", errors="replace"))
        if not match:
            decky.logger.info("No GitHub token in %s", source)
            return {"token": None}
        decky.logger.info("Read a GitHub token from %s", source)
        return {"token": match.group(0)}
