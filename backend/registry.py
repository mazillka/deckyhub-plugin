import json
from pathlib import Path


def load_registry(plugin_dir: str) -> list[dict]:
    """Load the editable bundled registry; malformed records are ignored."""
    path = Path(plugin_dir) / "registry" / "apps.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != 1 or not isinstance(payload.get("apps"), list):
        raise ValueError("Unsupported registry format")
    required = {"id", "name", "repo", "category", "versionStrategy", "source", "asset"}
    return [app for app in payload["apps"] if required <= app.keys() and "/" in app["repo"]]
