"""Install pinned Linux wheels into a staged DeckyHub package."""

import pathlib
import subprocess
import sys

target = pathlib.Path(sys.argv[1]) / "py_modules" / "deckyhub_vendor" / "cp314"
requirements = pathlib.Path(__file__).resolve().parents[1] / "requirements-remote.txt"
subprocess.run(
    [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--no-compile",
        "--only-binary=:all:",
        "--platform",
        "manylinux2014_x86_64",
        "--platform",
        "manylinux_2_28_x86_64",
        "--python-version",
        "3.14",
        "--implementation",
        "cp",
        "--abi",
        "cp314",
        "--target",
        str(target),
        "-r",
        str(requirements),
    ],
    check=True,
)
