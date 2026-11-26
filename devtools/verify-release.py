"""Validate the actual distributable, including paths and accidentally packed secrets."""

import json
import sys
from pathlib import PurePosixPath
from zipfile import ZipFile

with ZipFile(sys.argv[1]) as archive:
    entries = archive.infolist()
    files = {entry.filename for entry in entries if not entry.is_dir()}
    assert len(files) == sum(not entry.is_dir() for entry in entries), "Duplicate archive paths"
    required = {
        f"DeckyHub/{name}"
        for name in (
            "main.py",
            "plugin.json",
            "package.json",
            "LICENSE.md",
            "dist/index.js",
            "py_modules/deckyhub/registry.py",
        )
    }
    assert required <= files, f"Missing: {sorted(required - files)}"
    for entry in entries:
        path = PurePosixPath(entry.filename)
        assert not path.is_absolute() and ".." not in path.parts and "\\" not in entry.filename
        assert path.parts[0] == "DeckyHub", f"Unexpected root: {entry.filename}"
        if entry.is_dir():
            continue
        name = path.name.lower()
        # certifi's bundle is public CA certificates, which the vendored Remote Install libraries need.
        if path.parts[:3] == ("DeckyHub", "py_modules", "deckyhub_vendor") and path.parts[-2:] == (
            "certifi",
            "cacert.pem",
        ):
            continue
        assert not (
            name in {".env", ".npmrc", ".pypirc", "id_rsa", "id_ed25519"}
            or name.startswith(".env.")
            or name.endswith((".pem", ".key", ".pyc", ".map"))
            or "__pycache__" in path.parts
            or ".git" in path.parts
        ), f"Unexpected file: {entry.filename}"
    package = json.loads(archive.read("DeckyHub/package.json"))
    with open("package.json", encoding="utf-8") as source:
        version = json.load(source)["version"]
    assert package.get("name") == "deckyhub" and package.get("version") == version, "Invalid package metadata"
    assert sum(entry.file_size for entry in entries) < 32 * 1024 * 1024, "Release exceeds 32 MiB budget"
print(f"Release verified: {len(files)} files")
