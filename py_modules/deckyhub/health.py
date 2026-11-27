"""How much space each installed plugin takes, and when its logs last changed: the four folders Decky keeps per
plugin (plugins/, settings/, data/ and logs/<plugin folder>). Read only. A plugin may keep files elsewhere, which
nothing here counts, and a folder that can't be read is reported as unknown, never as empty.
"""

import asyncio
import json
import os
import stat
from pathlib import Path

import decky

AREAS = ("plugins", "settings", "data", "logs")


def folder_facts(folder: Path) -> tuple[int, int] | None:
    """(bytes, newest file's modification time in ms; 0 with no files) of the regular files under folder, links not
    followed. A folder that isn't there is empty. None when any part of it can't be read: a partial sum would pass
    for the whole."""
    size, newest = 0, 0.0
    pending = [folder]
    while pending:
        current = pending.pop()
        try:
            with os.scandir(current) as entries:
                for entry in entries:
                    info = entry.stat(follow_symlinks=False)
                    if stat.S_ISDIR(info.st_mode):
                        pending.append(Path(entry.path))
                    elif stat.S_ISREG(info.st_mode):
                        size += info.st_size
                        newest = max(newest, info.st_mtime)
        except FileNotFoundError:
            continue  # never made, or removed while being read (a log rotating)
        except OSError:
            return None
    return size, int(newest * 1000)


def scan() -> list[dict]:
    """One row per installed plugin, biggest first (by what could be read). A size is None when unknown."""
    home = Path(decky.DECKY_HOME)
    rows = []
    for manifest_path in (home / "plugins").glob("*/plugin.json"):
        folder = manifest_path.parent.name
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            name = manifest["name"]
        except (OSError, ValueError, KeyError, TypeError):
            name = folder
        facts = {area: folder_facts(home / area / folder) for area in AREAS}
        rows.append(
            {
                "folder": folder,
                "name": str(name)[:100],
                "sizes": {area: None if found is None else found[0] for area, found in facts.items()},
                "logsChanged": None if facts["logs"] is None else facts["logs"][1],
            }
        )
    return sorted(rows, key=lambda row: (-sum(size or 0 for size in row["sizes"].values()), row["name"].casefold()))


class HealthMixin:
    async def scan_plugin_health(self):
        return {"plugins": await asyncio.to_thread(scan)}
