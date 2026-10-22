"""Copy mazillka/deckyhub-registry's apps.json into registry/ and rebuild README's table.

    python devtools/sync-registry.py                # from the registry repo's main
    python devtools/sync-registry.py PATH/apps.json # from a local checkout or branch
    python devtools/sync-registry.py --pr           # all of it as a pull request

--pr does the whole routine after a registry PR merges: a fresh branch from
origin/main, the sync, the next pre-release version in package.json, the backend
tests, a commit, a push and `gh pr create`. It needs a clean working tree and
stops without a branch when there's nothing to sync.

Older DeckyHub releases still download this repository's copy, and CI fails
until it matches the registry repo byte for byte.
"""
import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://raw.githubusercontent.com/mazillka/deckyhub-registry/refs/heads/main/registry/apps.json"
REGISTRY = ROOT / "registry" / "apps.json"
README = ROOT / "README.md"
PACKAGE = ROOT / "package.json"
# The table is the run of "| ..." lines right after its header and separator.
TABLE = re.compile(r"(\| Tool \| Category \| Repository \|\n\| --- \| --- \| --- \|\n)(?:\|.*\n)*")


def sync(raw: bytes) -> None:
    apps = json.loads(raw)["apps"]
    REGISTRY.write_bytes(raw.replace(b"\r\n", b"\n"))
    rows = [f"| {app['name']} | {app['category']} | [{app['repo']}](https://github.com/{app['repo']}) |" for app in apps]
    text, count = TABLE.subn(lambda match: match.group(1) + "\n".join(rows) + "\n", README.read_text(encoding="utf-8"), count=1)
    if count != 1:
        sys.exit("README's Bundled repositories table not found")
    README.write_text(text, encoding="utf-8", newline="\n")
    print(f"Synced {len(apps)} apps")


def next_prerelease(version: str) -> str:
    """2.1.1-rc.3 -> 2.1.1-rc.4; a stable 2.1.1 -> 2.1.2-rc.1 (registry PRs ship as pre-releases)."""
    if match := re.fullmatch(r"(\d+\.\d+\.\d+)-rc\.(\d+)", version):
        return f"{match[1]}-rc.{int(match[2]) + 1}"
    if match := re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", version):
        return f"{match[1]}.{match[2]}.{int(match[3]) + 1}-rc.1"
    sys.exit(f"Don't know the next pre-release after {version!r}; bump package.json by hand")


def describe_changes(before: list[dict], after: list[dict]) -> list[str]:
    """One line per app added, removed or changed (matched by id), for the PR title and body."""
    old, new = {app["id"]: app for app in before}, {app["id"]: app for app in after}
    kept_old, kept_new = [id for id in old if id in new], [id for id in new if id in old]
    return [f"Added {new[id]['name']} ({new[id]['repo']})" for id in new if id not in old] + \
        [f"Removed {old[id]['name']} ({old[id]['repo']})" for id in old if id not in new] + \
        [f"Updated {new[id]['name']} ({new[id]['repo']})" for id in kept_new if new[id] != old[id]] + \
        (["Reordered entries"] if kept_old != kept_new else [])


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, text=True, capture_output=True).stdout.strip()


def pull_request() -> None:
    if git("status", "--porcelain", "--untracked-files=no"):
        sys.exit("Commit or stash your changes first: --pr starts a new branch from origin/main")
    start = git("branch", "--show-current") or "main"
    git("fetch", "origin", "main")
    branch = f"sync-registry-{time.strftime('%Y-%m-%d-%H%M%S')}"
    git("switch", "-c", branch, "origin/main")
    # Compared as text, not via git status: with core.autocrlf a rewritten file shows
    # as modified even when only its line endings differ.
    old_registry, old_readme = REGISTRY.read_text(encoding="utf-8"), README.read_text(encoding="utf-8")
    before = json.loads(old_registry)["apps"]
    raw = urllib.request.urlopen(URL, timeout=30).read()
    sync(raw)
    if (old_registry, old_readme) == (REGISTRY.read_text(encoding="utf-8"), README.read_text(encoding="utf-8")):
        git("checkout", "--", str(REGISTRY), str(README))
        git("switch", start)
        git("branch", "-D", branch)
        print("Already in sync; nothing to do")
        return
    changes = describe_changes(before, json.loads(raw)["apps"]) or ["Formatting only"]
    package = PACKAGE.read_text(encoding="utf-8")
    version = next_prerelease(json.loads(package)["version"])
    PACKAGE.write_text(re.sub(r'("version":\s*")[^"]+"', rf'\g<1>{version}"', package, count=1), encoding="utf-8", newline="\n")
    subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests"], cwd=ROOT, check=True)
    added = [line.removeprefix("Added ").split(" (")[0] for line in changes if line.startswith("Added ")]
    # Same title shape as hand-made registry PRs, e.g. "feat: add X to the registry (2.1.1-rc.1)".
    title = f"feat: add {', '.join(added)} to the registry ({version})" if added and len(added) == len(changes) else f"feat: sync the registry ({version})"
    body = "\n".join([
        f"Syncs `registry/apps.json` and README's **Bundled repositories** table from [mazillka/deckyhub-registry](https://github.com/mazillka/deckyhub-registry), and bumps to {version} for a pre-release.",
        "",
        *(f"- {line}" for line in changes),
        "",
        "Opened by `python devtools/sync-registry.py --pr`.",
    ])
    git("add", str(REGISTRY), str(README), str(PACKAGE))
    git("commit", "-m", title)
    git("push", "-u", "origin", branch)
    subprocess.run(["gh", "pr", "create", "--base", "main", "--head", branch, "--title", title, "--body", body], cwd=ROOT, check=True)


def main() -> None:
    if "--pr" in sys.argv:
        pull_request()
    else:
        sync(Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(URL, timeout=30).read())


if __name__ == "__main__":
    main()
