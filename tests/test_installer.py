"""installer/install-deckyhub.sh, run for real as root against stand-ins: curl serves
local files, systemctl records its calls, and the home folder is a temporary one
(DECKYHUB_USER_HOME). Needs root or passwordless sudo (GitHub's runners have it)."""
import hashlib
import os
import shutil
import stat
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "installer" / "install-deckyhub.sh"
DESKTOP = ROOT / "installer" / "Install-DeckyHub.desktop"
TAG = "v9.9.9"

CURL = """#!/bin/bash
# -Is <url>: a reachability check. Otherwise: -o <file> <url>, served from $FIXTURES.
out=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    -I*) echo "HTTP/2 200"; exit 0 ;;
    http*) url="$1" ;;
  esac
  shift
done
echo "$url" >> "$FIXTURES/curl.log"
case "$url" in
  *decky-installer*install_release.sh) cp "$FIXTURES/install_release.sh" "$out" ;;
  *DeckyHub-*.zip) cp "$FIXTURES/DeckyHub.zip" "$out" ;;
  github.com) : ;;
  *) exit 22 ;;
esac
"""
# Decky's installer, as far as this script can tell: it leaves services/PluginLoader.
DECKY = """#!/bin/bash
mkdir -p "$DECKYHUB_USER_HOME/homebrew/services" "$DECKYHUB_USER_HOME/homebrew/plugins"
touch "$DECKYHUB_USER_HOME/homebrew/services/PluginLoader"
"""
SYSTEMCTL = '#!/bin/bash\necho "$*" >> "$FIXTURES/systemctl.log"\n'


def can_be_root() -> bool:
    return os.geteuid() == 0 or subprocess.run(["sudo", "-n", "true"], capture_output=True).returncode == 0


@unittest.skipUnless(shutil.which("bash") and shutil.which("unzip") and can_be_root(), "needs bash, unzip and root or passwordless sudo")
class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(subprocess.run, ["sudo", "-n", "rm", "-rf", str(self.dir)] if os.geteuid() else ["rm", "-rf", str(self.dir)])
        self.home, self.fixtures, self.bin = self.dir / "home", self.dir / "fixtures", self.dir / "bin"
        for folder in (self.home, self.fixtures, self.bin):
            folder.mkdir()
        for name, text in (("curl", CURL), ("systemctl", SYSTEMCTL)):
            (self.bin / name).write_text(text)
            (self.bin / name).chmod(0o755)
        (self.fixtures / "install_release.sh").write_text(DECKY)
        with zipfile.ZipFile(self.fixtures / "DeckyHub.zip", "w") as archive:
            archive.writestr("DeckyHub/plugin.json", '{"name": "DeckyHub"}')
            archive.writestr("DeckyHub/dist/index.js", "// new")
        self.sha256 = hashlib.sha256((self.fixtures / "DeckyHub.zip").read_bytes()).hexdigest()

    def run_installer(self, sha256=None, extra_args=()):
        script = self.dir / "install-deckyhub.sh"
        script.write_text(SCRIPT.read_text().replace("@TAG@", TAG).replace("@SHA256@", sha256 or self.sha256))
        env = {"PATH": f"{self.bin}:/usr/bin:/bin", "FIXTURES": str(self.fixtures), "DECKYHUB_USER_HOME": str(self.home), "HOME": str(self.home)}
        command = ["env", *[f"{key}={value}" for key, value in env.items()], "bash", str(script), *extra_args]
        return subprocess.run(command if os.geteuid() == 0 else ["sudo", "-n", *command], capture_output=True, text=True, timeout=60)

    def plugin(self, path):
        return self.home / "homebrew" / "plugins" / "DeckyHub" / path

    def test_installs_decky_loader_first_when_it_is_missing(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Decky Loader installed", result.stdout)
        self.assertIn("DeckyHub", result.stdout)
        self.assertIn("installed", result.stdout)
        self.assertTrue((self.home / "homebrew" / "services" / "PluginLoader").exists())
        self.assertEqual(self.plugin("dist/index.js").read_text(), "// new")
        self.assertIn("restart plugin_loader", (self.fixtures / "systemctl.log").read_text())
        self.assertIn(f"releases/download/{TAG}/DeckyHub-{TAG}.zip", (self.fixtures / "curl.log").read_text())

    def test_with_decky_installed_it_replaces_deckyhub_only(self):
        (self.home / "homebrew" / "services").mkdir(parents=True)
        (self.home / "homebrew" / "services" / "PluginLoader").touch()
        self.plugin("dist").mkdir(parents=True)
        self.plugin("dist/index.js").write_text("// old")
        self.plugin("stale.txt").write_text("from the old version")
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("DeckyHub updated to", result.stdout)
        self.assertNotIn("install_release.sh", (self.fixtures / "curl.log").read_text())
        self.assertEqual(self.plugin("dist/index.js").read_text(), "// new")
        self.assertFalse(self.plugin("stale.txt").exists())

    def test_success_message_includes_release_tag(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(TAG, result.stdout)

    def test_update_only_skips_decky_loader(self):
        """--update-only installs DeckyHub even when Decky Loader is absent."""
        result = self.run_installer(extra_args=("--update-only",))
        self.assertEqual(result.returncode, 0, result.stderr)
        # Decky Loader installer was NOT downloaded.
        curl_log = (self.fixtures / "curl.log").read_text()
        self.assertNotIn("install_release.sh", curl_log)
        # DeckyHub ZIP was downloaded and installed.
        self.assertIn(f"releases/download/{TAG}/DeckyHub-{TAG}.zip", curl_log)
        self.assertEqual(self.plugin("dist/index.js").read_text(), "// new")

    def test_a_zip_other_than_the_releases_is_refused_and_nothing_changes(self):
        (self.home / "homebrew" / "services").mkdir(parents=True)
        (self.home / "homebrew" / "services" / "PluginLoader").touch()
        self.plugin("dist").mkdir(parents=True)
        self.plugin("dist/index.js").write_text("// old")
        result = self.run_installer(sha256="0" * 64)
        self.assertEqual(result.returncode, 1)
        self.assertIn("doesn't match the expected checksum", result.stderr)
        self.assertEqual(self.plugin("dist/index.js").read_text(), "// old")
        self.assertFalse((self.fixtures / "systemctl.log").exists())


class DesktopFileTests(unittest.TestCase):
    def test_the_launcher_runs_its_own_releases_installer(self):
        text = DESKTOP.read_text()
        self.assertTrue(text.startswith("#!/usr/bin/env xdg-open\n[Desktop Entry]\n"))
        self.assertIn("Terminal=false", text)
        self.assertIn("https://github.com/mazillka/deckyhub-plugin/releases/download/@TAG@/install-deckyhub.sh", text)
        self.assertIn("@TAG@", SCRIPT.read_text())
        self.assertIn("@SHA256@", SCRIPT.read_text())

    def test_new_release_files_stay_out_of_the_self_update_and_registry_filters(self):
        # Self-update takes /^DeckyHub-.*\\.zip$/ (listDeckyHubReleases), the registry's entry
        # for DeckyHub takes names containing "deckyhub-": the extra files must match neither.
        import re
        for name in ("DeckyHub.zip", "Install-DeckyHub.desktop", "install-deckyhub.sh"):
            self.assertIsNone(re.match(r"^DeckyHub-.*\.zip$", name, re.I), name)
            self.assertNotIn("deckyhub-", name.casefold(), name)


if __name__ == "__main__":
    unittest.main()
