"""Owner-only file keeping Remote Install's paired devices and certificate across restarts."""

import contextlib
import json
import os
from pathlib import Path


class RemoteInstallStore:
    def __init__(self, path):
        self.path = Path(path)

    def load(self) -> dict:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        return data if isinstance(data, dict) else {}

    def save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_name(self.path.name + ".tmp")
        with open(temp, "w", encoding="utf-8", opener=lambda path, flags: os.open(path, flags, 0o600)) as file:
            with contextlib.suppress(OSError):
                os.chmod(temp, 0o600)
            json.dump(data, file)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, self.path)
