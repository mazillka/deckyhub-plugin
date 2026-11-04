#!/bin/bash
# DeckyHub's Desktop Mode installer: installs Decky Loader first if it isn't there (with
# Decky's own installer), then DeckyHub, then restarts Decky. Started by
# Install-DeckyHub.desktop; release.yml fills in @TAG@ and @SHA256@ for the release it's
# attached to, so it installs exactly that release's ZIP and refuses any other file.
#
# Before anything happens it lists every step in plain words, says why the admin password is
# needed and what it does with your information (nothing: no data is collected, stored or
# sent; the only requests go to GitHub). At the end a message says what was done and what to
# do next. Keep every text short and simple: the people reading it just want DeckyHub on
# their Deck.
#
# The password handling follows Decky's own installer (SteamDeckHomebrew/decky-installer,
# gui/user_install_script.sh), so it feels the same: a dialog asks for the admin password,
# and a Deck without one can get a temporary password that's removed again at the end.
#
# Options:
#   --update-only   Skip Decky Loader installation; only install/update DeckyHub.
#                   Needs Decky Loader to be installed already.
#   --plugins=a,b   Pick optional plugins by id without the checklist (see STARTER_PLUGINS).
#
# Optional plugins: a checklist (nothing ticked) offers a few hand-picked plugins with notes
# on AI help, root and audit warnings, and says you're responsible for what you install. This
# installer doesn't install them: it saves the picks (pending-installs.json in DeckyHub's
# settings folder) and DeckyHub offers to install them, with its usual confirmation for each,
# the first time it opens.
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
PLUGINS_ARG=""
STATS_URL="https://raw.githubusercontent.com/mazillka/deckyhub-registry/release-index/stats.json"
RELEASES_URL="https://raw.githubusercontent.com/mazillka/deckyhub-registry/release-index/releases.json"

# Optional plugins (id|name|repo|what it does|release tag to follow|category), grouped by category. release.yml fills this in from
# installer/starter-plugins.json (build_installer.py).
STARTER_PLUGINS=(
@STARTER_PLUGINS@
)

for arg in "$@"; do
    [ "$arg" = "--update-only" ] && UPDATE_ONLY=1
    case "$arg" in --plugins=*) PLUGINS_ARG="${arg#--plugins=}" ;; esac
done

PRIVACY="Your privacy: nothing about you or your Deck is collected, saved or sent anywhere. Your password is used only on this Deck, right now, and is never stored. The installer only downloads files from GitHub."
OTHER_WAY="You can also install DeckyHub without this installer: download its ZIP and add it in Decky's settings (no password needed). Steps: https://github.com/mazillka/deckyhub-plugin#option-2-manual-zip"
RESPONSIBILITY="You are responsible for what you install. These plugins are made by other people. DeckyHub doesn't make, review or vouch for them, and they run on your Deck. Read each plugin's notes first."
NOTES_EXPLAINED="What the notes mean:\n  AI-assisted: its code was probably written with AI help. That says nothing about its quality or safety.\n  Runs as root: it has full access to your Deck. Many plugins need that, so add it only if you trust its author.\n  Warning: an audit found something. For example it changes system startup (it edits shell profiles or loads modules that keep working after you remove it), has hidden code (encoded or packed, hard to read), reads private data, runs scripts it downloads, skips HTTPS checks, has code that isn't in its repository, or has known vulnerabilities.\n  No warnings: the audit found nothing. That isn't proof of safety.\n  Not checked: the notes couldn't be loaded (no connection).\n  ★ and ↓: GitHub stars and downloads. More people using a plugin doesn't make it safer.\n\nLatest version is the newest release today. DeckyHub installs the newest one when you confirm."
WARRANTY="DeckyHub is a free community project. It comes as it is, with no guarantee."

# Dialogs when zenity is there (SteamOS has it), plain text in the terminal otherwise. Texts
# use \n for line breaks: zenity understands it, the terminal gets printf %b.
has_zenity() { command -v zenity > /dev/null && [ -n "${DISPLAY}${WAYLAND_DISPLAY}" ]; }
zen() { zenity 2> >(grep -v 'Gtk' >&2) --window-icon=system-software-install "$@"; }
say() { if has_zenity; then zen --title="$TITLE" --width=480 --icon=dialog-information --info --text="$1"; else printf '%b
' "$1"; fi; }
warn() { if has_zenity; then zen --title="$TITLE" --width=480 --icon=dialog-warning --warning --text="$1"; else printf '%b
' "$1"; fi; }
fail() { if has_zenity; then zen --title="$TITLE" --width=480 --icon=dialog-error --error --text="$1"; else printf 'Error: %b
' "$1" >&2; fi; exit 1; }

# The version of the DeckyHub in folder $1 (from its package.json), or nothing.
installed_version() { sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$1/package.json" 2> /dev/null | head -1; }

# One line per optional plugin, in order: "notes<TAB>popularity", from the registry's stats
# (AI help, root, audit warnings; GitHub stars and downloads). Prints nothing when the stats
# can't be read.
plugin_notes() {
    local repos=() entry repo
    for entry in "${STARTER_PLUGINS[@]}"; do
        IFS='|' read -r _ _ repo _ _ _ <<< "$entry"
        repos+=("$repo")
    done
    curl -fsSL --connect-timeout 15 --max-time 30 "$STATS_URL" 2> /dev/null | python3 -c '
import json, sys
labels = {"blocked": "Blocked by audit", "private-data": "Reads private data", "persistence": "Changes system startup",
          "not-in-source": "Code not in its repo", "obfuscated": "Hidden code", "no-tls-check": "Skips HTTPS checks",
          "runs-downloads": "Runs downloaded scripts", "vulnerable": "Known vulnerabilities"}
try:
    plugins = json.loads(sys.stdin.buffer.read())["plugins"]
except Exception:
    sys.exit(1)
sys.stdout.reconfigure(encoding="utf-8")  # ★ and ↓, whatever the locale


def compact(number):
    for size, suffix in ((1000000, "M"), (1000, "K")):
        if number >= size:
            return ("%.1f" % (number / size)).rstrip("0").rstrip(".") + suffix
    return str(number)


for repo in sys.argv[1:]:
    stats = plugins.get(repo.casefold())
    if stats is None:
        print("Not checked\t")
        continue
    notes = []
    if stats.get("ai"):
        notes.append("AI-assisted")
    if stats.get("root"):
        notes.append("Runs as root")
    notes += ["Warning: " + labels.get(key, key) for key in stats.get("warnings") or []]
    popularity = " · ".join(
        label + compact(stats[key]) for label, key in (("★ ", "stars"), ("↓ ", "downloads")) if isinstance(stats.get(key), int))
    print("; ".join(notes) or "No warnings", popularity, sep="\t")
' "${repos[@]}" 2> /dev/null || true
}

# The newest stable release of each optional plugin, in order ("unknown" when it can't be read).
plugin_versions() {
    local args=() entry repo tag
    for entry in "${STARTER_PLUGINS[@]}"; do
        IFS='|' read -r _ _ repo _ tag _ <<< "$entry"
        args+=("${repo}|${tag}")
    done
    curl -fsSL --connect-timeout 15 --max-time 90 "$RELEASES_URL" 2> /dev/null | python3 -c '
import json, re, sys
try:
    releases = json.loads(sys.stdin.buffer.read())["releases"]
except Exception:
    sys.exit(1)
for arg in sys.argv[1:]:
    repo, _, tag = arg.partition("|")
    version = "unknown"
    for release in releases.get(repo.casefold(), []):
        if release.get("draft") or release.get("prerelease") or tag not in release.get("tag_name", ""):
            continue
        match = re.search(r"\d+(?:\.\d+)+[\w.+-]*", release["tag_name"])
        version = match.group(0) if match else release["tag_name"]
        break
    print(version)
' "${args[@]}" 2> /dev/null || true
}

# Sets PICKS to the chosen plugin ids (comma separated, maybe none).
choose_plugins() {
    PICKS=""
    if [ -n "$PLUGINS_ARG" ]; then PICKS="$PLUGINS_ARG"; return 0; fi
    (( ${#STARTER_PLUGINS[@]} )) && has_zenity || return 0
    local notes=() versions=() rows=() i=0 entry id name repo what tag category note popularity decky_note hub_note decky_version hub_installed
    mapfile -t notes < <(plugin_notes)
    mapfile -t versions < <(plugin_versions)
    # Decky Loader writes its version next to its service; DeckyHub's is in its package.json.
    decky_version="the newest release, chosen by Decky's own installer"
    [ -s "${HOMEBREW_CHECK}/services/.loader.version" ] && decky_version="$(head -n 1 "${HOMEBREW_CHECK}/services/.loader.version") (installed)"
    hub_installed="$(installed_version "${HOMEBREW_CHECK}/plugins/DeckyHub")"
    if (( HAS_DECKY )); then decky_note="Required: already installed, only checked"; else decky_note="Required: installed first"; fi
    case "$verb" in Update) hub_note="Required: will be updated" ;; Reinstall) hub_note="Required: will be reinstalled" ;; *) hub_note="Required: will be installed" ;; esac
    rows+=(TRUE "decky-loader" "Decky Loader"$'\n'"The add-on system DeckyHub runs in"$'\n'"Version: ${decky_version}" "Required" "$decky_note" "" "decky.xyz")
    rows+=(TRUE "deckyhub" "DeckyHub"$'\n'"Finds, installs and updates plugins from Gaming Mode"$'\n'"Version: ${TAG}${hub_installed:+ (now ${hub_installed})}" "Required" "$hub_note" "" "deckyhub.com")
    for entry in "${STARTER_PLUGINS[@]}"; do
        IFS='|' read -r id name repo what tag category <<< "$entry"
        IFS=$'\t' read -r note popularity <<< "${notes[i]:-Not checked}"
        rows+=(FALSE "$id" "${name}"$'\n'"${what}"$'\n'"Latest version: ${versions[i]:-unknown}" "$category" "${note:-Not checked}" "$popularity" "deckyhub.com/plugins/${id}.html")
        i=$((i + 1))
    done
    PICKS=$(zen --title="$TITLE" --width=1060 --height=720 --list --checklist --hide-column=2 --print-column=2 --separator=',' \
        --ok-label="Continue" --cancel-label="Skip" \
        --text="<b>Optional plugins</b>\n\n<b>Decky Loader and DeckyHub are installed either way.</b> They're the first two rows, and they stay installed even if you untick them. Tick any other plugins you'd like to add, or skip this: you can always add plugins later from DeckyHub.\n\nThis installer doesn't install them. DeckyHub asks you to confirm each one the first time you open it. Plugins are grouped by category, and every plugin has a page with its details and security scans on deckyhub.com (last column).\n\n${NOTES_EXPLAINED}\n\n${RESPONSIBILITY}" \
        --column=Pick --column=ID --column=Plugin --column=Category --column=Notes --column="Stars and downloads" --column="Details and security scans" "${rows[@]}") || PICKS=""
}

# Not root yet: say what's going to happen, check GitHub is reachable, then get the admin
# password and run this script again as root.
if (( EUID != 0 )); then
    HOMEBREW_CHECK="${DECKYHUB_USER_HOME:-$HOME}/homebrew"
    HAS_DECKY=0; HAS_DECKYHUB=0
    [ -f "${HOMEBREW_CHECK}/services/PluginLoader" ] && HAS_DECKY=1
    [ -d "${HOMEBREW_CHECK}/plugins/DeckyHub" ] && HAS_DECKYHUB=1

    if (( UPDATE_ONLY && ! HAS_DECKY )); then
        fail "--update-only needs Decky Loader, and it isn't installed on this Deck yet.\n\nRun the installer without --update-only to install both."
    fi

    # Install, Update (another version is there) or Reinstall (this very version is).
    verb="Install"
    if (( HAS_DECKYHUB )); then
        verb="Update"
        [ "$(installed_version "${HOMEBREW_CHECK}/plugins/DeckyHub")" = "${TAG#v}" ] && verb="Reinstall"
    fi
    steps=""; n=1
    add_step() { steps+="  ${n}. $1\n"; n=$((n + 1)); }
    add_step "You type your Deck's admin password."
    if (( HAS_DECKY )); then
        add_step "Decky Loader comes first. It's the add-on system DeckyHub runs in. We only check that it's installed. It is, so nothing is installed or changed here."
    else
        add_step "Decky Loader comes first. It's the add-on system DeckyHub runs in, and it isn't installed yet, so it's installed now."
    fi
    add_step "Only then is DeckyHub ${TAG} downloaded from GitHub and checked, to make sure it's the right file."
    add_step "DeckyHub is put in its folder. If you already have it, your old copy stays safe until the new one is ready."
    add_step "Decky Loader restarts. This takes a few seconds."
    if (( HAS_DECKY )); then
        why="Why a password? Restarting Decky Loader is a change to the Deck itself, and the Deck only allows that with the admin password."
    else
        why="Why a password? Installing and restarting Decky Loader are changes to the Deck itself, and the Deck only allows that with the admin password. Decky Loader's own installer asks for the same one."
    fi
    if (( HAS_DECKY )); then
        headline="This will download and ${verb,,} DeckyHub ${TAG} on your Steam Deck.\nDecky Loader is already installed, so it's only checked."
    else
        headline="This will download and install Decky Loader and DeckyHub ${TAG} on your Steam Deck."
    fi
    extras=""
    (( ${#STARTER_PLUGINS[@]} )) && { has_zenity || [ -n "$PLUGINS_ARG" ]; } && extras="Next you can pick optional plugins, such as frame generation or themes. They aren't installed now: DeckyHub asks you to confirm each one later.\n\n"
    intro_text="${headline}\n\nHere's what will happen:\n${steps}\n${extras}${why}\n\n${PRIVACY}\n\n${OTHER_WAY}\n\n${WARRANTY}"

    if has_zenity; then
        zen --title="$TITLE" --width=560 --icon=system-software-install --question --ok-label="${verb}" --cancel-label="Cancel" --text="$intro_text" || exit 0
    else
        printf '%b\n' "$intro_text"
        if [ -t 0 ]; then
            read -r -p "Continue? [Y/n] " answer
            [[ "$answer" =~ ^[Nn] ]] && exit 0
        fi
    fi

    # Before asking for a password, so nobody types it just to hit an error.
    if ! curl -Is --connect-timeout 30 https://github.com | head -1 | grep -q " 200"; then
        fail "Can't reach GitHub.\n\nCheck that your Deck is connected to Wi-Fi, then start the installer again."
    fi

    choose_plugins
    export DECKYHUB_PICKS="$PICKS"

    STATUS=$(passwd -S "$USER" 2> /dev/null)
    if [ "${STATUS:${#USER}+1:2}" = "NP" ]; then
        if has_zenity && zen --title="$TITLE" --width=480 --icon=dialog-password --question \
            --text="Your Deck doesn't have an admin password yet.\n\nThe installer can set a temporary one, use it, and remove it again when it's done. Decky Loader's own installer does the same.\n\nContinue?"; then
            yes "$TEMP_PASSWORD" | passwd "$USER" > /dev/null || fail "Couldn't set a temporary password.\n\nOpen Konsole, type passwd and press Enter to set your own, then start the installer again."
            trap 'echo "$TEMP_PASSWORD" | sudo -S -k passwd -d "$USER" > /dev/null' EXIT
            PASS="$TEMP_PASSWORD"
            export DECKYHUB_TEMP_PASSWORD=1
        else
            fail "An admin password is needed.\n\nOpen Konsole, type passwd and press Enter to set one, then start the installer again."
        fi
    elif has_zenity; then
        while true; do
            PASS=$(zen --title="$TITLE" --width=480 --icon=dialog-password --entry --hide-text \
                --text="Type your Deck's admin password.\n\nThis is the password you set for Desktop Mode, not your Steam password. It's used only on this Deck, right now, and isn't saved.") || exit 1
            echo "$PASS" | sudo -S -k true 2> /dev/null && break
            zen --title="$TITLE" --width=300 --icon=dialog-warning --warning --text="That password isn't right. Try again."
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
# The password was step 1; then Decky Loader (checked, or installed if missing), and only
# after that DeckyHub: download, install and restart.
STEP=1; STEPS_TOTAL=5
step() { STEP=$((STEP + 1)); echo "$1"; echo "# Step ${STEP} of ${STEPS_TOTAL}: $2"; }

install_all() {
    if (( NEED_DECKY )); then
        step 10 "Installing Decky Loader first (about a minute)…"
        if ! curl -fsSL --connect-timeout 60 -o "${WORK}/install_release.sh" "$DECKY_INSTALLER_URL" >> "$LOG" 2>&1; then
            echo "Couldn't download Decky Loader.\n\nCheck your Wi-Fi and try again. If it keeps failing, install Decky Loader from https://decky.xyz first, then start this installer again." > "$STATUS_FILE"; return
        fi
        bash "${WORK}/install_release.sh" >> "$LOG" 2>&1
        if [ ! -f "${HOMEBREW}/services/PluginLoader" ]; then
            echo "Decky Loader didn't finish installing.\n\nInstall it from https://decky.xyz first, then start this installer again.\n\nDetails:\n$(tail -n 5 "$LOG")" > "$STATUS_FILE"; return
        fi
        echo "decky" > "${WORK}/installed-decky"
    fi

    (( NEED_DECKY )) || step 10 "Checking that Decky Loader is installed…"
    step 40 "Downloading DeckyHub ${TAG} and checking it…"
    if ! curl -fsSL --connect-timeout 60 -o "${WORK}/DeckyHub.zip" "$ZIP_URL" >> "$LOG" 2>&1; then
        echo "Couldn't download DeckyHub ${TAG}.\n\nCheck your Wi-Fi and try again. You can also download it yourself from:\nhttps://github.com/${REPO}/releases/tag/${TAG}" > "$STATUS_FILE"; return
    fi
    ACTUAL_SHA=$(sha256sum "${WORK}/DeckyHub.zip" | cut -d' ' -f1)
    if [ "$ACTUAL_SHA" != "$SHA256" ]; then
        echo "The downloaded file isn't the right one (its checksum doesn't match), so nothing was installed.\n\nThis is usually a Wi-Fi hiccup. Start the installer again. If it keeps happening, download DeckyHub yourself from https://github.com/${REPO}/releases/tag/${TAG} and install it by hand." > "$STATUS_FILE"; return
    fi

    step 65 "Installing DeckyHub ${TAG}…"
    mkdir -p "${WORK}/unpacked"
    if ! unzip -q "${WORK}/DeckyHub.zip" -d "${WORK}/unpacked" >> "$LOG" 2>&1 || [ ! -f "${WORK}/unpacked/DeckyHub/plugin.json" ]; then
        echo "The downloaded file is damaged.\n\nStart the installer again." > "$STATUS_FILE"; return
    fi

    target="${HOMEBREW}/plugins/DeckyHub"
    if ! mkdir -p "${HOMEBREW}/plugins" ||
        ! staging=$(mktemp -d "${HOMEBREW}/.deckyhub-install.XXXXXX"); then
        echo "Couldn't prepare the folder for DeckyHub.\n\nMake sure your Deck has free space, then try again." > "$STATUS_FILE"; return
    fi
    if ! cp -a "${WORK}/unpacked/DeckyHub" "$staging/new" ||
        { [ -n "$SUDO_USER" ] && ! chown -R "$SUDO_USER:" "$staging/new"; }; then
        rm -rf "$staging"
        echo "Couldn't copy DeckyHub's files.\n\nMake sure your Deck has free space, then try again." > "$STATUS_FILE"; return
    fi
    if [ -e "$target" ] || [ -L "$target" ]; then
        if ! mv -T "$target" "$staging/previous"; then
            rm -rf "$staging"
            echo "Couldn't replace your current DeckyHub.\n\nClose anything that might be using it, then try again." > "$STATUS_FILE"; return
        fi
        echo "update" > "${WORK}/had-deckyhub"
        [ "$(installed_version "$staging/previous")" = "${TAG#v}" ] && echo "same" > "${WORK}/same-version"
    fi
    if ! mv -T "$staging/new" "$target"; then
        if [ -f "${WORK}/had-deckyhub" ] && ! mv -T "$staging/previous" "$target"; then
            echo "The update failed, and your old DeckyHub couldn't be put back automatically.\nIt's saved here: $staging/previous" > "$STATUS_FILE"; return
        fi
        rm -rf "$staging"
        echo "Couldn't put DeckyHub's files in place.\n\nMake sure your Deck has free space, then try again." > "$STATUS_FILE"; return
    fi
    rm -rf "$staging"

    # The picks go to DeckyHub's settings folder before Decky restarts, so DeckyHub finds them
    # when it loads. Only ids from the list above count; they're written as repositories.
    picked=()
    if [ -n "$DECKYHUB_PICKS" ]; then
        IFS=',' read -ra wanted <<< "$DECKYHUB_PICKS"
        for want in "${wanted[@]}"; do
            for entry in "${STARTER_PLUGINS[@]}"; do
                IFS='|' read -r id name repo what tag category <<< "$entry"
                [ "$id" = "$want" ] && { picked+=("$repo"); echo "$name" >> "${WORK}/picked-names"; }
            done
        done
    fi
    if (( ${#picked[@]} )); then
        settings_dir="${HOMEBREW}/settings/DeckyHub"
        json=""
        for repo in "${picked[@]}"; do json+="\"${repo}\","; done
        if ! { mkdir -p "$settings_dir" && printf '[%s]\n' "${json%,}" > "${settings_dir}/pending-installs.json"; }; then
            rm -f "${WORK}/picked-names"
        fi
    fi

    step 90 "Restarting Decky Loader…"
    # Installed either way; if Decky can't restart, the finish message says to restart the Deck.
    systemctl restart plugin_loader >> "$LOG" 2>&1 || echo "no-restart" > "${WORK}/no-restart"
    echo "ok" > "$STATUS_FILE"
    echo "100"; echo "# Done"
}

if has_zenity; then
    install_all | zen --progress --title="$TITLE" --width=480 \
        --text="Getting started…" --percentage=0 --auto-close --no-cancel
else
    install_all | grep '^# ' | sed 's/^# //'
fi

INSTALL_STATUS=$(cat "$STATUS_FILE" 2> /dev/null)
[ "$INSTALL_STATUS" = "ok" ] || fail "${INSTALL_STATUS:-The installer stopped unexpectedly.\n\nMake sure your Deck has free space and Wi-Fi, then try again.}"

# What was done, then what to do next.
done_text=""
if [ -f "${WORK}/installed-decky" ]; then done_text+="✓ Decky Loader installed\n"; else done_text+="✓ Decky Loader was already installed\n"; fi
if [ -f "${WORK}/same-version" ]; then
    done_text+="✓ DeckyHub ${TAG} reinstalled (file checked)\n"
elif [ -f "${WORK}/had-deckyhub" ]; then
    done_text+="✓ DeckyHub updated to ${TAG} (file checked)\n"
else
    done_text+="✓ DeckyHub ${TAG} installed (file checked)\n"
fi
if [ -f "${WORK}/no-restart" ]; then
    done_text+="! Decky Loader couldn't restart by itself. Restart your Steam Deck to start using DeckyHub.\n"
else
    done_text+="✓ Decky Loader restarted\n"
fi
if [ -f "${WORK}/picked-names" ]; then
    count=$(wc -l < "${WORK}/picked-names" | tr -d ' ')
    done_text+="✓ ${count} optional plugin(s) chosen. DeckyHub asks you to confirm them when you open it.\n"
fi
cleanup="The installer's temporary files are removed when you close this."
[ -n "$DECKYHUB_TEMP_PASSWORD" ] && cleanup="The installer's temporary files and the temporary password are removed when you close this."
next="What now: switch to Gaming Mode, open the Quick Access menu (the ··· button) and choose DeckyHub."
[ -f "${WORK}/picked-names" ] && next+="\n\n${RESPONSIBILITY}"
message="All done!\n\n${done_text}\n${next}\n\nNothing about you or your Deck was collected or sent. ${cleanup}"
if [ -f "${WORK}/no-restart" ]; then warn "$message"; else say "$message"; fi
