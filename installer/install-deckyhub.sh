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
# DECKYHUB_USER_HOME is for tests only: the home folder to install into.

TAG="@TAG@"
SHA256="@SHA256@"
REPO="mazillka/deckyhub-plugin"
ZIP_URL="https://github.com/${REPO}/releases/download/${TAG}/DeckyHub-${TAG}.zip"
DECKY_INSTALLER_URL="https://github.com/SteamDeckHomebrew/decky-installer/releases/latest/download/install_release.sh"
TITLE="DeckyHub Installer"
TEMP_PASSWORD="DeckyHub!"

# Dialogs when zenity is there (SteamOS has it), plain text in the terminal otherwise.
has_zenity() { command -v zenity > /dev/null && [ -n "${DISPLAY}${WAYLAND_DISPLAY}" ]; }
zen() { zenity 2> >(grep -v 'Gtk' >&2) "$@"; }
say() { if has_zenity; then zen --title="$TITLE" --width=400 --info --text="$1"; else echo "$1"; fi; }
fail() { if has_zenity; then zen --title="$TITLE" --width=400 --error --text="$1"; else echo "Error: $1" >&2; fi; exit 1; }

if ! curl -Is --connect-timeout 30 https://github.com | head -1 | grep -q " 200"; then
    fail "GitHub can't be reached. Check that the Deck is online, then try again."
fi

# Not root yet: get the admin password, then run this script again as root.
if (( EUID != 0 )); then
    STATUS=$(passwd -S "$USER" 2> /dev/null)
    if [ "${STATUS:${#USER}+1:2}" = "NP" ]; then
        if has_zenity && zen --title="$TITLE" --width=400 --question --text="Installing needs an admin password, and this Deck doesn't have one.\n\nThe installer can set the temporary password '${TEMP_PASSWORD}' and remove it again when it's done, as Decky Loader's own installer does. Continue?"; then
            yes "$TEMP_PASSWORD" | passwd "$USER" > /dev/null || fail "Couldn't set the temporary password."
            trap 'echo "$TEMP_PASSWORD" | sudo -S -k passwd -d "$USER" > /dev/null' EXIT
            PASS="$TEMP_PASSWORD"
        else
            fail "Set an admin password first: open Konsole, type passwd and press Enter. Then run the installer again."
        fi
    elif has_zenity; then
        while true; do
            PASS=$(zen --title="$TITLE" --width=400 --entry --hide-text --text="Enter your admin (sudo) password") || exit 1
            echo "$PASS" | sudo -S -k true 2> /dev/null && break
            zen --title="$TITLE" --width=250 --info --text="Incorrect password"
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
    if [ ! -f "${HOMEBREW}/services/PluginLoader" ]; then
        echo "10"; echo "# Installing Decky Loader"
        if ! curl -fsSL --connect-timeout 60 -o "${WORK}/install_release.sh" "$DECKY_INSTALLER_URL" >> "$LOG" 2>&1; then
            echo "Couldn't download Decky Loader's installer." > "$STATUS_FILE"; return
        fi
        bash "${WORK}/install_release.sh" >> "$LOG" 2>&1
        if [ ! -f "${HOMEBREW}/services/PluginLoader" ]; then
            echo "Decky Loader didn't install. Its installer said:\n$(tail -n 5 "$LOG")" > "$STATUS_FILE"; return
        fi
        echo "decky" > "${WORK}/installed-decky"
    fi

    echo "50"; echo "# Downloading DeckyHub ${TAG}"
    if ! curl -fsSL --connect-timeout 60 -o "${WORK}/DeckyHub.zip" "$ZIP_URL" >> "$LOG" 2>&1; then
        echo "Couldn't download DeckyHub ${TAG}." > "$STATUS_FILE"; return
    fi
    if [ "$(sha256sum "${WORK}/DeckyHub.zip" | cut -d' ' -f1)" != "$SHA256" ]; then
        echo "The downloaded DeckyHub ZIP isn't the one this installer was made for, so it wasn't installed." > "$STATUS_FILE"; return
    fi

    echo "70"; echo "# Installing DeckyHub ${TAG}"
    mkdir -p "${WORK}/unpacked"
    if ! unzip -q "${WORK}/DeckyHub.zip" -d "${WORK}/unpacked" >> "$LOG" 2>&1 || [ ! -f "${WORK}/unpacked/DeckyHub/plugin.json" ]; then
        echo "The DeckyHub ZIP couldn't be unpacked." > "$STATUS_FILE"; return
    fi
    mkdir -p "${HOMEBREW}/plugins"
    [ -d "${HOMEBREW}/plugins/DeckyHub" ] && echo "update" > "${WORK}/had-deckyhub"
    rm -rf "${HOMEBREW}/plugins/DeckyHub"
    mv "${WORK}/unpacked/DeckyHub" "${HOMEBREW}/plugins/DeckyHub"
    [ -n "$SUDO_USER" ] && chown -R "$SUDO_USER:" "${HOMEBREW}/plugins/DeckyHub"

    echo "90"; echo "# Restarting Decky Loader"
    systemctl restart plugin_loader >> "$LOG" 2>&1
    echo "ok" > "$STATUS_FILE"
    echo "100"; echo "# Done"
}

if has_zenity; then
    install_all | zen --progress --title="$TITLE" --width=400 --text="Installing…" --percentage=0 --auto-close --no-cancel
else
    install_all
fi

STATUS=$(cat "$STATUS_FILE" 2> /dev/null)
[ "$STATUS" = "ok" ] || fail "${STATUS:-The installer stopped before it finished.}"
if [ -f "${WORK}/installed-decky" ]; then
    say "Decky Loader and DeckyHub ${TAG} are installed.\n\nSwitch to Gaming Mode, open the Quick Access Menu (the … button) and pick DeckyHub's tab."
elif [ -f "${WORK}/had-deckyhub" ]; then
    say "DeckyHub is updated to ${TAG}.\n\nIn Gaming Mode, open the Quick Access Menu (the … button) and pick DeckyHub's tab."
else
    say "DeckyHub ${TAG} is installed.\n\nIn Gaming Mode, open the Quick Access Menu (the … button) and pick DeckyHub's tab."
fi
