"""Folders Decky keeps for plugins that are no longer installed: settings/<plugin>, data/<plugin> and logs/<plugin>
under its home folder. Decky removes them with a plugin it uninstalls itself, but plugins removed by hand, and
plugins whose uninstall failed, leave them behind.

Finding them is a guess (a plugin may keep its files under a name of its own), so nothing is ever removed unless
the user picks it, and a plugin's settings are backed up first (backups.py) so a wrong pick can be undone.
"""

import asyncio
import shutil
import time
from pathlib import Path

import decky

from .backups import _one_part, make_backup

AREAS = ("settings", "data", "logs")
# Folders that are Decky's own or DeckyHub's: never offered, never removed.
PROTECTED = {"deckyhub", "decky-loader", "loader"}


def _installed() -> set[str]:
    plugins = Path(decky.DECKY_HOME) / "plugins"
    return {path.parent.name.casefold() for path in plugins.glob("*/plugin.json")}


def _size(folder: Path) -> int:
    return sum(path.stat().st_size for path in folder.rglob("*") if path.is_file() and not path.is_symlink())


def _newest(folder: Path) -> float:
    times = [folder.stat().st_mtime]
    times += [path.stat().st_mtime for path in folder.rglob("*") if not path.is_symlink()]
    return max(times)


def _candidate(name: str, installed: set[str]) -> bool:
    return _one_part(name) and name.casefold() not in installed and name.casefold() not in PROTECTED


def scan() -> list[dict]:
    """Each folder name found under settings/, data/ or logs/ that no installed plugin owns, with its size and last change."""
    installed, found = _installed(), {}
    for area in AREAS:
        root = Path(decky.DECKY_HOME) / area
        if not root.is_dir():
            continue
        for folder in root.iterdir():
            if folder.is_symlink() or not folder.is_dir() or not _candidate(folder.name, installed):
                continue
            try:
                item = found.setdefault(folder.name, {"name": folder.name, "areas": [], "size": 0, "modified": 0})
                item["areas"].append(area)
                item["size"] += _size(folder)
                item["modified"] = max(item["modified"], int(_newest(folder) * 1000))
            except OSError:
                continue
    return sorted(found.values(), key=lambda item: item["name"].casefold())


def remove(names: list[str]) -> dict:
    """Removes the named folders from every area, after backing up their settings. Anything that isn't a plain
    leftover (installed, protected, hidden, a link, not a direct child) is left and reported."""
    installed = _installed()
    removed, freed, skipped = 0, 0, []
    for name in names:
        if not _candidate(name, installed):
            skipped.append(name)
            continue
        folders = [Path(decky.DECKY_HOME) / area / name for area in AREAS]
        folders = [folder for folder in folders if folder.is_dir() and not folder.is_symlink()]
        if not folders:
            skipped.append(name)
            continue
        backup = make_backup(name)
        if "error" in backup:
            # Too big or unreadable: not removed without a copy to go back to.
            skipped.append(name)
            continue
        try:
            for folder in folders:
                freed += _size(folder)
                shutil.rmtree(folder)
            removed += 1
            decky.logger.info("Removed the leftover folders of %s", name)
        except OSError as error:
            decky.logger.warning("Could not remove the leftover folders of %s: %s", name, error)
            skipped.append(name)
    return {"removed": removed, "freed": freed, "skipped": skipped, "at": int(time.time() * 1000)}


class LeftoversMixin:
    async def scan_leftovers(self):
        return {"items": await asyncio.to_thread(scan)}

    async def remove_leftovers(self, names: list):
        if not isinstance(names, list) or not all(isinstance(name, str) for name in names):
            return {"error": "Invalid list"}
        return await asyncio.to_thread(remove, names[:200])
