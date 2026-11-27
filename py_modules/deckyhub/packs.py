"""Plugin packs: a small .json file listing plugins by their GitHub repository, to share with someone else or to
set up another device. Importing one only *offers* the installs: DeckyHub shows the list with its badges and the
usual notice, and every install still goes through Decky Loader's own confirmation.

A pack holds repository names, display names, each plugin's version and whether it was switched off, and the names
of installed plugins DeckyHub couldn't tie to a repository ("manual": to reinstall by hand). Nothing else: no URLs to
fetch, no code, no settings. Everything but the repositories is optional, so older packs still import, and older
DeckyHubs, which read only the repositories, still import newer ones.
"""

import asyncio
import json
import re
import time
from pathlib import Path

import decky

from . import paths
from .validation import MAX_CUSTOM_REPOS, REPOSITORY_NAME

PENDING_INSTALLS_FILE = "pending-installs.json"  # also written by the Desktop Mode installer
MAX_PACK_BYTES = 256 * 1024
MAX_PACK_PLUGINS = 200
DECKYHUB_REPO = "mazillka/deckyhub-plugin"


def _text(value: object, limit: int) -> str | None:
    """A string from a pack that gets shown to the user: one line, printable and short."""
    if not isinstance(value, str):
        return None
    return "".join(char for char in value if char.isprintable()).strip()[:limit] or None


def pack_details(payload: dict, repos: list[str]) -> tuple[list[dict], list[dict]]:
    """For a payload pack_repos() accepted: one {repo, name, version, disabled} per repository, in the same order,
    and the [{name, version}] to reinstall by hand."""
    found: dict[str, dict] = {}
    plugins = payload.get("plugins")
    for item in plugins[: MAX_PACK_PLUGINS * 2] if isinstance(plugins, list) else []:
        if isinstance(item, dict) and isinstance(item.get("repo"), str):
            found.setdefault(item["repo"].casefold(), item)
    entries = []
    for repo in repos:
        item = found.get(repo.casefold(), {})
        entries.append(
            {
                "repo": repo,
                "name": _text(item.get("name"), 100),
                "version": _text(item.get("version"), 60),
                "disabled": item.get("disabled") is True,
            }
        )
    rows = payload.get("manual")
    manual = [
        {"name": name, "version": _text(item.get("version"), 60)}
        for item in (rows[:MAX_PACK_PLUGINS] if isinstance(rows, list) else [])
        if isinstance(item, dict) and (name := _text(item.get("name"), 100))
    ]
    return entries, manual


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
        plugins, manual, seen = [], [], set()
        for row in rows:
            repo = row.get("repo")
            name = str(row.get("name") or repo or "")[:100]
            if name.casefold() == "deckyhub" or (isinstance(repo, str) and repo.casefold() == DECKYHUB_REPO):
                continue
            # "installed" stands for a plugin that declares no version.
            version = row.get("version") if row.get("version") != "installed" else None
            # Only plugins DeckyHub can tie to a repository (its identity check) can be installed from a pack.
            if row.get("identityUnverified") is False and isinstance(repo, str) and REPOSITORY_NAME.fullmatch(repo):
                if repo.casefold() not in seen:
                    seen.add(repo.casefold())
                    entry = {"repo": repo, "name": name or repo}
                    if version:
                        entry["version"] = str(version)[:60]
                    if row.get("disabled"):
                        entry["disabled"] = True
                    plugins.append(entry)
            elif name:
                manual.append({"name": name, **({"version": str(version)[:60]} if version else {})})
        # A pack needs something DeckyHub can install; one of only by-hand names couldn't be imported.
        if not plugins:
            return {"path": None, "count": 0}
        target = await asyncio.to_thread(self._export_target, f"DeckyHub-pack-{time.strftime('%Y%m%d')}.json")
        pack = {"schemaVersion": 1, "kind": "deckyhub-pack", "name": "My DeckyHub pack", "plugins": plugins}
        if manual:
            pack["manual"] = manual
        await asyncio.to_thread(target.write_text, json.dumps(pack, indent=2), encoding="utf-8")
        decky.logger.info("Exported a pack of %d plugins (%d by hand) to %s", len(plugins), len(manual), target)
        return {"path": str(target), "count": len(plugins), "manual": len(manual)}

    async def import_plugin_pack(self, path: str):
        """Reads a pack the user picked and makes the plugins it names known to DeckyHub (a repository the registry
        doesn't list is added as a custom one). Returns what the pack holds for the restore window. Installs nothing."""
        source = Path(path).resolve()
        user_home = paths.user_home()
        if source.suffix.lower() != ".json" or not source.is_relative_to(user_home) or not source.is_file():
            decky.logger.error("Refused to import a pack from %s", source)
            raise ValueError("Choose a JSON file inside your home folder")
        if source.stat().st_size > MAX_PACK_BYTES:
            raise ValueError("This file is too large to be a plugin pack")
        try:
            payload = json.loads(source.read_text(encoding="utf-8"))
            repos, name = pack_repos(payload)
        except (OSError, ValueError) as error:
            decky.logger.error("Can't import the pack %s: %s", source, error)
            raise ValueError(
                str(error) if isinstance(error, ValueError) and "pack" in str(error) else "Invalid plugin pack"
            ) from error
        known = {app["repo"].casefold() for app in self.apps} | {
            repo.casefold() for repo in self.settings["customRepos"]
        }
        # Past the cap the rest still go to the install offer, but are not added to the user's own list.
        added = [repo for repo in repos if repo.casefold() not in known][
            : max(0, MAX_CUSTOM_REPOS - len(self.settings["customRepos"]))
        ]
        if added:
            self.settings["customRepos"].extend(added)
            self._save_settings()
        entries, manual = pack_details(payload, repos)
        decky.logger.info("Imported a pack of %d plugins from %s (%d new repositories)", len(repos), source, len(added))
        return {"name": name, "count": len(repos), "added": added, "plugins": entries, "manual": manual}
