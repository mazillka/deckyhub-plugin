"""installer/install-deckyhub.sh, run for real as root against stand-ins: curl serves
local files, systemctl records its calls, and the home folder is a temporary one
(DECKYHUB_USER_HOME). Needs root or passwordless sudo (GitHub's runners have it)."""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "installer"))
# What release.yml fills the installer in with.
from build_installer import LANGUAGES, fill, messages, starter_lines

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


@unittest.skipUnless(
    shutil.which("bash") and shutil.which("unzip") and can_be_root(), "needs bash, unzip and root or passwordless sudo"
)
class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(
            subprocess.run, ["sudo", "-n", "rm", "-rf", str(self.dir)] if os.geteuid() else ["rm", "-rf", str(self.dir)]
        )
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

    def run_installer(self, sha256=None, extra_args=(), picks=None, locale=None):
        script = self.dir / "install-deckyhub.sh"
        script.write_text(fill(SCRIPT.read_text(), TAG, sha256 or self.sha256))
        env = {
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "FIXTURES": str(self.fixtures),
            "DECKYHUB_USER_HOME": str(self.home),
            "HOME": str(self.home),
        }
        if picks is not None:
            env["DECKYHUB_PICKS"] = picks
        env.update(locale or {})
        command = ["env", *[f"{key}={value}" for key, value in env.items()], "bash", str(script), *extra_args]
        return subprocess.run(
            command if os.geteuid() == 0 else ["sudo", "-n", *command], capture_output=True, text=True, timeout=60
        )

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
        for number, text in (
            (2, "Installing Decky Loader"),
            (3, "Downloading DeckyHub"),
            (4, "Installing DeckyHub"),
            (5, "Restarting Decky Loader"),
        ):
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

    def pending_file(self):
        return self.home / "homebrew" / "settings" / "DeckyHub" / "pending-installs.json"

    def test_picked_plugins_are_saved_for_deckyhub_before_it_restarts(self):
        result = self.run_installer(picks="mako-decky,css-loader,not-in-the-list")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads(self.pending_file().read_text()), ["eugeniosegala/MAKO", "DeckThemes/SDH-CssLoader"]
        )
        self.assertIn("✓ 2 optional plugin(s) chosen", result.stdout)
        self.assertIn("You install them at your own risk", result.stdout)
        self.assertIn("it isn't responsible for anything they do to your device or your data", result.stdout)
        # The installer itself downloads nothing but Decky Loader and DeckyHub.
        self.assertNotIn("MAKO", (self.fixtures / "curl.log").read_text())

    def test_the_terminal_gets_no_markup_tags(self):
        result = self.run_installer(picks="mako-decky")
        self.assertEqual(result.returncode, 0, result.stderr)
        for tag in ("<b>", "</b>", "<span", "</span>"):
            self.assertNotIn(tag, result.stdout)
        self.assertIn("All done!", result.stdout)
        failed = self.run_installer(sha256="0" * 64)
        self.assertNotIn("<", failed.stderr)

    def test_without_picks_nothing_is_saved(self):
        for picks in (None, ""):
            result = self.run_installer(picks=picks)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(self.pending_file().exists())
            self.assertNotIn("optional plugin", result.stdout)

    def run_picker(self, add=(), overview_ok=True):
        """Runs choose_plugins() from the real script with a stand-in for zenity: returns (the PICKS it
        ends up with, [(ok label, zenity arguments, dialog text)] for every dialog it showed)."""
        text = fill(SCRIPT.read_text(), TAG, self.sha256)

        def one(pattern):
            return re.search(pattern, text, re.MULTILINE | re.DOTALL).group(0)

        parts = [
            one(r"^C_OK=.*\nOK_MARK=[^\n]*$"),
            one(r"^STARTER_PLUGINS=\(\n.*?^\)"),
            one(r"^INSTALLER_LANG=.*?^TITLE=[^\n]*$"),
            one(r"^PLUGINS_ARG=[^\n]*$"),
            one(r"^STATS_URL=[^\n]*$"),
            one(r"^RELEASES_URL=[^\n]*$"),
            one(r"^RESPONSIBILITY=[^\n]*$"),
            one(r"^installed_version\(\)[^\n]*$"),
            one(r"^plugin_notes\(\) \{\n.*?^\}"),
            one(r"^plugin_versions\(\) \{\n.*?^\}"),
            one(r"^choose_plugins\(\) \{\n.*?^\}"),
        ]
        log = self.dir / "dialogs.bin"
        harness = self.dir / "picker.sh"
        harness.write_text(
            "\n".join(parts)
            + """
has_zenity() { return 0; }
zen() {
    local text="" ok="" a
    for a in "$@"; do case "$a" in --text=*) text="${a#--text=}" ;; --ok-label=*) ok="${a#--ok-label=}" ;; esac; done
    printf '%s\\0%s\\0%s\\0' "$ok" "$*" "$text" >> "$DIALOGS"
    case "$ok" in
        "Show the plugins") return $OVERVIEW ;;
        "Add this plugin") for name in $ADD; do [[ "$text" == *"<b>${name//_/ }</b>"* ]] && return 0; done; return 1 ;;
    esac
    return 1
}
HAS_DECKY=1; HOMEBREW_CHECK=/nonexistent; TAG=v9.9.9; verb=Install
choose_plugins
echo "PICKS=$PICKS"
"""
        )
        env = {
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "DIALOGS": str(log),
            "OVERVIEW": "0" if overview_ok else "1",
            "ADD": " ".join(name.replace(" ", "_") for name in add),
        }
        result = subprocess.run(
            ["env", *[f"{key}={value}" for key, value in env.items()], "bash", str(harness)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        picks = re.search(r"^PICKS=(.*)$", result.stdout, re.MULTILINE).group(1)
        fields = log.read_bytes().decode().split("\0")[:-1] if log.exists() else []
        return picks, [tuple(fields[index : index + 3]) for index in range(0, len(fields), 3)]

    def test_the_picker_shows_the_overview_then_one_card_per_plugin_and_keeps_only_what_was_added(self):
        picks, dialogs = self.run_picker(add=("MAKO Decky", "CSS Loader"))
        self.assertEqual(picks, "mako-decky,css-loader")
        self.assertEqual([ok for ok, _, _ in dialogs], ["Show the plugins"] + ["Add this plugin"] * 6)
        # Nothing is added by accident: Skip has the focus in every dialog.
        for _, arguments, _ in dialogs:
            self.assertIn("--default-cancel", arguments)
        overview = dialogs[0][2]
        # The whole dialog has to fit a Deck's 800 px screen (zenity grows a dialog to its text and never scrolls it): about 15 lines.
        self.assertLessEqual(len(re.sub(r"<[^>]*>", "", overview).split("\\n")), 15)
        mako = next(text for _, _, text in dialogs if "<b>MAKO Decky</b>" in text)
        self.assertIn("Plugin 2 of 6", mako)
        self.assertIn('<a href="https://github.com/eugeniosegala/MAKO">', mako)
        self.assertIn('<a href="https://deckyhub.com/plugins/mako-decky.html">', mako)
        self.assertIn("You install it at your own risk", mako)
        self.assertIn("A clean audit isn't proof of safety", mako)

    def test_each_card_gets_its_categorys_icon(self):
        _, dialogs = self.run_picker()
        icons = {
            re.search(r"<b>([^<]+)</b>", text).group(1): re.search(r"--icon-name=(\S+)", arguments).group(1)
            for _, arguments, text in dialogs[1:]
        }
        self.assertEqual(icons["MAKO Decky"], "video-display")
        self.assertEqual(icons["CSS Loader"], "preferences-desktop-theme")
        self.assertEqual(icons["ProtonDB Badges"], "applications-games")

    def test_skipping_the_overview_or_every_card_picks_nothing(self):
        picks, dialogs = self.run_picker(add=("MAKO Decky",), overview_ok=False)
        self.assertEqual((picks, len(dialogs)), ("", 1))  # no cards were shown
        picks, _ = self.run_picker()
        self.assertEqual(picks, "")

    def test_the_release_fills_in_every_placeholder_and_the_hand_picked_list(self):
        filled = fill(SCRIPT.read_text(), TAG, self.sha256)
        self.assertNotIn("@TAG@", filled)
        self.assertNotIn("@SHA256@", filled)
        self.assertNotIn("@STARTER_PLUGINS@", filled)
        starter = [line.strip().strip("'").split("|")[0] for line in starter_lines().splitlines()]
        self.assertEqual(
            starter,
            ["decky-lsfg-vk", "mako-decky", "decky-multiframegen", "decky-framegen", "css-loader", "protondb-decky"],
        )
        # id|name|repo|what it does|release tag to follow|category: MAKO follows its plugin releases only.
        lines = [line.strip().strip("'").split("|") for line in starter_lines().splitlines()]
        self.assertTrue(all(len(fields) == 6 for fields in lines))
        # Grouped by category: each category's plugins sit together.
        categories = [fields[5] for fields in lines]
        self.assertEqual(categories, ["Frame Generation"] * 4 + ["Customization", "Game Libraries"])
        self.assertEqual({fields[0]: fields[4] for fields in lines if fields[4]}, {"mako-decky": "plugin-v"})

    def test_the_starter_list_refuses_characters_that_could_break_the_shell(self):
        bad = self.dir / "bad.json"
        bad.write_text(
            json.dumps({"plugins": [{"id": "x", "name": "X", "repo": "o/x", "description": "$(touch /tmp/pwned)"}]})
        )
        with self.assertRaises(SystemExit):
            starter_lines(bad)

    def test_the_finish_message_says_nothing_was_collected(self):
        result = self.run_installer()
        self.assertIn("Nothing about you or your device was collected or sent", result.stdout)
        self.assertIn("temporary files are removed", result.stdout)

    def test_a_decky_loader_that_cant_restart_is_not_a_failure(self):
        (self.bin / "systemctl").write_text('#!/bin/bash\necho "$*" >> "$FIXTURES/systemctl.log"\nexit 1\n')
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.plugin("dist/index.js").read_text(), "// new")
        self.assertIn("Decky Loader couldn't restart by itself. Restart your device", result.stdout)
        self.assertNotIn("✓ Decky Loader restarted", result.stdout)

    def test_errors_show_real_line_breaks_in_a_terminal(self):
        result = self.run_installer(sha256="0" * 64)
        self.assertNotIn("\\n", result.stderr)
        self.assertIn("This is usually a Wi-Fi hiccup", result.stderr)

    def test_a_system_language_gets_its_texts_and_an_unknown_one_english(self):
        result = self.run_installer(locale={"LANG": "uk_UA.UTF-8"})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Готово!", result.stdout)
        self.assertIn("Крок 3 з 5: Завантажуємо і перевіряємо DeckyHub", result.stdout)
        self.assertIn(f"✓ DeckyHub {TAG} встановлено (файл перевірено)", result.stdout)
        self.assertNotIn("All done!", result.stdout)
        # LC_ALL wins over LANG, and pt_PT is European Portuguese, not Brazilian.
        result = self.run_installer(locale={"LANG": "de_DE.UTF-8", "LC_ALL": "pt_PT.UTF-8"})
        self.assertIn("Está feito!", result.stdout)
        for locale in ({"LANG": "eo_XX.UTF-8"}, {"LANG": "C.UTF-8"}, {}):
            result = self.run_installer(locale=locale)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("All done!", result.stdout)
            self.assertIn("Step 5 of 5: Restarting Decky Loader", result.stdout)

    def test_the_intro_lists_the_steps_and_says_no_information_is_used(self):
        # A source check on purpose: this is the text a user reads before agreeing to anything, and
        # the intro runs only as a normal user with a screen, which these tests don't have.
        script = SCRIPT.read_text()
        for verb in ('verb="Install"', 'verb="Update"', 'verb="Reinstall"'):
            self.assertIn(verb, script)
        self.assertIn("#option-2-manual-zip", script)
        self.assertLess(script.index("t intro.stepDeckyInstall"), script.index("t intro.stepDownload"))
        text = "\n".join(messages("en").values())
        self.assertIn("Here's what will happen:", text)
        self.assertIn("This will download and install Decky Loader and DeckyHub", text)
        self.assertIn("Decky Loader is already installed, so it's only checked.", text)
        self.assertIn("Why a password?", text)
        self.assertIn("You can also install DeckyHub without this installer", text)
        self.assertIn("not your Steam password", text)
        self.assertIn("nothing about you or your device is collected, saved or sent anywhere", text)
        self.assertIn("is never stored", text)
        self.assertIn("no guarantee", text)
        self.assertEqual(subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True).returncode, 0)

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


class TranslationTests(unittest.TestCase):
    """The installer's texts in every app language (installer/i18n/, plus a few from src/i18n/)."""

    def test_every_language_has_every_text_with_the_same_placeholders_and_valid_markup(self):
        import xml.etree.ElementTree as ET

        english = messages("en")
        for code in LANGUAGES:
            texts = messages(code)
            self.assertEqual(list(texts), list(english), code)
            for key, text in texts.items():
                self.assertEqual(
                    sorted(re.findall(r"\{\w+\}", text)), sorted(re.findall(r"\{\w+\}", english[key])), f"{code} {key}"
                )
                # zenity reads Pango markup: tags must pair up and & must be &amp;.
                ET.fromstring("<t>" + re.sub(r"\{\w+\}", "x", text) + "</t>")

    def test_the_languages_are_the_apps(self):
        self.assertEqual(sorted(LANGUAGES), sorted(path.stem for path in (ROOT / "src" / "i18n").glob("*.ts")))
        self.assertEqual(sorted(LANGUAGES), sorted(path.stem for path in (ROOT / "installer" / "i18n").glob("*.json")))

    def test_the_launcher_has_every_languages_name_and_comment(self):
        text = DESKTOP.read_text(encoding="utf-8")
        desktop_codes = {"pt": "pt_BR", "ptPT": "pt", "zh": "zh_CN", "zhTW": "zh_TW"}
        for code in LANGUAGES:
            suffix = "" if code == "en" else f"[{desktop_codes.get(code, code)}]"
            texts = messages(code)
            self.assertIn(f"\nName{suffix}={texts['desktop.name']}\n", text)
            self.assertIn(f"\nComment{suffix}={texts['desktop.comment']}\n", text)


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
            self.assertIsNone(re.match(r"^DeckyHub-.*\.zip$", name, re.IGNORECASE), name)
            self.assertNotIn("deckyhub-", name.casefold(), name)


if __name__ == "__main__":
    unittest.main()
