"""Install pinned Linux wheels into a staged DeckyHub package."""

import pathlib
import subprocess
import sys

vendor = pathlib.Path(sys.argv[1]) / "py_modules" / "deckyhub_vendor"
requirements = pathlib.Path(__file__).resolve().parents[1] / "requirements-remote.txt"
for minor in (11, 14):
    abi = f"cp3{minor}"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--no-compile",
            "--only-binary=:all:",
            # requirements-remote.txt lists each wheel's SHA-256 (devtools/hash-remote.py).
            "--require-hashes",
            "--platform",
            "manylinux2014_x86_64",
            "--platform",
            "manylinux_2_28_x86_64",
            "--python-version",
            f"3.{minor}",
            "--implementation",
            "cp",
            "--abi",
            abi,
            "--target",
            str(vendor / abi),
            "-r",
            str(requirements),
        ],
        check=True,
    )
