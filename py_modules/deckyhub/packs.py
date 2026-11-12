"""Plugin packs: a small .json file listing plugins by their GitHub repository, to share with someone else or to
set up another device. Importing one only *offers* the installs: DeckyHub shows the list with its badges and the
usual notice, and every install still goes through Decky Loader's own confirmation.

A pack holds repository names and display names, nothing else: no URLs to fetch, no code, no settings.
"""

import asyncio
import json
import os
import re
import time
from pathlib import Path

import decky

from . import paths
from .validation import REPOSITORY_NAME

PENDING_INSTALLS_FILE = "pending-installs.json"  # also written by the Desktop Mode installer
MAX_PACK_BYTES = 256 * 1024
MAX_PACK_PLUGINS = 200
DECKYHUB_REPO = "mazillka/deckyhub-plugin"


def pack_repos(payload: object) -> tuple[list[str], str | None]:
    """The repositories (owner/name, once each, DeckyHub itself left out) and the pack's name, from a pack file.
    The list of repositories DeckyHub itself exports from Repositories ({"repos": [...]}) is read too."""
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise ValueError("This isn't a DeckyHub plugin pack")
    items = payload.get("plugins", payload.get("repos"))
    if not isinstance(items, list):
        raise ValueError("This isn't a DeckyHub plugin pack")
    repos: list[str] = []
    for item in items[: MAX_PACK_PLUGINS * 2]:
        repo = item.get("repo") if isinstance(item, dict) else item
        if (
            isinstance(repo, str)
            and REPOSITORY_NAME.fullmatch(repo)
            and repo.casefold() != DECKYHUB_REPO
            and repo.casefold() not in {existing.casefold() for existing in repos}
        ):
            repos.append(repo)
    if not repos:
        raise ValueError("This plugin pack has no plugins in it")
    name = payload.get("name")
    # Shown to the user: plain text only, and short.
    name = re.sub(r"[^\w .,&'+()-]", "", name)[:60].strip() if isinstance(name, str) else None
    return repos[:MAX_PACK_PLUGINS], name or None


class PacksMixin:
    async def export_plugin_pack(self):
        rows = await asyncio.to_thread(self._remote_installed_plugins)
        plugins, seen = [], set()
        for row in rows:
            repo = row.get("repo")
            # Only plugins DeckyHub can tie to a repository (its identity check), never DeckyHub itself.
            if (
                row.get("identityUnverified") is False
                and isinstance(repo, str)
                and REPOSITORY_NAME.fullmatch(repo)
                and repo.casefold() not in seen | {DECKYHUB_REPO}
            ):
                seen.add(repo.casefold())
                plugins.append({"repo": repo, "name": str(row.get("name") or repo)[:100]})
        if not plugins:
            return {"path": None, "count": 0}
        target = await asyncio.to_thread(self._export_target, f"DeckyHub-pack-{time.strftime('%Y%m%d')}.json")
        pack = {"schemaVersion": 1, "kind": "deckyhub-pack", "name": "My DeckyHub pack", "plugins": plugins}
        await asyncio.to_thread(target.write_text, json.dumps(pack, indent=2), encoding="utf-8")
        decky.logger.info("Exported a pack of %d plugins to %s", len(plugins), target)
        return {"path": str(target), "count": len(plugins)}

    async def import_plugin_pack(self, path: str):
        """Reads a pack the user picked, makes the plugins it names known to DeckyHub (a repository the registry
        doesn't list is added as a custom one) and queues them for the install offer. Installs nothing."""
        source = Path(path).resolve()
        user_home = Path(paths.DEFAULT_DOWNLOAD_DIR).parent.resolve()
        if source.suffix.lower() != ".json" or not source.is_relative_to(user_home) or not source.is_file():
            decky.logger.error("Refused to import a pack from %s", source)
            raise ValueError("Choose a JSON file inside your home folder")
        if source.stat().st_size > MAX_PACK_BYTES:
            raise ValueError("This file is too large to be a plugin pack")
        try:
            repos, name = pack_repos(json.loads(source.read_text(encoding="utf-8")))
        except (OSError, ValueError) as error:
            decky.logger.error("Can't import the pack %s: %s", source, error)
            raise ValueError(
                str(error) if isinstance(error, ValueError) and "pack" in str(error) else "Invalid plugin pack"
            ) from error
        known = {app["repo"].casefold() for app in self.apps} | {
            repo.casefold() for repo in self.settings["customRepos"]
        }
        added = [repo for repo in repos if repo.casefold() not in known]
        if added:
            self.settings["customRepos"].extend(added)
            self._save_settings()
        queue = Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / PENDING_INSTALLS_FILE
        queue.parent.mkdir(parents=True, exist_ok=True)
        temp = queue.with_name(queue.name + ".tmp")
        temp.write_text(json.dumps(repos), encoding="utf-8")
        os.replace(temp, queue)
        decky.logger.info("Imported a pack of %d plugins from %s (%d new repositories)", len(repos), source, len(added))
        return {"name": name, "count": len(repos), "added": added}
