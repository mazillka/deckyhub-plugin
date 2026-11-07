"""Folders DeckyHub reads and writes outside Decky's own settings, runtime and log folders.

Read these as `paths.NAME` at call time, not with `from ... import`: the tests and the
decky-mock bridge point them at temporary folders.
"""

from pathlib import Path

import decky

# The plugin's own folder (package.json, main.py), two levels above py_modules/deckyhub/.
PLUGIN_DIR = str(Path(__file__).resolve().parents[2])
# Decky sets DECKY_USER_HOME to the user it runs for, which isn't "deck" on every device.
DEFAULT_DOWNLOAD_DIR = str(Path(getattr(decky, "DECKY_USER_HOME", "/home/deck")) / "Downloads")
PLUGIN_DOWNLOAD_DIR = f"{DEFAULT_DOWNLOAD_DIR}/deckyhub"
