"""Fills in installer/install-deckyhub.sh for one release: its tag, its ZIP's SHA-256, the
optional plugins from starter-plugins.json and its texts in every language (installer/i18n/, plus
a few the app already has in src/i18n/). release.yml runs it; the tests use fill() too.

  python installer/build_installer.py TAG SHA256 > install-deckyhub.sh
"""
import json
import re
import shlex
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Everything ends up inside single quotes in a shell array: only plain characters pass.
SAFE = re.compile(r"[A-Za-z0-9 ._,;:()/+\-]+")
# The app's languages (src/i18n/<code>.ts); the installer's own texts are in i18n/<code>.json.
LANGUAGES = ("en", "uk", "ru", "es", "de", "fr", "pt", "ptPT", "it", "pl", "tr", "nl", "cs", "ja", "ko", "zh", "zhTW")
WARNINGS = ("blocked", "private-data", "persistence", "not-in-source", "obfuscated", "no-tls-check", "runs-downloads", "vulnerable")
# Texts the app already has, so the installer says the same: installer key -> app key.
APP_KEYS = {"app.install": "appcard.install", "app.update": "appcard.update", "app.cancel": "content.cancel",
            "app.ai": "appcard.ai", "app.root": "appcard.runsAsRoot",
            **{f"app.warning.{key}": f"appcard.warning.{key}" for key in WARNINGS}}


def starter_lines(path: Path = HERE / "starter-plugins.json") -> str:
    lines = []
    for plugin in json.loads(path.read_text(encoding="utf-8"))["plugins"]:
        fields = [plugin[key] for key in ("id", "name", "repo", "description")]
        tag = plugin.get("tag", "")  # which releases to follow; empty: all
        category = plugin.get("category", "")
        if not all(SAFE.fullmatch(field) for field in [*fields, category]) or (tag and not SAFE.fullmatch(tag)):
            raise SystemExit(f"starter-plugins.json: a missing category or unsafe characters in {plugin.get('id')}")
        lines.append("    '" + "|".join([*fields, tag, category]) + "'")
    return "\n".join(lines)


def messages(code: str) -> dict[str, str]:
    """The installer's texts in one language: its own i18n/<code>.json, plus APP_KEYS from the app."""
    app_text = (HERE.parent / "src" / "i18n" / f"{code}.ts").read_text(encoding="utf-8")
    app = {key: json.loads(value) for key, value in re.findall(r'^\s*"([^"]+)": (".*"),?$', app_text, re.M)}
    own = json.loads((HERE / "i18n" / f"{code}.json").read_text(encoding="utf-8"))
    return {**own, **{ours: app[theirs] for ours, theirs in APP_KEYS.items()}}


def message_lines() -> str:
    """messages(): a bash function that fills the array T with one language's texts."""
    lines = ["messages() {", '    case "$1" in']
    for code in LANGUAGES:
        lines.append(f"    {code})")
        for key, text in messages(code).items():
            if not re.fullmatch(r"[\w.-]+", key) or re.search(r"[\\\x00-\x09\x0b-\x1f]", text):
                raise SystemExit(f"i18n/{code}.json: {key} has a backslash or a control character")
            # Line breaks become the two characters \n, which zenity and printf %b read as line breaks.
            lines.append(f"        T[{key}]={shlex.quote(text.replace(chr(10), chr(92) + 'n'))}")
        lines.append("        ;;")
    lines += ["    esac", "}"]
    return "\n".join(lines)


def fill(template: str, tag: str, sha256: str, starter: str | None = None) -> str:
    return (template.replace("@TAG@", tag).replace("@SHA256@", sha256)
            .replace("@STARTER_PLUGINS@", starter_lines() if starter is None else starter)
            .replace("@MESSAGES@", message_lines()))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    # Bytes, so Windows doesn't re-encode it and the script keeps its LF line endings.
    sys.stdout.buffer.write(fill((HERE / "install-deckyhub.sh").read_bytes().decode("utf-8"), sys.argv[1], sys.argv[2]).encode("utf-8"))
