"""Copy mazillka/deckyhub-registry's apps.json into registry/ and rebuild README's table.

    python devtools/sync-registry.py                # from the registry repo's main
    python devtools/sync-registry.py PATH/apps.json # from a local checkout or branch

Older DeckyHub releases still download this repository's copy, and CI fails
until it matches the registry repo byte for byte.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/refs/heads/main/registry/apps.json"

raw = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(URL, timeout=30).read()
apps = json.loads(raw)["apps"]
(ROOT / "registry" / "apps.json").write_bytes(raw.replace(b"\r\n", b"\n"))

rows = [f"| {app['name']} | {app['category']} | [{app['repo']}](https://github.com/{app['repo']}) |" for app in apps]
readme = ROOT / "README.md"
text = readme.read_text(encoding="utf-8")
# The table is the run of "| ..." lines right after its header and separator.
table = re.compile(r"(\| Tool \| Category \| Repository \|\n\| --- \| --- \| --- \|\n)(?:\|.*\n)*")
text, count = table.subn(lambda match: match.group(1) + "\n".join(rows) + "\n", text, count=1)
if count != 1:
    sys.exit("README's Bundled repositories table not found")
readme.write_text(text, encoding="utf-8", newline="\n")
print(f"Synced {len(apps)} apps")
