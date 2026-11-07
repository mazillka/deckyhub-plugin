"""Checks for values that come from the frontend, the registry or files the user picked."""

import re
from urllib.parse import urlsplit

# owner/name, where neither part is only dots: the frontend puts this straight into
# api.github.com/repos/<repo>/releases with the user's token, so "../.." must not pass.
REPOSITORY_NAME = re.compile(r"(?!\.+/)[A-Za-z0-9_.-]+/(?!\.+$)[A-Za-z0-9_.-]+")
# A GitHub token: classic (ghp_ and kin) or fine-grained (github_pat_).
GITHUB_TOKEN = re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b")


def validate_registry_url(url: str) -> str:
    """Normalize a registry URL the user typed; raise ValueError if it can't be used.

    HTTPS only, and only paths that end in `.json`, so a mistyped URL fails with
    a clear message here instead of an opaque JSON parse error at load time.
    """
    url = url.strip() if isinstance(url, str) else ""
    if not url.startswith("https://"):
        raise ValueError("Registry URL must use HTTPS")
    if len(url) > 2048:
        raise ValueError("Registry URL is too long")
    if not urlsplit(url).path.lower().endswith(".json"):
        raise ValueError("Registry URL must point to a .json file")
    return url
