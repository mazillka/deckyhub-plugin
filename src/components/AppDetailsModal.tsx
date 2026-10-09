import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, ConfirmModal, ModalRoot, showModal } from "@decky/ui";
import { useState } from "react";
import { FaArrowDown, FaArrowUp, FaFileArchive, FaPlus, FaRedo, FaTimes, FaTrash } from "react-icons/fa";
import { saveRepoSettings } from "../api";
import type { TFunc } from "../i18n/en";
import type { App, AppReleaseOption, Asset, HideableButton, RepoPreference, UpdateChannel } from "../types";
import { buildVersionOptions, displayVersion, getDeckyBackend, installAction, installDeckyPlugin, installTypeLabel, listAppReleases, modalButtonStyle, needsFreshInstall, PLUGIN_INSTALL_TYPE, readableBytes, sectionDividerStyle, uninstallDeckyPlugin, unverifiedLabel, windowGap } from "../utils";
import { ReleaseActions, useReleasePicker, VersionPickerPanel } from "./VersionPickerPanel";

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
  onChannelChange,
  onUninstalled,
  closeModal,
}: {
  t: TFunc;
  app: App;
  preference: RepoPreference;
  downloadDisabled?: boolean;
  hiddenButtons: HideableButton[];
  onDownload: (asset: Asset) => Promise<void>;
  onChannelChange: (channel: UpdateChannel) => void;
  onUninstalled: () => void;
  closeModal?: () => void;
}) {
  const [channel, setChannel] = useState<UpdateChannel>(initialPreference.channel);
  const { items: releases, selectedTag, setSelectedTag, loading, error: fetchError, load, selected: selectedRelease } = useReleasePicker((force) => listAppReleases(app, initialPreference, force), channel);
  // This modal was rendered once by showModal(), so the downloadDisabled prop
  // never updates — track downloads started from here locally.
  const [downloading, setDownloading] = useState(Boolean(downloadDisabled));
  const download = (asset: Asset) => {
    setDownloading(true);
    void onDownload(asset).finally(() => setDownloading(false));
  };

  const changeChannel = (next: UpdateChannel) => {
    setChannel(next);
    onChannelChange(next);
    setSelectedTag("");
    void saveRepoSettings(app.repo, { ...initialPreference, channel: next });
  };

  const versionOptions = buildVersionOptions(releases, app.installedVersion, t);

  // Hands the selected release to Decky Loader's installer, which shows its own
  // confirm/progress dialog; Content reloads the list once the loader finishes.
  const install = selectedRelease && installAction(app, selectedRelease);
  const installIcons = { [PLUGIN_INSTALL_TYPE.INSTALL]: <FaPlus />, [PLUGIN_INSTALL_TYPE.REINSTALL]: <FaRedo />, [PLUGIN_INSTALL_TYPE.UPDATE]: <FaArrowUp />, [PLUGIN_INSTALL_TYPE.DOWNGRADE]: <FaArrowDown /> };
  const installLabel = install && selectedRelease ? installTypeLabel(t, install.type, displayVersion(selectedRelease.tag).replace(/^v/, ""), t("appcard.update")) : "";
  const runInstall = (release: AppReleaseOption, action: NonNullable<typeof install>) => {
    if (!getDeckyBackend()) {
      toaster.toast({ title: "DeckyHub", body: t("settings.selfUpdateUnavailable") });
      return;
    }
    const start = () => {
      installDeckyPlugin(release.assets[0], action.name, release.tag, action.type).catch((error: unknown) =>
        toaster.toast({ title: "DeckyHub", body: String(error) }),
      );
      // Decky's own confirm/progress dialog would otherwise open behind this window.
      closeModal?.();
    };
    if (!needsFreshInstall(action.name, action.type)) return start();
    // installDeckyPlugin() uninstalls first, before Decky's own dialog appears,
    // so cancelling that dialog would leave the plugin uninstalled — say so now.
    showModal(
      <ConfirmModal
        strTitle={`${installLabel}?`}
        strDescription={t("appcard.freshInstallDescription", { name: app.name })}
        strOKButtonText={installLabel}
        onOK={start}
      />,
    );
  };

  // Installed Decky plugins can be removed through Decky Loader — never
  // DeckyHub itself from here. The loader doesn't confirm, so we do.
  const canUninstall = Boolean(app.pluginName && app.pluginName !== "DeckyHub");
  const confirmUninstall = () =>
    showModal(
      <ConfirmModal
        strTitle={t("appcard.uninstallTitle", { name: app.name })}
        strDescription={t("appcard.uninstallDescription")}
        strOKButtonText={t("appcard.uninstall")}
        bDestructiveWarning
        onOK={() =>
          void uninstallDeckyPlugin(app.pluginName!).then(
            () => {
              toaster.toast({ title: "DeckyHub", body: t("appcard.uninstalled", { name: app.name }) });
              closeModal?.();
              onUninstalled();
            },
            (error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }),
          )
        }
      />,
    );

  return (
    <ModalRoot closeModal={closeModal}>
      <div style={{ display: "grid", gap: windowGap }}>
        <VersionPickerPanel
          t={t}
          title={app.name}
          subtitle={t("settings.installedVersion", { version: app.installedVersion ? displayVersion(app.installedVersion) : "—" })}
          channel={channel}
          onChannelChange={changeChannel}
          versionOptions={versionOptions}
          selectedTag={selectedTag}
          onVersionChange={setSelectedTag}
          disabled={loading}
          error={fetchError}
          isEmpty={!loading && !fetchError && releases.length === 0}
        />

        <div aria-hidden style={sectionDividerStyle} />

        {selectedRelease && (
          <>
            {install && !hiddenButtons.includes(install.type === PLUGIN_INSTALL_TYPE.INSTALL ? "install" : "update") && (
              <Button style={modalButtonStyle} onClick={() => runInstall(selectedRelease, install)}>
                {installIcons[install.type]} {unverifiedLabel(t, installLabel, install.verified)}
              </Button>
            )}
            {hiddenButtons.includes("downloadZip") ? null : selectedRelease.assets[0] ? (
              <Button style={modalButtonStyle} disabled={downloading} onClick={() => download(selectedRelease.assets[0])}>
                <FaFileArchive /> {t("settings.downloadUpdate")}
              </Button>
            ) : (
              <small style={{ color: "#ff6b6b" }}>{t("appcard.noMatchingAsset")}</small>
            )}
            {!hiddenButtons.includes("downloadZip") && selectedRelease.assets.slice(1).map((asset) => (
              <Button key={asset.name} style={modalButtonStyle} disabled={downloading} onClick={() => download(asset)}>
                <FaFileArchive /> {`${asset.name} (${readableBytes(asset.size)})`}
              </Button>
            ))}
          </>
        )}

        <ReleaseActions t={t} url={selectedRelease?.url} hideReleasePage={hiddenButtons.includes("releasePage")} checking={loading} disabled={loading} onCheck={() => void load(true)} closeModal={closeModal} />

        {canUninstall && (
          <Button style={{ ...modalButtonStyle, color: "#ff6b6b" }} onClick={confirmUninstall}>
            <FaTrash /> {t("appcard.uninstall")}
          </Button>
        )}

        <Button style={modalButtonStyle} onClick={closeModal}>
          <FaTimes /> {t("settings.close")}
        </Button>
      </div>
    </ModalRoot>
  );
}
