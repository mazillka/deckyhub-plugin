"""Rewrite requirements-remote.txt with the SHA-256 of every wheel package-remote.py may install.

    python devtools/hash-remote.py

Run it after changing a version there. The hashes come from PyPI's JSON API: each pinned
version's pure-Python and Linux x86_64 wheels. pip then refuses any other file
(--require-hashes), so a wheel replaced on PyPI or a mirror can't end up in a release.
"""

import json
import pathlib
import re
import urllib.request

path = pathlib.Path(__file__).resolve().parents[1] / "requirements-remote.txt"
text = path.read_text(encoding="utf-8")
header = "".join(line for line in text.splitlines(keepends=True) if line.startswith("#"))
pins = re.findall(r"^([A-Za-z0-9_.-]+)==([^\s\\]+)", text, re.M)
lines = []
for name, version in pins:
    with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/{version}/json", timeout=30) as response:
        files = json.load(response)["urls"]
    hashes = sorted(
        file["digests"]["sha256"] for file in files if re.search(r"-(any|manylinux\S*x86_64)\.whl$", file["filename"])
    )
    if not hashes:
        raise SystemExit(f"{name}=={version}: no pure-Python or Linux x86_64 wheel on PyPI")
    lines.append(f"{name}=={version}" + "".join(f" \\\n    --hash=sha256:{value}" for value in hashes))
path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
print(f"{len(pins)} packages hashed")
