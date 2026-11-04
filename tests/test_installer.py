"""installer/install-deckyhub.sh, run for real as root against stand-ins: curl serves
local files, systemctl records its calls, and the home folder is a temporary one
(DECKYHUB_USER_HOME). Needs root or passwordless sudo (GitHub's runners have it)."""
import hashlib
import json
import os
import shutil
import stat
import subprocess
import tempfile
import sys
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "installer"))
from build_installer import fill, starter_lines  # noqa: E402  (what release.yml fills the installer in with)
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

    def run_installer(self, sha256=None, extra_args=(), picks=None):
        script = self.dir / "install-deckyhub.sh"
        script.write_text(fill(SCRIPT.read_text(), TAG, sha256 or self.sha256))
        env = {"PATH": f"{self.bin}:/usr/bin:/bin", "FIXTURES": str(self.fixtures), "DECKYHUB_USER_HOME": str(self.home), "HOME": str(self.home)}
        if picks is not None:
            env["DECKYHUB_PICKS"] = picks
        command = ["env", *[f"{key}={value}" for key, value in env.items()], "bash", str(script), *extra_args]
        return subprocess.run(command if os.geteuid() == 0 else ["sudo", "-n", *command], capture_output=True, text=True, timeout=60)

    def plugin(self, path):
        return self.home / "homebrew" / "plugins" / "DeckyHub" / path

    def test_installs_decky_loader_first_when_it_is_missing(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("All done!", result.stdout)
        self.assertIn("✓ Decky Loader installed", result.stdout)
        self.assertIn(f"✓ DeckyHub {TAG} installed (file checked)", result.stdout)
        self.assertIn("✓ Decky Loader restarted", result.stdout)
        self.assertIn("choose DeckyHub", result.stdout)
        # Every step is announced, numbered: password, Decky Loader, download, install, restart.
        for number, text in ((2, "Installing Decky Loader"), (3, "Downloading DeckyHub"), (4, "Installing DeckyHub"), (5, "Restarting Decky Loader")):
            self.assertIn(f"Step {number} of 5: {text}", result.stdout)
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
        self.assertIn(f"✓ DeckyHub updated to {TAG} (file checked)", result.stdout)
        self.assertNotIn("✓ Decky Loader installed", result.stdout)
        # Decky Loader is checked first, DeckyHub only after it.
        self.assertIn("Step 2 of 5: Checking that Decky Loader is installed", result.stdout)
        self.assertIn("Step 5 of 5: Restarting Decky Loader", result.stdout)
        self.assertIn("✓ Decky Loader was already installed", result.stdout)
        self.assertNotIn("install_release.sh", (self.fixtures / "curl.log").read_text())
        self.assertEqual(self.plugin("dist/index.js").read_text(), "// new")
        self.assertFalse(self.plugin("stale.txt").exists())

    def test_success_message_includes_release_tag(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(TAG, result.stdout)

    def test_the_same_version_is_reinstalled_not_updated(self):
        (self.home / "homebrew" / "services").mkdir(parents=True)
        (self.home / "homebrew" / "services" / "PluginLoader").touch()
        self.plugin("dist").mkdir(parents=True)
        self.plugin("package.json").write_text('{"name": "deckyhub", "version": "%s"}' % TAG.lstrip("v"))
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f"✓ DeckyHub {TAG} reinstalled (file checked)", result.stdout)
        self.assertNotIn("updated to", result.stdout)

    def test_the_intro_names_install_update_and_reinstall(self):
        text = SCRIPT.read_text()
        for word in ('verb="Install"', 'verb="Update"', 'verb="Reinstall"'):
            self.assertIn(word, text)

    def pending_file(self):
        return self.home / "homebrew" / "settings" / "DeckyHub" / "pending-installs.json"

    def test_picked_plugins_are_saved_for_deckyhub_before_it_restarts(self):
        result = self.run_installer(picks="mako-decky,css-loader,not-in-the-list")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(self.pending_file().read_text()), ["eugeniosegala/MAKO", "DeckThemes/SDH-CssLoader"])
        self.assertIn("✓ 2 optional plugin(s) chosen", result.stdout)
        self.assertIn("You are responsible for what you install", result.stdout)
        # The installer itself downloads nothing but Decky Loader and DeckyHub.
        self.assertNotIn("MAKO", (self.fixtures / "curl.log").read_text())

    def test_without_picks_nothing_is_saved(self):
        for picks in (None, ""):
            result = self.run_installer(picks=picks)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(self.pending_file().exists())
            self.assertNotIn("optional plugin", result.stdout)

    def test_the_checklist_starts_unticked_and_names_the_risks(self):
        text = SCRIPT.read_text()
        self.assertIn('rows+=(FALSE "$id"', text)  # nothing is ticked by default
        # Only Decky Loader and DeckyHub are ticked (always installed, so they come first and say Required).
        picker = text.split("choose_plugins()")[1].split("# Not root yet")[0]
        self.assertEqual(picker.count("TRUE"), 2)
        self.assertIn('rows+=(TRUE "decky-loader"', picker)
        self.assertIn('rows+=(TRUE "deckyhub"', picker)
        self.assertIn("<b>Decky Loader and DeckyHub are installed either way.</b>", picker)
        # The notice sits right above the table, after the explanation of the notes.
        self.assertLess(picker.index("${NOTES_EXPLAINED}"), picker.index("${RESPONSIBILITY}"))
        self.assertLess(picker.index("${RESPONSIBILITY}"), picker.index("--column=Pick"))
        self.assertIn("Required: ", picker)
        # Each plugin's cell ends with where its source lives.
        self.assertEqual(picker.count('"github.com/'), 3)
        self.assertIn('"github.com/${repo}"', picker)
        # Names are links in the text, so the table has no page or stars columns of its own.
        self.assertNotIn("Details and security scans\"", picker)
        self.assertNotIn("--column=\"Stars and downloads\"", picker)
        self.assertEqual(picker.count("--column="), 5)
        for phrase in ("You are responsible for what you install", "AI-assisted", "Runs as root", "Warning: ", r'<a href=\"https://deckyhub.com/plugins/${id}.html\">${name}</a>', "Click a plugin's name", "look at its DeckyHub page and its author's GitHub page before you install it", '(<a href=\"https://github.com/${repo}\">GitHub</a>)',
                       "What the notes mean:", "grouped by category", "GitHub stars and downloads", "Latest version: ${versions[i]:-unknown}", "Version: ${TAG}", "newest release today", "No warnings: the audit found nothing", "Not checked: the notes couldn't be loaded", "changes system startup", "has hidden code"):
            self.assertIn(phrase, text)

    def test_the_release_fills_in_every_placeholder_and_the_hand_picked_list(self):
        filled = fill(SCRIPT.read_text(), TAG, self.sha256)
        self.assertNotIn("@TAG@", filled)
        self.assertNotIn("@SHA256@", filled)
        self.assertNotIn("@STARTER_PLUGINS@", filled)
        starter = [line.strip().strip("'").split("|")[0] for line in starter_lines().splitlines()]
        self.assertEqual(starter, ["decky-lsfg-vk", "mako-decky", "decky-multiframegen", "decky-framegen", "css-loader", "protondb-decky"])
        # id|name|repo|what it does|release tag to follow|category: MAKO follows its plugin releases only.
        lines = [line.strip().strip("'").split("|") for line in starter_lines().splitlines()]
        self.assertTrue(all(len(fields) == 6 for fields in lines))
        # Grouped by category: each category's plugins sit together.
        categories = [fields[5] for fields in lines]
        self.assertEqual(categories, ["Frame Generation"] * 4 + ["Customization", "Game Libraries"])
        self.assertEqual({fields[0]: fields[4] for fields in lines if fields[4]}, {"mako-decky": "plugin-v"})

    def test_the_starter_list_refuses_characters_that_could_break_the_shell(self):
        bad = self.dir / "bad.json"
        bad.write_text(json.dumps({"plugins": [{"id": "x", "name": "X", "repo": "o/x", "description": "$(touch /tmp/pwned)"}]}))
        with self.assertRaises(SystemExit):
            starter_lines(bad)

    def test_the_finish_message_says_nothing_was_collected(self):
        result = self.run_installer()
        self.assertIn("Nothing about you or your Deck was collected or sent", result.stdout)
        self.assertIn("temporary files are removed", result.stdout)

    def test_a_decky_loader_that_cant_restart_is_not_a_failure(self):
        (self.bin / "systemctl").write_text('#!/bin/bash\necho "$*" >> "$FIXTURES/systemctl.log"\nexit 1\n')
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.plugin("dist/index.js").read_text(), "// new")
        self.assertIn("Decky Loader couldn't restart by itself. Restart your Steam Deck", result.stdout)
        self.assertNotIn("✓ Decky Loader restarted", result.stdout)

    def test_errors_show_real_line_breaks_in_a_terminal(self):
        result = self.run_installer(sha256="0" * 64)
        self.assertNotIn("\\n", result.stderr)
        self.assertIn("This is usually a Wi-Fi hiccup", result.stderr)

    def test_the_intro_lists_the_steps_and_says_no_information_is_used(self):
        text = SCRIPT.read_text()
        self.assertIn("Here's what will happen:", text)
        self.assertIn("This will download and install Decky Loader and DeckyHub", text)
        self.assertIn("Decky Loader is already installed, so it's only checked.", text)
        self.assertIn("Why a password?", text)
        self.assertIn("You can also install DeckyHub without this installer", text)
        self.assertIn("#option-2-manual-zip", text)
        self.assertLess(text.index("Decky Loader comes first"), text.index("Only then is DeckyHub"))
        self.assertIn("not your Steam password", text)
        self.assertIn("nothing about you or your Deck is collected, saved or sent anywhere", text)
        self.assertIn("is never stored", text)
        self.assertIn("no guarantee", text)
        self.assertEqual(subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True).returncode, 0)

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
        self.assertIn("its checksum doesn't match", result.stderr)
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
