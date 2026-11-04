#!/bin/bash
# DeckyHub's Desktop Mode installer: installs Decky Loader first if it isn't there (with
# Decky's own installer), then DeckyHub, then restarts Decky. Started by
# Install-DeckyHub.desktop; release.yml fills in @TAG@ and @SHA256@ for the release it's
# attached to, so it installs exactly that release's ZIP and refuses any other file.
#
# Before anything happens it lists every step and says what it does with your information
# (nothing: no data is collected, stored or sent; the only requests go to GitHub). At the end
# a message says what was done and what to do next.
#
# The password handling follows Decky's own installer (SteamDeckHomebrew/decky-installer,
# gui/user_install_script.sh), so it feels the same: a dialog asks for the admin password,
# and a Deck without one can get a temporary password that's removed again at the end.
#
# Options:
#   --update-only   Skip Decky Loader installation; only install/update DeckyHub.
#                   Needs Decky Loader to be installed already.
#
# DECKYHUB_USER_HOME is for tests only: the home folder to install into.

TAG="@TAG@"
SHA256="@SHA256@"
REPO="mazillka/deckyhub-plugin"
ZIP_URL="https://github.com/${REPO}/releases/download/${TAG}/DeckyHub-${TAG}.zip"
DECKY_INSTALLER_URL="https://github.com/SteamDeckHomebrew/decky-installer/releases/latest/download/install_release.sh"
TITLE="DeckyHub Installer"
TEMP_PASSWORD="DeckyHub!"
UPDATE_ONLY=0

for arg in "$@"; do
    [ "$arg" = "--update-only" ] && UPDATE_ONLY=1
done

PRIVACY="Your privacy: this installer doesn't collect, store or send any information about you or your Deck. Your admin password is only handed to sudo on this Deck and is never saved or shared. The only network requests go to GitHub, to download the files named above."
WARRANTY="DeckyHub is a community project and comes as is, without warranty."

# Dialogs when zenity is there (SteamOS has it), plain text in the terminal otherwise. Texts
# use \n for line breaks: zenity understands it, the terminal gets printf %b.
has_zenity() { command -v zenity > /dev/null && [ -n "${DISPLAY}${WAYLAND_DISPLAY}" ]; }
zen() { zenity 2> >(grep -v 'Gtk' >&2) "$@"; }
say() { if has_zenity; then zen --title="$TITLE" --width=480 --info --text="$1"; else printf '%b\n' "$1"; fi; }
warn() { if has_zenity; then zen --title="$TITLE" --width=480 --warning --text="$1"; else printf '%b\n' "$1"; fi; }
fail() { if has_zenity; then zen --title="$TITLE" --width=480 --error --text="$1"; else printf 'Error: %b\n' "$1" >&2; fi; exit 1; }

# Not root yet: say what's going to happen, check GitHub is reachable, then get the admin
# password and run this script again as root.
if (( EUID != 0 )); then
    HOMEBREW_CHECK="${DECKYHUB_USER_HOME:-$HOME}/homebrew"
    HAS_DECKY=0; HAS_DECKYHUB=0
    [ -f "${HOMEBREW_CHECK}/services/PluginLoader" ] && HAS_DECKY=1
    [ -d "${HOMEBREW_CHECK}/plugins/DeckyHub" ] && HAS_DECKYHUB=1

    if (( UPDATE_ONLY && ! HAS_DECKY )); then
        fail "--update-only needs Decky Loader, and it isn't installed on this Deck.\n\nRun the installer without --update-only to install both."
    fi

    verb="Install"; (( HAS_DECKYHUB )) && verb="Update"
    steps=""; n=1
    add_step() { steps+="  ${n}. $1\n"; n=$((n + 1)); }
    add_step "Ask for your admin password, which is needed to write files and restart Decky Loader."
    (( HAS_DECKY || UPDATE_ONLY )) || add_step "Install Decky Loader, the plugin system DeckyHub runs in, with its official installer (decky.xyz)."
    add_step "Download DeckyHub ${TAG} from GitHub and check its SHA-256 checksum. A file that doesn't match is never installed."
    add_step "${verb} DeckyHub in ~/homebrew/plugins/DeckyHub. An older version is kept until the new one is in place."
    add_step "Restart Decky Loader, which takes a few seconds."
    already=""; (( HAS_DECKY )) && already="Decky Loader is already installed.\n\n"
    intro_text="This will ${verb,,} DeckyHub ${TAG} on your Steam Deck.\n\n${already}What will happen:\n${steps}\n${PRIVACY}\n\n${WARRANTY}"

    if has_zenity; then
        zen --title="$TITLE" --width=560 --question --ok-label="${verb}" --cancel-label="Cancel" --text="$intro_text" || exit 0
    else
        printf '%b\n' "$intro_text"
        if [ -t 0 ]; then
            read -r -p "Continue? [Y/n] " answer
            [[ "$answer" =~ ^[Nn] ]] && exit 0
        fi
    fi

    # Before asking for a password, so nobody types it just to hit an error.
    if ! curl -Is --connect-timeout 30 https://github.com | head -1 | grep -q " 200"; then
        fail "GitHub can't be reached.\n\nCheck that the Deck is online (Wi-Fi), then run the installer again."
    fi

    STATUS=$(passwd -S "$USER" 2> /dev/null)
    if [ "${STATUS:${#USER}+1:2}" = "NP" ]; then
        if has_zenity && zen --title="$TITLE" --width=480 --question \
            --text="This Deck doesn't have an admin password set.\n\nThe installer can set the temporary password '${TEMP_PASSWORD}' and remove it again when it's done, the same approach Decky Loader's own installer uses.\n\nContinue?"; then
            yes "$TEMP_PASSWORD" | passwd "$USER" > /dev/null || fail "Couldn't set the temporary password.\n\nOpen Konsole, type 'passwd' and set a password yourself, then run the installer again."
            trap 'echo "$TEMP_PASSWORD" | sudo -S -k passwd -d "$USER" > /dev/null' EXIT
            PASS="$TEMP_PASSWORD"
            export DECKYHUB_TEMP_PASSWORD=1
        else
            fail "An admin password is required.\n\nOpen Konsole, type 'passwd' and press Enter to set one, then run the installer again."
        fi
    elif has_zenity; then
        while true; do
            PASS=$(zen --title="$TITLE" --width=480 --entry --hide-text \
                --text="Enter your admin (sudo) password to continue.\nIt's only used on this Deck, to run this installer, and isn't saved.") || exit 1
            echo "$PASS" | sudo -S -k true 2> /dev/null && break
            zen --title="$TITLE" --width=300 --warning --text="Incorrect password. Please try again."
        done
    else
        sudo -v || exit 1
        exec sudo -E bash "$0" "$@"
    fi
    echo "$PASS" | sudo -E -S -k bash "$0" "$@"
    exit $?
fi

# Root from here on.
USER_HOME="${DECKYHUB_USER_HOME:-$(getent passwd "${SUDO_USER:-deck}" | cut -d: -f6)}"
HOMEBREW="${USER_HOME}/homebrew"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
STATUS_FILE="${WORK}/status"
LOG="${WORK}/install.log"

NEED_DECKY=0
(( ! UPDATE_ONLY )) && [ ! -f "${HOMEBREW}/services/PluginLoader" ] && NEED_DECKY=1
# The password was step 1; then Decky Loader (if needed), download, install and restart.
STEP=1; STEPS_TOTAL=$(( 4 + NEED_DECKY ))
step() { STEP=$((STEP + 1)); echo "$1"; echo "# Step ${STEP} of ${STEPS_TOTAL}: $2"; }

install_all() {
    if (( NEED_DECKY )); then
        step 10 "Installing Decky Loader (this can take a minute)…"
        if ! curl -fsSL --connect-timeout 60 -o "${WORK}/install_release.sh" "$DECKY_INSTALLER_URL" >> "$LOG" 2>&1; then
            echo "Couldn't download Decky Loader's installer.\n\nCheck the Deck is online and try again. If the problem persists, install Decky Loader manually from https://decky.xyz and then run this installer again." > "$STATUS_FILE"; return
        fi
        bash "${WORK}/install_release.sh" >> "$LOG" 2>&1
        if [ ! -f "${HOMEBREW}/services/PluginLoader" ]; then
            echo "Decky Loader's installer ran but didn't finish successfully.\n\nInstall Decky Loader from https://decky.xyz first, then run the installer again.\n\nDetails:\n$(tail -n 5 "$LOG")" > "$STATUS_FILE"; return
        fi
        echo "decky" > "${WORK}/installed-decky"
    fi

    step 40 "Downloading DeckyHub ${TAG} and checking its checksum…"
    if ! curl -fsSL --connect-timeout 60 -o "${WORK}/DeckyHub.zip" "$ZIP_URL" >> "$LOG" 2>&1; then
        echo "Couldn't download DeckyHub ${TAG}.\n\nCheck the Deck is online and try again. You can also download the ZIP manually from:\nhttps://github.com/${REPO}/releases/tag/${TAG}" > "$STATUS_FILE"; return
    fi
    ACTUAL_SHA=$(sha256sum "${WORK}/DeckyHub.zip" | cut -d' ' -f1)
    if [ "$ACTUAL_SHA" != "$SHA256" ]; then
        echo "The downloaded DeckyHub ZIP doesn't match the expected checksum, so it wasn't installed.\n\nThis could be a network issue. Try running the installer again. If it keeps failing, download DeckyHub from https://github.com/${REPO}/releases/tag/${TAG} and install it manually." > "$STATUS_FILE"; return
    fi

    step 65 "Installing DeckyHub ${TAG}…"
    mkdir -p "${WORK}/unpacked"
    if ! unzip -q "${WORK}/DeckyHub.zip" -d "${WORK}/unpacked" >> "$LOG" 2>&1 || [ ! -f "${WORK}/unpacked/DeckyHub/plugin.json" ]; then
        echo "The DeckyHub ZIP couldn't be unpacked, it may be corrupted.\n\nTry running the installer again." > "$STATUS_FILE"; return
    fi

    target="${HOMEBREW}/plugins/DeckyHub"
    if ! mkdir -p "${HOMEBREW}/plugins" ||
        ! staging=$(mktemp -d "${HOMEBREW}/.deckyhub-install.XXXXXX"); then
        echo "Couldn't prepare the DeckyHub installation directory.\n\nMake sure there is enough disk space and try again." > "$STATUS_FILE"; return
    fi
    if ! cp -a "${WORK}/unpacked/DeckyHub" "$staging/new" ||
        { [ -n "$SUDO_USER" ] && ! chown -R "$SUDO_USER:" "$staging/new"; }; then
        rm -rf "$staging"
        echo "Couldn't copy the DeckyHub files.\n\nMake sure there is enough disk space and try again." > "$STATUS_FILE"; return
    fi
    if [ -e "$target" ] || [ -L "$target" ]; then
        if ! mv -T "$target" "$staging/previous"; then
            rm -rf "$staging"
            echo "Couldn't move the existing DeckyHub installation.\n\nClose any programs that might be using it and try again." > "$STATUS_FILE"; return
        fi
        echo "update" > "${WORK}/had-deckyhub"
    fi
    if ! mv -T "$staging/new" "$target"; then
        if [ -f "${WORK}/had-deckyhub" ] && ! mv -T "$staging/previous" "$target"; then
            echo "Installation failed and the previous copy couldn't be restored automatically.\nThe previous version is saved at: $staging/previous" > "$STATUS_FILE"; return
        fi
        rm -rf "$staging"
        echo "Couldn't put the new DeckyHub files in place.\n\nMake sure there is enough disk space and try again." > "$STATUS_FILE"; return
    fi
    rm -rf "$staging"

    step 90 "Restarting Decky Loader…"
    # Installed either way; if Decky can't restart, the finish message says to reboot.
    systemctl restart plugin_loader >> "$LOG" 2>&1 || echo "no-restart" > "${WORK}/no-restart"
    echo "ok" > "$STATUS_FILE"
    echo "100"; echo "# Done"
}

if has_zenity; then
    install_all | zen --progress --title="$TITLE" --width=480 \
        --text="Starting…" --percentage=0 --auto-close --no-cancel
else
    install_all | grep '^# ' | sed 's/^# //'
fi

INSTALL_STATUS=$(cat "$STATUS_FILE" 2> /dev/null)
[ "$INSTALL_STATUS" = "ok" ] || fail "${INSTALL_STATUS:-The installer stopped unexpectedly. Check that the Deck has enough disk space and is connected to Wi-Fi, then try again.}"

# What was done, then what to do next.
done_text=""
[ -f "${WORK}/installed-decky" ] && done_text+="✓ Decky Loader installed\n"
if [ -f "${WORK}/had-deckyhub" ]; then
    done_text+="✓ DeckyHub updated to ${TAG} (checksum verified)\n"
else
    done_text+="✓ DeckyHub ${TAG} installed (checksum verified)\n"
fi
if [ -f "${WORK}/no-restart" ]; then
    done_text+="! Decky Loader couldn't restart on its own. Restart your Steam Deck to load DeckyHub.\n"
else
    done_text+="✓ Decky Loader restarted\n"
fi
cleanup="The installer's temporary files are removed when this closes."
[ -n "$DECKYHUB_TEMP_PASSWORD" ] && cleanup="The installer's temporary files and the temporary admin password are removed when this closes."
next="Next: switch to Gaming Mode, open the Quick Access Menu (the ··· button) and pick DeckyHub's tab."
message="Installation complete.\n\n${done_text}\n${next}\n\nNothing about you or your Deck was collected or sent. ${cleanup}"
if [ -f "${WORK}/no-restart" ]; then warn "$message"; else say "$message"; fi
