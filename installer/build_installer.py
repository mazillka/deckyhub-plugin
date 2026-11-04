"""Fills in installer/install-deckyhub.sh for one release: its tag, its ZIP's SHA-256 and the
optional plugins from starter-plugins.json. release.yml runs it; the tests use fill() too.

  python installer/build_installer.py TAG SHA256 > install-deckyhub.sh
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Everything ends up inside single quotes in a shell array: only plain characters pass.
SAFE = re.compile(r"[A-Za-z0-9 ._,;:()/+\-]+")


def starter_lines(path: Path = HERE / "starter-plugins.json") -> str:
    lines = []
    for plugin in json.loads(path.read_text(encoding="utf-8"))["plugins"]:
        fields = [plugin[key] for key in ("id", "name", "repo", "description")]
        if not all(SAFE.fullmatch(field) for field in fields):
            raise SystemExit(f"starter-plugins.json: unsafe characters in {plugin.get('id')}")
        lines.append("    '" + "|".join(fields) + "'")
    return "\n".join(lines)


def fill(template: str, tag: str, sha256: str, starter: str | None = None) -> str:
    return (template.replace("@TAG@", tag).replace("@SHA256@", sha256)
            .replace("@STARTER_PLUGINS@", starter_lines() if starter is None else starter))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    # Bytes, so Windows doesn't re-encode it and the script keeps its LF line endings.
    sys.stdout.buffer.write(fill((HERE / "install-deckyhub.sh").read_bytes().decode("utf-8"), sys.argv[1], sys.argv[2]).encode("utf-8"))
