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
# their device.
#
# The password handling follows Decky's own installer (SteamDeckHomebrew/decky-installer,
# gui/user_install_script.sh), so it feels the same: a dialog asks for the admin password,
# and a device without one can get a temporary password that's removed again at the end.
#
# Options:
#   --plugins=a,b   Pick optional plugins by id without the checklist (see STARTER_PLUGINS).
#
# Optional plugins: a checklist (nothing ticked) offers a few hand-picked plugins with notes
# on AI help, root and audit warnings, and says DeckyHub isn't responsible for what you install: it's at your own risk. This
# installer doesn't install them: it saves the picks (pending-installs.json in DeckyHub's
# settings folder) and DeckyHub offers to install them, with its usual confirmation for each,
# the first time it opens.
#
# Texts: in the system's language (LC_ALL, LC_MESSAGES or LANG), English otherwise. They come
# from installer/i18n/<code>.json, and a few from the app's own src/i18n/<code>.ts so both say
# the same; build_installer.py bakes them in as messages() below. Use them with t (see below).
#
# DECKYHUB_USER_HOME is for tests only: the home folder to install into.

TAG="@TAG@"
SHA256="@SHA256@"
REPO="mazillka/deckyhub-plugin"
ZIP_URL="https://github.com/${REPO}/releases/download/${TAG}/DeckyHub-${TAG}.zip"
DECKY_INSTALLER_URL="https://github.com/SteamDeckHomebrew/decky-installer/releases/latest/download/install_release.sh"
PLUGINS_ARG=""
STATS_URL="https://raw.githubusercontent.com/mazillka/deckyhub-registry/release-index/stats.json"
RELEASES_URL="https://raw.githubusercontent.com/mazillka/deckyhub-registry/release-index/releases.json"

# Optional plugins (id|name|repo|what it does|release tag to follow|category), grouped by category. release.yml fills this in from
# installer/starter-plugins.json (build_installer.py).
STARTER_PLUGINS=(
@STARTER_PLUGINS@
)

INSTALLER_LANG="${LC_ALL:-${LC_MESSAGES:-$LANG}}"
case "$INSTALLER_LANG" in
    pt_PT*) INSTALLER_LANG=ptPT ;;
    zh_TW* | zh_HK* | zh_MO*) INSTALLER_LANG=zhTW ;;
    *) INSTALLER_LANG="${INSTALLER_LANG%%[_.@-]*}" ;;
esac
# messages <code> fills T with that language's texts; a code without texts leaves English.
@MESSAGES@
declare -A T
messages en
messages "$INSTALLER_LANG"
# t <key> [name value]...: the text, with each {name} replaced (quoted, so & stays literal in bash 5.2).
t() { local s="${T[$1]}"; shift; while (( $# > 1 )); do s="${s//"{$1}"/"$2"}"; shift 2; done; printf '%s' "$s"; }
TITLE="$(t title)"

for arg in "$@"; do
    case "$arg" in --plugins=*) PLUGINS_ARG="${arg#--plugins=}" ;; esac
done

C_OK="#3b9d5a"; C_WARN="#d9822b"; C_AI="#8b5cf6"; C_DIM="#8a98ad"
OK_MARK="<span foreground='${C_OK}'>✓</span>"; WARN_MARK="<span foreground='${C_WARN}'>⚠</span>"

PRIVACY="$(t privacy)"
OTHER_WAY="$(t otherWay url https://github.com/mazillka/deckyhub-plugin#option-2-manual-zip)"
RESPONSIBILITY="${WARN_MARK} $(t responsibility)"
WARRANTY="$(t warranty)"

# Dialogs when zenity is there (SteamOS has it), plain text in the terminal otherwise. Texts
# use \n for line breaks: zenity understands it, the terminal gets printf %b.
has_zenity() { command -v zenity > /dev/null && [ -n "${DISPLAY}${WAYLAND_DISPLAY}" ]; }
# As root (after the password) the dialogs still run as the device's user: zenity as root crashes while it draws a dialog's icon
# (GTK's sandboxed image loader fails), so the progress bar showed but the "All done!" message never did.
zen() {
    local as=()
    [ "$EUID" = 0 ] && [ -n "$SUDO_USER" ] && [ -z "$DECKYHUB_USER_HOME" ] && as=(sudo -u "$SUDO_USER" -E)
    "${as[@]}" zenity 2> >(grep -v 'Gtk' >&2) --window-icon=system-software-install "$@"
}
# Texts use Pango markup (bold, colors, sizes) in zenity; the terminal gets them without the tags.
plain() { printf '%b\n' "$1" | sed -e 's/<[^>]*>//g'; }
say() { if has_zenity; then zen --title="$TITLE" --width=480 --icon-name=dialog-information --info --text="$1"; else plain "$1"; fi; }
warn() { if has_zenity; then zen --title="$TITLE" --width=480 --icon-name=dialog-warning --warning --text="$1"; else plain "$1"; fi; }
fail() { if has_zenity; then zen --title="$TITLE" --width=480 --icon-name=dialog-error --error --text="$1"; else plain "$(t error.prefix) $1" >&2; fi; exit 1; }

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
    local labels=() key
    for key in "${!T[@]}"; do [[ "$key" == app.* || "$key" == notes.* ]] && labels+=("${key}=${T[$key]}"); done
    curl -fsSL --connect-timeout 15 --max-time 30 "$STATS_URL" 2> /dev/null | python3 -c '
import json, sys
end = sys.argv.index("--")
labels = dict(arg.split("=", 1) for arg in sys.argv[1:end])
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


for repo in sys.argv[end + 1:]:
    stats = plugins.get(repo.casefold())
    if stats is None:
        print(labels["notes.notChecked"] + "\t")
        continue
    notes = []
    if stats.get("ai"):
        notes.append("<span foreground=\"#8b5cf6\">✦ " + labels["app.ai"] + "</span>")
    if stats.get("root"):
        notes.append("<span foreground=\"#d9822b\">⚠ " + labels["app.root"] + "</span>")
    notes += ["<span foreground=\"#d9822b\">⚠ " + labels.get("app.warning." + key, key) + "</span>" for key in stats.get("warnings") or []]
    popularity = " · ".join(
        label + compact(stats[key]) for label, key in (("★ ", "stars"), ("↓ ", "downloads")) if isinstance(stats.get(key), int))
    print("  ".join(notes) or "<span foreground=\"#3b9d5a\">✓ " + labels["notes.noWarnings"] + "</span>", popularity, sep="\t")
' "${labels[@]}" -- "${repos[@]}" 2> /dev/null || true
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

# Sets PICKS to the chosen plugin ids (comma separated, maybe none). One dialog per plugin: its
# links are clickable there (a dialog's text can hold links, a list cell can't), and Skip is
# the default button, so nothing is added unless the user chooses Add.
choose_plugins() {
    PICKS=""
    if [ -n "$PLUGINS_ARG" ]; then PICKS="$PLUGINS_ARG"; return 0; fi
    (( ${#STARTER_PLUGINS[@]} )) && has_zenity || return 0
    local notes=() versions=() picks=() i=0 total=${#STARTER_PLUGINS[@]} entry id name repo what tag category note popularity decky_line hub_line decky_version hub_installed icon version
    mapfile -t notes < <(plugin_notes)
    mapfile -t versions < <(plugin_versions)
    # Decky Loader writes its version next to its service; DeckyHub's is in its package.json.
    decky_version="$(t picker.deckyNewest)"
    [ -s "${HOMEBREW_CHECK}/services/.loader.version" ] && decky_version="$(t picker.deckyInstalledVersion version "$(head -n 1 "${HOMEBREW_CHECK}/services/.loader.version")")"
    hub_installed="$(installed_version "${HOMEBREW_CHECK}/plugins/DeckyHub")"
    if (( HAS_DECKY )); then decky_line="$(t picker.deckyChecked)"; else decky_line="$(t picker.deckyFirst)"; fi
    case "$verb" in Update) hub_line="$(t picker.hubUpdated)" ;; Reinstall) hub_line="$(t picker.hubReinstalled)" ;; *) hub_line="$(t picker.hubInstalled)" ;; esac

    zen --title="$TITLE" --width=640 --icon-name=package-x-generic --question --ok-label="$(t picker.show)" --cancel-label="$(t picker.skipAll)" --default-cancel \
        --text="<span size='x-large'><b>$(t picker.heading)</b></span>\n\n<b>$(t picker.eitherWay)</b>\n  ${OK_MARK} <b>Decky Loader</b> ($(t picker.required)): ${decky_line}. $(t picker.version version "$decky_version"). <a href=\"https://github.com/SteamDeckHomebrew/decky-loader\">github.com/SteamDeckHomebrew/decky-loader</a>\n  ${OK_MARK} <b>DeckyHub</b> ($(t picker.required)): ${hub_line}. $(t picker.version version "${TAG}${hub_installed:+ ($(t picker.hubNow version "$hub_installed"))}"). <a href=\"https://github.com/mazillka/deckyhub-plugin\">github.com/mazillka/deckyhub-plugin</a>\n\n$(t picker.next total "$total")\n\n$(t picker.notInstalledHere)" || return 0

    for entry in "${STARTER_PLUGINS[@]}"; do
        IFS='|' read -r id name repo what tag category <<< "$entry"
        IFS=$'\t' read -r note popularity <<< "${notes[i]:-$(t notes.notChecked)}"
        i=$((i + 1))
        # An icon for the category, or a warning triangle when the notes have something to say.
        case "$category" in "Frame Generation") icon=video-display ;; Customization) icon=preferences-desktop-theme ;; "Game Libraries") icon=applications-games ;; *) icon=package-x-generic ;; esac
        case "$note" in *"$C_WARN"*) icon=dialog-warning ;; esac
        version="${versions[i - 1]:-unknown}"
        [ "$version" = unknown ] && version="$(t card.unknown)"
        if zen --title="$TITLE" --width=640 --icon-name="$icon" --question --ok-label="$(t card.add)" --cancel-label="$(t card.skip)" --default-cancel \
            --text="<span foreground='${C_DIM}'>$(t card.position n "$i" total "$total")</span>\n\n<span size='large'><b>${name}</b></span>  <span foreground='${C_DIM}'>(${category})</span>\n${what}\n\n$(t card.latest version "$version")\n${note:-$(t notes.notChecked)}${popularity:+ · $popularity}\n\n$(t card.lookFirst)\n  GitHub: <a href=\"https://github.com/${repo}\">github.com/${repo}</a>\n  $(t card.hubPage) <a href=\"https://deckyhub.com/plugins/${id}.html\">deckyhub.com/plugins/${id}.html</a>\n\n$(t card.risk)"; then
            picks+=("$id")
        fi
    done
    PICKS=$(IFS=','; echo "${picks[*]}")
}

# Not root yet: say what's going to happen, check GitHub is reachable, then get the admin
# password and run this script again as root.
if (( EUID != 0 )); then
    HOMEBREW_CHECK="${DECKYHUB_USER_HOME:-$HOME}/homebrew"
    HAS_DECKY=0; HAS_DECKYHUB=0
    [ -f "${HOMEBREW_CHECK}/services/PluginLoader" ] && HAS_DECKY=1
    [ -d "${HOMEBREW_CHECK}/plugins/DeckyHub" ] && HAS_DECKYHUB=1

    # Install, Update (another version is there) or Reinstall (this very version is).
    verb="Install"; verb_label="$(t app.install)"
    if (( HAS_DECKYHUB )); then
        verb="Update"; verb_label="$(t app.update)"
        [ "$(installed_version "${HOMEBREW_CHECK}/plugins/DeckyHub")" = "${TAG#v}" ] && { verb="Reinstall"; verb_label="$(t intro.reinstall)"; }
    fi
    steps=""; n=1
    add_step() { steps+="  ${n}. $1\n"; n=$((n + 1)); }
    add_step "$(t intro.stepPassword)"
    if (( HAS_DECKY )); then
        add_step "$(t intro.stepDeckyChecked)"
    else
        add_step "$(t intro.stepDeckyInstall)"
    fi
    add_step "$(t intro.stepDownload tag "$TAG")"
    add_step "$(t intro.stepPut)"
    add_step "$(t intro.stepRestart)"
    if (( HAS_DECKY )); then
        why="$(t intro.whyRestart)"
    else
        why="$(t intro.whyInstall)"
    fi
    if (( HAS_DECKY )); then
        headline="<span size='large'><b>$(t "intro.headline${verb}" tag "$TAG")</b></span>\n$(t intro.deckyOnlyChecked)"
    else
        headline="<span size='large'><b>$(t intro.headlineBoth tag "$TAG")</b></span>"
    fi
    extras=""
    (( ${#STARTER_PLUGINS[@]} )) && { has_zenity || [ -n "$PLUGINS_ARG" ]; } && extras="$(t intro.extras)\n\n"
    intro_text="${headline}\n\n$(t intro.steps)\n${steps}\n${extras}${why}\n\n${PRIVACY}\n\n${OTHER_WAY}\n\n${WARRANTY}"

    if has_zenity; then
        zen --title="$TITLE" --width=560 --icon-name=system-software-install --question --ok-label="${verb_label}" --cancel-label="$(t app.cancel)" --text="$intro_text" || { [ $? -eq 1 ] && exit 0; t intro.noDialog >&2; echo >&2; exit 1; }
    else
        plain "$intro_text"
        if [ -t 0 ]; then
            read -r -p "$(t intro.continue) [Y/n] " answer
            [[ "$answer" =~ ^[Nn] ]] && exit 0
        fi
    fi

    # Before asking for a password, so nobody types it just to hit an error.
    if ! curl -Is --connect-timeout 30 https://github.com | head -1 | grep -q " 200"; then
        fail "$(t error.noGithub)"
    fi

    choose_plugins
    export DECKYHUB_PICKS="$PICKS"

    STATUS=$(passwd -S "$USER" 2> /dev/null)
    if [ "${STATUS:${#USER}+1:2}" = "NP" ]; then
        # A random password, not a fixed one anyone could guess while it's set. It's shown here, so
        # it can still be removed if the run is ever cut off (sudo passwd -d, with this password).
        TEMP_PASSWORD=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 12)
        if has_zenity && zen --title="$TITLE" --width=480 --icon-name=dialog-password --question \
            --text="$(t password.tempQuestion password "$TEMP_PASSWORD" command "sudo passwd -d ${USER}")"; then
            yes "$TEMP_PASSWORD" | passwd "$USER" > /dev/null || fail "$(t password.setFailed)"
            trap 'echo "$TEMP_PASSWORD" | sudo -S -k passwd -d "$USER" > /dev/null' EXIT
            PASS="$TEMP_PASSWORD"
            export DECKYHUB_TEMP_PASSWORD=1
        else
            fail "$(t password.needed)"
        fi
    elif has_zenity; then
        while true; do
            PASS=$(zen --title="$TITLE" --width=480 --icon-name=dialog-password --entry --hide-text \
                --text="$(t password.prompt)") || exit 1
            echo "$PASS" | sudo -S -k true 2> /dev/null && break
            zen --title="$TITLE" --width=300 --icon-name=dialog-warning --warning --text="$(t password.wrong)"
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
[ ! -f "${HOMEBREW}/services/PluginLoader" ] && NEED_DECKY=1
# The password was step 1; then Decky Loader (checked, or installed if missing), and only
# after that DeckyHub: download, install and restart.
STEP=1; STEPS_TOTAL=5
step() { STEP=$((STEP + 1)); echo "$1"; echo "# $(t progress.step n "$STEP" total "$STEPS_TOTAL" text "$2")"; }

install_all() {
    if (( NEED_DECKY )); then
        step 10 "$(t progress.installingDecky)"
        if ! curl -fsSL --connect-timeout 60 -o "${WORK}/install_release.sh" "$DECKY_INSTALLER_URL" >> "$LOG" 2>&1; then
            echo "$(t error.deckyDownload url https://decky.xyz)" > "$STATUS_FILE"; return
        fi
        bash "${WORK}/install_release.sh" >> "$LOG" 2>&1
        if [ ! -f "${HOMEBREW}/services/PluginLoader" ]; then
            echo "$(t error.deckyUnfinished url https://decky.xyz)\n\n$(t error.details)\n$(tail -n 5 "$LOG" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g')" > "$STATUS_FILE"; return
        fi
        echo "decky" > "${WORK}/installed-decky"
    fi

    (( NEED_DECKY )) || step 10 "$(t progress.checkingDecky)"
    step 40 "$(t progress.downloading tag "$TAG")"
    if ! curl -fsSL --connect-timeout 60 -o "${WORK}/DeckyHub.zip" "$ZIP_URL" >> "$LOG" 2>&1; then
        echo "$(t error.hubDownload tag "$TAG" url "https://github.com/${REPO}/releases/tag/${TAG}")" > "$STATUS_FILE"; return
    fi
    ACTUAL_SHA=$(sha256sum "${WORK}/DeckyHub.zip" | cut -d' ' -f1)
    if [ "$ACTUAL_SHA" != "$SHA256" ]; then
        echo "$(t error.checksum url "https://github.com/${REPO}/releases/tag/${TAG}")" > "$STATUS_FILE"; return
    fi

    step 65 "$(t progress.installing tag "$TAG")"
    mkdir -p "${WORK}/unpacked"
    if ! unzip -q "${WORK}/DeckyHub.zip" -d "${WORK}/unpacked" >> "$LOG" 2>&1 || [ ! -f "${WORK}/unpacked/DeckyHub/plugin.json" ]; then
        echo "$(t error.damaged)" > "$STATUS_FILE"; return
    fi

    target="${HOMEBREW}/plugins/DeckyHub"
    if ! mkdir -p "${HOMEBREW}/plugins" ||
        ! staging=$(mktemp -d "${HOMEBREW}/.deckyhub-install.XXXXXX"); then
        echo "$(t error.prepare)" > "$STATUS_FILE"; return
    fi
    if ! cp -a "${WORK}/unpacked/DeckyHub" "$staging/new" ||
        { [ -n "$SUDO_USER" ] && ! chown -R "$SUDO_USER:" "$staging/new"; }; then
        rm -rf "$staging"
        echo "$(t error.copy)" > "$STATUS_FILE"; return
    fi
    if [ -e "$target" ] || [ -L "$target" ]; then
        if ! mv -T "$target" "$staging/previous"; then
            rm -rf "$staging"
            echo "$(t error.replace)" > "$STATUS_FILE"; return
        fi
        echo "update" > "${WORK}/had-deckyhub"
        [ "$(installed_version "$staging/previous")" = "${TAG#v}" ] && echo "same" > "${WORK}/same-version"
    fi
    if ! mv -T "$staging/new" "$target"; then
        if [ -f "${WORK}/had-deckyhub" ] && ! mv -T "$staging/previous" "$target"; then
            echo "$(t error.restore path "$staging/previous")" > "$STATUS_FILE"; return
        fi
        rm -rf "$staging"
        echo "$(t error.place)" > "$STATUS_FILE"; return
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

    step 90 "$(t progress.restarting)"
    # Installed either way; if Decky can't restart, the finish message says to restart the device.
    systemctl restart plugin_loader >> "$LOG" 2>&1 || echo "no-restart" > "${WORK}/no-restart"
    echo "ok" > "$STATUS_FILE"
    echo "100"; echo "# $(t progress.done)"
}

if has_zenity; then
    install_all | zen --progress --title="$TITLE" --width=480 \
        --text="$(t progress.start)" --percentage=0 --auto-close --no-cancel
else
    install_all | grep '^# ' | sed 's/^# //'
fi

INSTALL_STATUS=$(cat "$STATUS_FILE" 2> /dev/null)
[ "$INSTALL_STATUS" = "ok" ] || fail "${INSTALL_STATUS:-$(t error.unexpected)}"

# What was done, then what to do next.
done_text=""
if [ -f "${WORK}/installed-decky" ]; then done_text+="${OK_MARK} $(t done.deckyInstalled)\n"; else done_text+="${OK_MARK} $(t done.deckyAlready)\n"; fi
if [ -f "${WORK}/same-version" ]; then
    done_text+="${OK_MARK} $(t done.hubReinstalled tag "$TAG")\n"
elif [ -f "${WORK}/had-deckyhub" ]; then
    done_text+="${OK_MARK} $(t done.hubUpdated tag "$TAG")\n"
else
    done_text+="${OK_MARK} $(t done.hubInstalled tag "$TAG")\n"
fi
if [ -f "${WORK}/no-restart" ]; then
    done_text+="${WARN_MARK} $(t done.noRestart)\n"
else
    done_text+="${OK_MARK} $(t done.restarted)\n"
fi
if [ -f "${WORK}/picked-names" ]; then
    count=$(wc -l < "${WORK}/picked-names" | tr -d ' ')
    done_text+="${OK_MARK} $(t done.picked count "$count")\n"
fi
cleanup="$(t done.cleanup)"
[ -n "$DECKYHUB_TEMP_PASSWORD" ] && cleanup="$(t done.cleanupPassword)"
next="$(t done.next)"
[ -f "${WORK}/picked-names" ] && next+="\n\n${RESPONSIBILITY}"
message="<span size='x-large'><b>$(t done.title)</b></span>\n\n${done_text}\n${next}\n\n$(t done.nothingSent) ${cleanup}"
if [ -f "${WORK}/no-restart" ]; then warn "$message"; else say "$message"; fi
