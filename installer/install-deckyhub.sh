#!/bin/bash
# DeckyHub's Desktop Mode installer: installs Decky Loader first if it isn't there (with
# Decky's own installer), then DeckyHub, then restarts Decky. Started by
# Install-DeckyHub.desktop; release.yml fills in @TAG@ and @SHA256@ for the release it's
# attached to, so it installs exactly that release's ZIP and refuses any other file.
#
# The password handling follows Decky's own installer (SteamDeckHomebrew/decky-installer,
# gui/user_install_script.sh), so it feels the same: a dialog asks for the admin password,
# and a Deck without one can get a temporary password that's removed again at the end.
#
# Options:
#   --update-only   Skip Decky Loader installation; only install/update DeckyHub.
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

# Dialogs when zenity is there (SteamOS has it), plain text in the terminal otherwise.
has_zenity() { command -v zenity > /dev/null && [ -n "${DISPLAY}${WAYLAND_DISPLAY}" ]; }
zen() { zenity 2> >(grep -v 'Gtk' >&2) "$@"; }
say() { if has_zenity; then zen --title="$TITLE" --width=450 --info --text="$1"; else echo "$1"; fi; }
fail() { if has_zenity; then zen --title="$TITLE" --width=450 --error --text="$1"; else echo "Error: $1" >&2; fi; exit 1; }

# Show what this installer will do before asking for a password.
if (( EUID != 0 )); then
    USER_HOME_CHECK="${DECKYHUB_USER_HOME:-$HOME}"
    HOMEBREW_CHECK="${USER_HOME_CHECK}/homebrew"
    HAS_DECKY=0; HAS_DECKYHUB=0
    [ -f "${HOMEBREW_CHECK}/services/PluginLoader" ] && HAS_DECKY=1
    [ -d "${HOMEBREW_CHECK}/plugins/DeckyHub" ] && HAS_DECKYHUB=1

    if (( UPDATE_ONLY )); then
        intro_text="This will install DeckyHub ${TAG} onto your Steam Deck.\n\nDecky Loader installation will be skipped (--update-only).\n\nAn admin (sudo) password is required."
    elif (( HAS_DECKY )); then
        if (( HAS_DECKYHUB )); then
            intro_text="This will update DeckyHub to ${TAG}.\n\nDecky Loader is already installed.\n\nAn admin (sudo) password is required."
        else
            intro_text="This will install DeckyHub ${TAG}.\n\nDecky Loader is already installed.\n\nAn admin (sudo) password is required."
        fi
    else
        intro_text="This will:\n  1. Install Decky Loader (the plugin system)\n  2. Install DeckyHub ${TAG}\n  3. Restart Decky Loader\n\nAn admin (sudo) password is required."
    fi

    if has_zenity; then
        zen --title="$TITLE" --width=450 --question \
            --ok-label="Continue" --cancel-label="Cancel" \
            --text="$intro_text" || exit 0
    fi
fi

# Not root yet: get the admin password, then run this script again as root.
if (( EUID != 0 )); then
    STATUS=$(passwd -S "$USER" 2> /dev/null)
    if [ "${STATUS:${#USER}+1:2}" = "NP" ]; then
        if has_zenity && zen --title="$TITLE" --width=450 --question \
            --text="This Deck doesn't have an admin password set.\n\nThe installer can set the temporary password '${TEMP_PASSWORD}' for this session and remove it when done — the same approach Decky Loader's own installer uses.\n\nContinue?"; then
            yes "$TEMP_PASSWORD" | passwd "$USER" > /dev/null || fail "Couldn't set the temporary password.\n\nTry opening Konsole, typing 'passwd' and setting a password manually, then run the installer again."
            trap 'echo "$TEMP_PASSWORD" | sudo -S -k passwd -d "$USER" > /dev/null' EXIT
            PASS="$TEMP_PASSWORD"
        else
            fail "An admin password is required.\n\nOpen Konsole, type 'passwd' and press Enter to set one, then run the installer again."
        fi
    elif has_zenity; then
        while true; do
            PASS=$(zen --title="$TITLE" --width=450 --entry --hide-text \
                --text="Enter your admin (sudo) password to continue:") || exit 1
            echo "$PASS" | sudo -S -k true 2> /dev/null && break
            zen --title="$TITLE" --width=300 --warning \
                --text="Incorrect password. Please try again."
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

install_all() {
    if (( ! UPDATE_ONLY )) && [ ! -f "${HOMEBREW}/services/PluginLoader" ]; then
        echo "10"; echo "# Installing Decky Loader…"
        if ! curl -fsSL --connect-timeout 60 -o "${WORK}/install_release.sh" "$DECKY_INSTALLER_URL" >> "$LOG" 2>&1; then
            echo "Couldn't download Decky Loader's installer.\n\nCheck the Deck is online and try again. If the problem persists, install Decky Loader manually from https://decky.xyz and then run this installer again." > "$STATUS_FILE"; return
        fi
        bash "${WORK}/install_release.sh" >> "$LOG" 2>&1
        if [ ! -f "${HOMEBREW}/services/PluginLoader" ]; then
            echo "Decky Loader's installer ran but didn't finish successfully.\n\nInstall Decky Loader from https://decky.xyz first, then run the installer again.\n\nDetails:\n$(tail -n 5 "$LOG")" > "$STATUS_FILE"; return
        fi
        echo "decky" > "${WORK}/installed-decky"
    fi

    echo "50"; echo "# Downloading DeckyHub ${TAG}…"
    if ! curl -fsSL --connect-timeout 60 -o "${WORK}/DeckyHub.zip" "$ZIP_URL" >> "$LOG" 2>&1; then
        echo "Couldn't download DeckyHub ${TAG}.\n\nCheck the Deck is online and try again. You can also download the ZIP manually from:\nhttps://github.com/${REPO}/releases/tag/${TAG}" > "$STATUS_FILE"; return
    fi
    ACTUAL_SHA=$(sha256sum "${WORK}/DeckyHub.zip" | cut -d' ' -f1)
    if [ "$ACTUAL_SHA" != "$SHA256" ]; then
        echo "The downloaded DeckyHub ZIP doesn't match the expected checksum, so it wasn't installed.\n\nThis could be a network issue. Try running the installer again. If it keeps failing, download DeckyHub from https://github.com/${REPO}/releases/tag/${TAG} and install it manually." > "$STATUS_FILE"; return
    fi

    echo "70"; echo "# Installing DeckyHub ${TAG}…"
    mkdir -p "${WORK}/unpacked"
    if ! unzip -q "${WORK}/DeckyHub.zip" -d "${WORK}/unpacked" >> "$LOG" 2>&1 || [ ! -f "${WORK}/unpacked/DeckyHub/plugin.json" ]; then
        echo "The DeckyHub ZIP couldn't be unpacked — it may be corrupted.\n\nTry running the installer again." > "$STATUS_FILE"; return
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

    echo "90"; echo "# Restarting Decky Loader…"
    if ! systemctl restart plugin_loader >> "$LOG" 2>&1; then
        echo "DeckyHub was installed, but Decky Loader couldn't restart automatically.\n\nRestart the Steam Deck and it will load on the next boot." > "$STATUS_FILE"; return
    fi
    echo "ok" > "$STATUS_FILE"
    echo "100"; echo "# Done"
}

if has_zenity; then
    install_all | zen --progress --title="$TITLE" --width=450 \
        --text="Starting…" --percentage=0 --auto-close --no-cancel
else
    install_all
fi

INSTALL_STATUS=$(cat "$STATUS_FILE" 2> /dev/null)
[ "$INSTALL_STATUS" = "ok" ] || fail "${INSTALL_STATUS:-The installer stopped unexpectedly. Check that the Deck has enough disk space and is connected to Wi-Fi, then try again.}"

DECKYHUB_VERSION="$TAG"

if [ -f "${WORK}/installed-decky" ]; then
    say "✓ Decky Loader installed\n✓ DeckyHub ${DECKYHUB_VERSION} installed\n\nSwitch to Gaming Mode, open the Quick Access Menu (the ··· button) and pick DeckyHub's tab."
elif [ -f "${WORK}/had-deckyhub" ]; then
    say "✓ DeckyHub updated to ${DECKYHUB_VERSION}\n\nIn Gaming Mode, open the Quick Access Menu (the ··· button) and pick DeckyHub's tab."
else
    say "✓ DeckyHub ${DECKYHUB_VERSION} installed\n\nIn Gaming Mode, open the Quick Access Menu (the ··· button) and pick DeckyHub's tab."
fi
