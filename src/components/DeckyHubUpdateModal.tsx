import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button } from "@decky/ui";
import { useState } from "react";
import { FaDownload, FaFileArchive, FaGithub, FaTimes } from "react-icons/fa";
import { downloadAsset, getSettings, saveSettings } from "../api";
import type { TFunc } from "../i18n/en";
import type { Asset, DeckyHubInfo, DeckyHubReleaseOption, UpdateChannel, HideableButton } from "../types";
import { PLUGIN_INSTALL_TYPE, buildVersionOptions, getDeckyBackend, installDeckyPlugin, installTypeLabel, listDeckyHubReleases, modalButtonStyle, resolveDeckyHubInstallType } from "../utils";
import { normalizeVersion } from "../version";
import { showReleaseInfo } from "./AppCard";
import { iconTileStyle } from "./Card";
import { showDownloadModal } from "./DownloadProgress";
import { primaryButtonStyle } from "./AppDetailsModal";
import { DetailsWindow } from "./DetailsWindow";
import { ReleaseActions, useReleasePicker } from "./VersionPickerPanel";

const PLUGIN_NAME = "DeckyHub";

// Queues a DeckyHub release ZIP into the shared download window; shared by
// this window's Download ZIP and X on either Update button.
export async function downloadDeckyHubZip(t: TFunc, asset: Asset, onSettled?: () => void): Promise<void> {
  const result = await downloadAsset(asset, "mazillka/deckyhub-plugin");
  if (result.error) throw new Error(result.error);
  if (result.jobId) showDownloadModal(t, result.jobId, { state: "queued", filename: asset.name, total: asset.size }, onSettled);
}

// showModal() mounts onto a separate root from the QAM panel (Decky's own
// MAIN-window modal manager in production; a fresh React root in the local
// mock), so it never inherits I18nProvider's context — `t` must be a resolved
// function passed in from a caller that does have it, not `useT()` called here.
export function DeckyHubUpdateModal({
  t,
  info,
  channel: initialChannel,
  onCheckUpdate,
  onChannelChange,
  hiddenButtons,
  closeModal,
}: {
  t: TFunc;
  info: DeckyHubInfo;
  channel: UpdateChannel;
  onCheckUpdate: (channel: UpdateChannel) => void;
  onChannelChange: (channel: UpdateChannel) => void;
  hiddenButtons: HideableButton[];
  closeModal?: () => void;
}) {
  const [channel, setChannel] = useState(initialChannel);
  const { items: versions, selectedTag, setSelectedTag, loading: loadingVersions, error: fetchError, load, selected: selectedRelease } = useReleasePicker(listDeckyHubReleases, channel);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selfUpdateError, setSelfUpdateError] = useState<string | null>(null);

  const busy = checking || downloading || loadingVersions;

  const refresh = async () => {
    setChecking(true);
    try {
      await load(true);
    } finally {
      setChecking(false);
    }
    // Reads the release list load(true) just cached, to update the panel button.
    onCheckUpdate(channel);
  };

  const changeChannel = async (next: UpdateChannel) => {
    setChannel(next);
    onChannelChange(next);
    setSelectedTag("");
    void getSettings().then((settings) => saveSettings({ ...settings, updateChannel: next }));
  };

  // Every action but Check for Updates and Download ZIP closes this window;
  // Decky's own confirm/progress dialog takes over the install.
  const selfUpdate = (release: DeckyHubReleaseOption) => {
    if (!release.asset) return;
    if (!getDeckyBackend()) {
      setSelfUpdateError(t("settings.selfUpdateUnavailable"));
      return;
    }
    closeModal?.();
    installDeckyPlugin(release.asset, "mazillka/deckyhub-plugin", PLUGIN_NAME, release.tag, resolveDeckyHubInstallType(release.tag, info.version)).catch((error: unknown) =>
      toaster.toast({ title: "DeckyHub", body: String(error) }),
    );
  };

  const downloadZip = async (asset: Asset) => {
    try {
      setDownloading(true);
      await downloadDeckyHubZip(t, asset, () => setDownloading(false));
    } catch (error) {
      setDownloading(false);
      setSelfUpdateError(String(error));
    }
  };

  const versionOptions = buildVersionOptions(versions, info.version, t);

  const displayVersion = selectedRelease ? normalizeVersion(selectedRelease.tag) : "";
  const installType = selectedRelease ? resolveDeckyHubInstallType(selectedRelease.tag, info.version) : PLUGIN_INSTALL_TYPE.UPDATE;
  const primaryLabel = installTypeLabel(t, installType, displayVersion);

  return (
    <DetailsWindow
      t={t}
      closeModal={closeModal}
      icon={<div aria-hidden style={{ ...iconTileStyle, width: 72, height: 72, borderRadius: 16, fontSize: 34 }}><FaGithub /></div>}
      title={t("settings.deckyhubUpdate")}
      aside="mazillka/deckyhub-plugin"
      meta={<span>{t("settings.installedVersion", { version: `v${info.version}` })}</span>}
      release={selectedRelease}
      primary={
        selectedRelease && (
          <>
            {/* Display Settings' "Hide Update" covers Update/Reinstall/Downgrade. */}
            {!hiddenButtons.includes("update") && (
              <Button
                style={primaryButtonStyle}
                disabled={busy || !selectedRelease.asset}
                onClick={() => void selfUpdate(selectedRelease)}
                onSecondaryButton={() => showReleaseInfo(t, `DeckyHub v${displayVersion}`, selectedRelease.publishedAt, selectedRelease.notes)}
                onSecondaryActionDescription={t("appcard.releaseInfo")}
                onOptionsButton={hiddenButtons.includes("downloadZip") || busy || !selectedRelease.asset ? undefined : () => void downloadZip(selectedRelease.asset!)}
                onOptionsActionDescription={t("settings.downloadUpdate")}
              >
                <FaDownload /> {primaryLabel}
              </Button>
            )}
            {!hiddenButtons.includes("downloadZip") && (
              <Button style={modalButtonStyle} disabled={busy || !selectedRelease.asset} onClick={() => void downloadZip(selectedRelease.asset!)}>
                <FaFileArchive /> {t("settings.downloadUpdate")}
              </Button>
            )}
          </>
        )
      }
      channel={channel}
      onChannelChange={(next) => void changeChannel(next)}
      versionOptions={versionOptions}
      selectedTag={selectedTag}
      onVersionChange={setSelectedTag}
      disabled={busy}
      error={fetchError || selfUpdateError}
      isEmpty={!loadingVersions && !fetchError && versions.length === 0}
      footer={
        <>
          <ReleaseActions t={t} url={selectedRelease?.url} hideReleasePage={hiddenButtons.includes("releasePage")} checking={checking} disabled={busy} onCheck={() => void refresh()} closeModal={closeModal} />
          <Button style={modalButtonStyle} onClick={closeModal}>
            <FaTimes /> {t("settings.close")}
          </Button>
        </>
      }
    />
  );
}
