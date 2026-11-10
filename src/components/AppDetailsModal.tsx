import { toaster } from "@decky/api";
import { openExternalWeb } from "../external";
import { DialogButtonPrimary as Button, Navigation, showModal } from "@decky/ui";
import { WideConfirmModal } from "./WideModal";
import { useState } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaEye,
  FaEyeSlash,
  FaFileArchive,
  FaPlus,
  FaRedo,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { saveRepoSettings } from "../api";
import type { TFunc } from "../i18n/en";
import {
  installWarnings,
  type App,
  type AppReleaseOption,
  type Asset,
  type HideableButton,
  type RepoPreference,
  type UpdateChannel,
} from "../types";
import {
  buildVersionOptions,
  installAction,
  installTypeLabel,
  listAppReleases,
  modalButtonStyle,
  PLUGIN_INSTALL_TYPE,
  readableBytes,
  uninstallDeckyPlugin,
} from "../utils";
import { startPluginInstall } from "./InstallFlow";
import { displayVersion } from "../version";
import { AppBadges, AppMonogram, AppStats } from "./AppBadges";
import { showReleaseInfo } from "./ReleaseInfo";
import { DetailsWindow } from "./DetailsWindow";
import { VirusScanReport } from "./VirusScanReport";
import { KnownIssues } from "./KnownIssues";
import { ReleaseActions, useReleasePicker } from "./VersionPickerPanel";
import { colors } from "../styles";

// The window's main action, taller than the rest.
export const primaryButtonStyle = { ...modalButtonStyle, minHeight: 52, fontSize: "1.1em", fontWeight: 700 };

// showModal() mounts onto a separate root from the caller's tree (see the
// same note on DeckyHubUpdateModal), so `t` must be a resolved function
// passed in from AppCard — calling useT() here throws on mount.
export function AppDetailsModal({
  t,
  app,
  preference: initialPreference,
  downloadDisabled,
  hiddenButtons,
  onDownload,
  onPreferenceChange,
  onUninstalled,
  closeModal,
}: {
  t: TFunc;
  app: App;
  preference: RepoPreference;
  downloadDisabled?: boolean;
  hiddenButtons: HideableButton[];
  onDownload: (asset: Asset) => Promise<void>;
  onPreferenceChange: (preference: RepoPreference) => void;
  onUninstalled: () => void;
  closeModal?: () => void;
}) {
  const [preference, setPreference] = useState<RepoPreference>(initialPreference);
  const channel = app.prereleaseOnly ? "prerelease" : preference.channel;
  const {
    items: releases,
    selectedTag,
    setSelectedTag,
    loading,
    error: fetchError,
    load,
    selected: selectedRelease,
  } = useReleasePicker((force) => listAppReleases(app, force), channel);
  // Every action but Check for Updates and Download ZIP closes this window.
  // This modal was rendered once by showModal(), so the downloadDisabled prop
  // never updates — track downloads started from here locally.
  const [downloading, setDownloading] = useState(Boolean(downloadDisabled));
  const download = (asset: Asset) => {
    setDownloading(true);
    void onDownload(asset).finally(() => setDownloading(false));
  };

  const changePreference = (next: RepoPreference) => {
    setPreference(next);
    onPreferenceChange(next);
    void saveRepoSettings(app.repo, next);
  };
  const changeChannel = (next: UpdateChannel) => {
    setSelectedTag("");
    changePreference({ ...preference, channel: next });
  };
  // Skip this version: the card's newest release stops counting as an update (a plugin
  // whose release never changes its own version, say) until a newer one comes out.
  const latest = app.channel === channel ? app.latestVersion : null;
  const skipped = Boolean(latest && preference.skipVersion === latest);
  const canSkip = Boolean(latest && (skipped || app.updateAvailable || initialPreference.skipVersion === latest));
  const toggleSkip = () => {
    const { skipVersion: _, ...rest } = preference;
    changePreference(skipped ? rest : { ...rest, skipVersion: latest! });
  };

  const versionOptions = buildVersionOptions(releases, app.installedVersion, t);

  // Hands the selected release to Decky Loader's installer, which shows its own
  // confirm/progress dialog; Content reloads the list once the loader finishes.
  const install = selectedRelease && installAction(app, selectedRelease);
  const installIcons = {
    [PLUGIN_INSTALL_TYPE.INSTALL]: <FaPlus />,
    [PLUGIN_INSTALL_TYPE.REINSTALL]: <FaRedo />,
    [PLUGIN_INSTALL_TYPE.UPDATE]: <FaArrowUp />,
    [PLUGIN_INSTALL_TYPE.DOWNGRADE]: <FaArrowDown />,
  };
  const installLabel =
    install && selectedRelease
      ? installTypeLabel(t, install.type, displayVersion(selectedRelease.tag).replace(/^v/, ""), t("appcard.update"))
      : "";
  const runInstall = (release: AppReleaseOption, action: NonNullable<typeof install>) =>
    // Decky's own confirm/progress dialog would otherwise open behind this
    // window; the Updates/Discover page behind it is left too.
    void startPluginInstall(
      t,
      app.name,
      app.repo,
      release.assets[0],
      release.tag,
      action,
      installLabel,
      () => {
        closeModal?.();
        Navigation.NavigateBack();
      },
      installWarnings(app),
    );

  // Installed Decky plugins can be removed through Decky Loader — never
  // DeckyHub itself from here. The loader doesn't confirm, so we do.
  const canUninstall = Boolean(app.pluginName && app.pluginName !== "DeckyHub");
  const confirmUninstall = () =>
    showModal(
      <WideConfirmModal
        strTitle={t("appcard.uninstallTitle", { name: app.name })}
        strDescription={t("appcard.uninstallDescription")}
        strOKButtonText={t("appcard.uninstall")}
        bDestructiveWarning
        onOK={() => {
          closeModal?.();
          void uninstallDeckyPlugin(app.pluginName!).then(
            () => {
              toaster.toast({ title: "DeckyHub", body: t("appcard.uninstalled", { name: app.name }) });
              onUninstalled();
            },
            (error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }),
          );
        }}
      />,
    );

  return (
    <DetailsWindow
      t={t}
      closeModal={closeModal}
      icon={<AppMonogram app={app} style={{ width: 72, height: 72, borderRadius: 16, fontSize: 26 }} />}
      title={app.name}
      aside={app.repo}
      meta={
        <>
          <span style={{ color: colors.accent, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {app.category}
          </span>
          <span>
            {t("settings.installedVersion", {
              version: app.installedVersion ? displayVersion(app.installedVersion) : "—",
            })}
          </span>
          <AppStats app={app} t={t} />
          {app.identityUnverified && <span style={{ color: colors.warning }}>{t("appcard.identityUnverified")}</span>}
          <AppBadges app={app} t={t} />
          {/* What Runs as root means, right where you decide to install. */}
          {app.stats?.root && (
            <span style={{ flexBasis: "100%", color: colors.caution }}>{t("appcard.runsAsRootHint")}</span>
          )}
        </>
      }
      description={app.description}
      release={selectedRelease}
      primary={
        selectedRelease && (
          <>
            {install &&
              !hiddenButtons.includes(install.type === PLUGIN_INSTALL_TYPE.INSTALL ? "install" : "update") && (
                <Button
                  style={primaryButtonStyle}
                  onClick={() => runInstall(selectedRelease, install)}
                  onSecondaryButton={() =>
                    showReleaseInfo(
                      t,
                      `${app.name} ${displayVersion(selectedRelease.tag)}`,
                      selectedRelease.publishedAt,
                      selectedRelease.notes,
                    )
                  }
                  onSecondaryActionDescription={t("appcard.releaseInfo")}
                  // X downloads the selected release's ZIP instead of installing it.
                  onOptionsButton={
                    hiddenButtons.includes("downloadZip") || downloading || !selectedRelease.assets[0]
                      ? undefined
                      : () => download(selectedRelease.assets[0])
                  }
                  onOptionsActionDescription={t("settings.downloadUpdate")}
                  // Menu opens the repository; close first, or Steam's browser opens underneath this modal.
                  onMenuButton={() => {
                    closeModal?.();
                    openExternalWeb(`https://github.com/${app.repo}`);
                  }}
                  onMenuActionDescription={t("appcard.repository")}
                >
                  {installIcons[install.type]} {installLabel}
                </Button>
              )}
            {hiddenButtons.includes("downloadZip") ? null : selectedRelease.assets[0] ? (
              <Button
                style={modalButtonStyle}
                disabled={downloading}
                onClick={() => download(selectedRelease.assets[0])}
              >
                <FaFileArchive /> {t("settings.downloadUpdate")}
              </Button>
            ) : (
              <small style={{ color: colors.danger }}>{t("appcard.noMatchingAsset")}</small>
            )}
            {!hiddenButtons.includes("downloadZip") &&
              selectedRelease.assets.slice(1).map((asset) => (
                <Button
                  key={asset.name}
                  style={modalButtonStyle}
                  disabled={downloading}
                  onClick={() => download(asset)}
                >
                  <FaFileArchive /> {`${asset.name} (${readableBytes(asset.size)})`}
                </Button>
              ))}
          </>
        )
      }
      // Known issues sit above the scan report, not in the header: the header is one focus
      // target, so the D-pad can't reach a link inside it (seen on a Deck).
      scan={
        <>
          {app.knownIssues?.length ? <KnownIssues t={t} issues={app.knownIssues} closeModal={closeModal} /> : null}
          <VirusScanReport
            key={JSON.stringify([selectedRelease?.assets[0]?.url, selectedRelease?.assets[0]?.sha256])}
            t={t}
            asset={selectedRelease?.assets[0]}
            version={selectedRelease?.tag}
            closeModal={closeModal}
            showZipActions={false}
          />
        </>
      }
      channel={channel}
      prereleaseOnly={app.prereleaseOnly}
      onChannelChange={changeChannel}
      versionOptions={versionOptions}
      selectedTag={selectedTag}
      onVersionChange={setSelectedTag}
      disabled={loading}
      error={fetchError}
      isEmpty={!loading && !fetchError && releases.length === 0}
      footer={
        <>
          <ReleaseActions
            t={t}
            url={selectedRelease?.url}
            repoUrl={`https://github.com/${app.repo}`}
            pageUrl={app.official ? `https://deckyhub.com/plugins/${encodeURIComponent(app.id)}.html` : undefined}
            hideReleasePage={hiddenButtons.includes("releasePage")}
            checking={loading}
            disabled={loading}
            onCheck={() => void load(true)}
            closeModal={closeModal}
          />
          {canSkip && (
            <Button style={modalButtonStyle} onClick={toggleSkip}>
              {skipped ? <FaEye /> : <FaEyeSlash />}{" "}
              {t(skipped ? "appcard.unskipVersion" : "appcard.skipVersion", { version: displayVersion(latest!) })}
            </Button>
          )}
          {canUninstall && (
            <Button style={{ ...modalButtonStyle, color: colors.danger }} onClick={confirmUninstall}>
              <FaTrash /> {t("appcard.uninstall")}
            </Button>
          )}
          <Button style={modalButtonStyle} onClick={closeModal}>
            <FaTimes /> {t("settings.close")}
          </Button>
        </>
      }
    />
  );
}
