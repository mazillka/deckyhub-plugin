"""Backups of other plugins' settings: a .tar.gz of Decky's settings/<plugin folder>, made before DeckyHub
updates, reinstalls or removes the plugin (Decky deletes the settings of a removed plugin), and restored on request.

Backups live in DeckyHub's own settings folder, so they survive the plugin's removal. Nothing here raises to the
frontend for a plain "can't": a backup that fails must never stop the update it was made for.
"""

import asyncio
import json
import os
import re
import shutil
import tarfile
import time
from pathlib import Path

import decky

KEEP = 5  # backups kept per plugin
MAX_BYTES = 50 * 1024 * 1024  # a plugin's settings beyond this are not backed up
_FILE = re.compile(r"(?P<folder>[^/\\]+)--(?P<stamp>\d{8}-\d{6}(?:-\d+)?)\.tar\.gz")


def _settings_root() -> Path:
    return Path(decky.DECKY_HOME) / "settings"


def _backup_root() -> Path:
    return Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / "backups"


def _one_part(name: object) -> bool:
    """A single folder or file name: no separators, not hidden, not '.' or '..'."""
    return isinstance(name, str) and bool(name) and "/" not in name and "\\" not in name and not name.startswith(".")


def plugin_folder(name: str) -> str | None:
    """The folder under plugins/ (and so settings/) of the installed plugin whose manifest name this is."""
    found = []
    for manifest_path in (Path(decky.DECKY_HOME) / "plugins").glob("*/plugin.json"):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            continue
        if isinstance(manifest, dict) and str(manifest.get("name", "")).casefold() == str(name).casefold():
            found.append(manifest_path.parent.name)
    return found[0] if len(found) == 1 and _one_part(found[0]) else None


def _size(folder: Path) -> int:
    return sum(path.stat().st_size for path in folder.rglob("*") if path.is_file() and not path.is_symlink())


def make_backup(folder: str) -> dict:
    """Archives settings/<folder>. {"file"}: made; {"skipped"}: nothing to save; {"error"}: couldn't."""
    if not _one_part(folder):
        return {"error": "Invalid plugin folder"}
    source = _settings_root() / folder
    if source.is_symlink() or not source.is_dir() or not any(source.iterdir()):
        return {"skipped": True}
    try:
        if _size(source) > MAX_BYTES:
            return {"error": f"Its settings are larger than {MAX_BYTES // 1024 // 1024} MB"}
        target_dir = _backup_root() / folder
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp, number = time.strftime("%Y%m%d-%H%M%S"), 1
        name = f"{folder}--{stamp}.tar.gz"
        while (target_dir / name).exists():  # a second backup within the same second must not replace the first
            number += 1
            name = f"{folder}--{stamp}-{number}.tar.gz"
        temp = target_dir / (name + ".part")
        with tarfile.open(temp, "w:gz") as archive:
            # Symlinks are left out: a restore never creates one.
            archive.add(source, arcname=".", filter=lambda member: None if member.issym() or member.islnk() else member)
        os.replace(temp, target_dir / name)
        for old in sorted(target_dir.glob("*.tar.gz"), key=lambda path: (path.stat().st_mtime_ns, path.name))[:-KEEP]:
            old.unlink(missing_ok=True)
        decky.logger.info("Backed up the settings of %s to %s", folder, name)
        return {"file": name}
    except (OSError, tarfile.TarError) as error:
        decky.logger.warning("Could not back up the settings of %s: %s", folder, error)
        return {"error": str(error)}


def list_backups() -> list[dict]:
    root = _backup_root()
    found = []
    if root.is_dir():
        for folder in root.iterdir():
            if folder.is_dir() and _one_part(folder.name):
                for file in folder.glob("*.tar.gz"):
                    match = _FILE.fullmatch(file.name)
                    if match and match["folder"] == folder.name:
                        found.append(
                            {
                                "plugin": folder.name,
                                "file": file.name,
                                "created": file.stat().st_mtime_ns // 1_000_000,  # milliseconds
                                "size": file.stat().st_size,
                            }
                        )
    return sorted(found, key=lambda item: (item["created"], item["file"]), reverse=True)


def _backup_path(folder: str, file: str) -> Path:
    match = _FILE.fullmatch(file) if _one_part(file) else None
    if not _one_part(folder) or not match or match["folder"] != folder:
        raise ValueError("Invalid backup")
    path = _backup_root() / folder / file
    if not path.is_file() or path.is_symlink():
        raise ValueError("That backup no longer exists")
    return path


def _safe_members(archive: tarfile.TarFile) -> list[tarfile.TarInfo]:
    """Only plain files and folders, under the folder being restored: no links, devices or paths that climb out."""
    members, total = [], 0
    for member in archive.getmembers():
        parts = member.name.replace("\\", "/").split("/")
        if member.name.startswith(("/", "\\")) or ".." in parts or not (member.isfile() or member.isdir()):
            raise ValueError("The backup holds something that isn't a plain file or folder")
        total += member.size
        if total > 4 * MAX_BYTES:
            raise ValueError("The backup is larger than expected")
        members.append(member)
    return members


def restore_backup(folder: str, file: str) -> dict:
    """Replaces settings/<folder> with the backup. The current settings are backed up first, so a restore can be undone."""
    path = _backup_path(folder, file)
    target = _settings_root() / folder
    staging = _settings_root() / f".deckyhub-restore-{os.getpid()}-{time.monotonic_ns()}"
    try:
        with tarfile.open(path, "r:gz") as archive:
            members = _safe_members(archive)
            staging.mkdir(parents=True)
            archive.extractall(staging, members=members)  # noqa: S202 - the members were checked above
        before = make_backup(folder)
        if "error" in before:
            raise OSError(f"Couldn't back up the current settings first: {before['error']}")
        old = None
        if target.exists() or target.is_symlink():
            old = target.with_name(f".deckyhub-old-{os.getpid()}-{time.monotonic_ns()}")
            os.replace(target, old)
        os.replace(staging, target)
        if old:
            shutil.rmtree(old, ignore_errors=True)
        decky.logger.info("Restored the settings of %s from %s", folder, file)
        return {"restored": True}
    finally:
        shutil.rmtree(staging, ignore_errors=True)


class BackupsMixin:
    async def backup_plugin_settings(self, name: str):
        """Called before an update or removal; never raises."""
        folder = await asyncio.to_thread(plugin_folder, name)
        if folder is None:
            return {"skipped": True}
        return await asyncio.to_thread(make_backup, folder)

    async def list_settings_backups(self):
        return {"backups": await asyncio.to_thread(list_backups)}

    async def restore_settings_backup(self, folder: str, file: str):
        try:
            return await asyncio.to_thread(restore_backup, folder, file)
        except (OSError, ValueError, tarfile.TarError) as error:
            decky.logger.error("Can't restore %s/%s: %s", folder, file, error)
            return {"error": str(error)}

    async def delete_settings_backup(self, folder: str, file: str):
        try:
            _backup_path(folder, file).unlink()
        except (OSError, ValueError) as error:
            return {"error": str(error)}
        return {"deleted": True}
