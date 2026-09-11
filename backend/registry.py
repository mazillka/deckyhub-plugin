import json
from pathlib import Path


def parse_registry(payload: object) -> list[dict]:
    """Validate the portable registry format and ignore malformed records."""
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1 or not isinstance(payload.get("apps"), list):
        raise ValueError("Unsupported registry format")
    required = {"id", "name", "repo", "category", "versionStrategy", "source", "asset"}
    return [app for app in payload["apps"] if required <= app.keys() and "/" in app["repo"]]


def load_registry(plugin_dir: str) -> list[dict]:
    """Load the editable bundled registry."""
    path = Path(plugin_dir) / "registry" / "apps.json"
    return parse_registry(json.loads(path.read_text(encoding="utf-8")))
