"""The app list the frontend shows: registry entries plus the user's own repositories,
each with the version of the matching plugin installed in Decky Loader."""

import asyncio
import json
import re
from pathlib import Path

import decky

from . import paths
from .registry import MAX_REMOTE_REGISTRY_BYTES
from .validation import REPOSITORY_NAME


class AppsMixin:
    # Each plugin's (plugin.json, package.json or {}, repository), read once per scan.
    def _scan_installed_plugins(self) -> list[tuple[dict, dict, str | None]]:
        plugins_dir = Path(decky.DECKY_HOME) / "plugins"
        scanned = []
        for manifest_path in plugins_dir.glob("*/plugin.json"):
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            # Another plugin's broken manifest must not take the whole list down with it.
            if not isinstance(manifest, dict) or not isinstance(manifest.get("name", ""), str):
                continue
            try:
                package = json.loads((manifest_path.parent / "package.json").read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                package = {}
            if not isinstance(package, dict):
                package = {}
            scanned.append((manifest, package, self._plugin_repository(manifest, package)))
        return scanned

    def _match_decky_plugin(
        self, rule: dict, installed_plugins: list[tuple[dict, dict, str | None]]
    ) -> tuple[dict, dict] | None:
        expected_repo = str(rule.get("repo", "")).casefold()
        matches = [
            (manifest, package)
            for manifest, package, repo in installed_plugins
            if expected_repo and repo == expected_repo
        ]
        return matches[0] if len(matches) == 1 else None

    def _decky_plugin_version(self, match: tuple[dict, dict] | None) -> str | None:
        if not match:
            return None
        manifest, package = match
        return str(manifest.get("version") or package.get("version") or "installed")

    def _plugin_repository(self, manifest: dict, package: dict) -> str | None:
        value = package.get("repository", manifest.get("repository"))
        if isinstance(value, dict):
            value = value.get("url")
        if not isinstance(value, str):
            return None
        match = re.fullmatch(
            r"(?:(?:git\+)?https://github\.com/|git@github\.com:|github:)([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)?/?",
            value,
            re.IGNORECASE,
        )
        repo = (match.group(1) if match else value).removesuffix(".git")
        return repo.casefold() if REPOSITORY_NAME.fullmatch(repo) else None

    async def get_apps(self):
        apps = [*self.apps, *self._custom_apps()]
        installed_plugins = await asyncio.to_thread(self._scan_installed_plugins)
        installed = [None] * len(apps)
        # The installed plugin's own name, which Decky Loader's install_plugin
        # route needs to update it in place (see "Install update" on the cards).
        plugin_names = [None] * len(apps)
        unverified = [False] * len(apps)
        for index, app in enumerate(apps):
            if app.get("detect", {}).get("type") == "decky-plugin":
                rule = {**app["detect"], "repo": app["repo"]}
                match = self._match_decky_plugin(rule, installed_plugins)
                names = {name.casefold() for name in rule.get("names", [])}
                candidates = [
                    item
                    for item in installed_plugins
                    if item[0].get("name", "").casefold() in names or item[2] == app["repo"].casefold()
                ]
                unverified[index] = bool(candidates) and (not match or len(candidates) != 1)
                if unverified[index]:
                    match = None
                installed[index] = self._decky_plugin_version(match)
                if unverified[index]:
                    installed[index] = self._decky_plugin_version((candidates[0][0], candidates[0][1]))
                plugin_names[index] = match[0].get("name") if match else None
        decky.logger.info("Listed %d apps, %d installed", len(apps), sum(version is not None for version in installed))
        return {
            "apps": [
                {
                    **app,
                    "installedVersion": version,
                    "pluginName": name,
                    "identityUnverified": uncertain,
                    "latestVersion": None,
                    "publishedAt": None,
                    "releaseUrl": None,
                    "assets": [],
                    "updateAvailable": None,
                    "error": None,
                }
                for app, version, name, uncertain in zip(apps, installed, plugin_names, unverified)
            ]
        }

    def _custom_apps(self) -> list[dict]:
        listed = {app["repo"].casefold() for app in self.apps}
        return [
            {
                "id": f"custom-{repo.replace('/', '-')}",
                "name": repo,
                "repo": repo,
                "category": "Custom",
                "detect": {"type": "decky-plugin", "repo": repo},
                "asset": {"include": [], "exclude": ["source"]},
            }
            for repo in self.settings["customRepos"]
            if repo.casefold() not in listed
        ]

    async def add_custom_repo(self, repo: str):
        repo = repo.strip()
        if not REPOSITORY_NAME.fullmatch(repo):
            decky.logger.error("Refused to add invalid repository %r", repo)
            raise ValueError("Repository must be owner/name")
        existing = {app["repo"].casefold() for app in self.apps} | {
            item.casefold() for item in self.settings["customRepos"]
        }
        if repo.casefold() in existing:
            return {"added": False, "repo": repo}
        self.settings["customRepos"].append(repo)
        self._save_settings()
        decky.logger.info("Added repository %s", repo)
        return {"added": True, "repo": repo}

    async def remove_custom_repo(self, repo: str):
        repo = repo.strip()
        # Case-insensitive, like add/import; also drops the repo's saved channel/filter.
        stored = next((item for item in self.settings["customRepos"] if item.casefold() == repo.casefold()), None)
        if stored is None:
            return {"removed": False, "repo": repo}
        self.settings["customRepos"].remove(stored)
        self.settings.get("repoSettings", {}).pop(stored, None)
        self._save_settings()
        decky.logger.info("Removed repository %s", stored)
        return {"removed": True, "repo": repo}

    def _export_target(self, name: str) -> Path:
        target = Path(paths.DEFAULT_DOWNLOAD_DIR) / name
        target.parent.mkdir(parents=True, exist_ok=True)
        return self._next_name(target) if target.exists() else target

    async def export_custom_repos(self):
        target = await asyncio.to_thread(self._export_target, "DeckyHub-repositories.json")
        await asyncio.to_thread(
            target.write_text,
            json.dumps({"schemaVersion": 1, "repos": self.settings["customRepos"]}, indent=2),
            encoding="utf-8",
        )
        decky.logger.info("Exported %d repositories to %s", len(self.settings["customRepos"]), target)
        return {"path": str(target)}

    async def import_custom_repos(self, path: str):
        source = Path(path).resolve()
        user_home = Path(paths.DEFAULT_DOWNLOAD_DIR).parent.resolve()
        if source.suffix.lower() != ".json" or not source.is_relative_to(user_home):
            decky.logger.error("Refused to import %s: not a JSON file inside %s", source, user_home)
            raise ValueError("Choose a JSON file inside your home folder")
        # Read on Decky's event loop, so a huge file picked by mistake would stall every call.
        if source.is_file() and source.stat().st_size > MAX_REMOTE_REGISTRY_BYTES:
            decky.logger.error("Refused to import %s: larger than %d bytes", source, MAX_REMOTE_REGISTRY_BYTES)
            raise ValueError("Invalid repository export")
        try:
            payload = json.loads(source.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            decky.logger.error("Can't import %s: %s", source, error)
            raise ValueError("Invalid repository export") from error
        repos = payload.get("repos", []) if isinstance(payload, dict) else payload
        if not isinstance(repos, list):
            decky.logger.error("Can't import %s: no repository list", source)
            raise ValueError("Invalid repository export")
        existing = {app["repo"].casefold() for app in self.apps} | {
            repo.casefold() for repo in self.settings["customRepos"]
        }
        added = []
        for repo in repos:
            if isinstance(repo, str) and REPOSITORY_NAME.fullmatch(repo) and repo.casefold() not in existing:
                existing.add(repo.casefold())
                added.append(repo)
        if added:
            self.settings["customRepos"].extend(added)
            self._save_settings()
        decky.logger.info("Imported %s from %s", added or "nothing new", source)
        return {"added": added}
