import { DialogButtonPrimary as Button, ModalRoot, ProgressBar } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaDownload, FaFileArchive, FaTimes } from "react-icons/fa";
import { downloadAsset, getSettings, saveSettings } from "../api";
import type { TFunc } from "../i18n/en";
import type { Asset, DeckyHubInfo, DeckyHubReleaseOption, UpdateChannel, HideableButton } from "../types";
import { PLUGIN_INSTALL_TYPE, buildVersionOptions, getDeckyBackend, installDeckyPlugin, installTypeLabel, listDeckyHubReleases, modalButtonStyle, normalizeVersion, resolveDeckyHubInstallType, sectionDividerStyle, selfUpdateStageKey, windowGap } from "../utils";
import { showDownloadModal } from "./DownloadProgress";
import { ReleaseActions, useReleasePicker, VersionPickerPanel } from "./VersionPickerPanel";

const PLUGIN_NAME = "DeckyHub";

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
  onCheckUpdate: () => void;
  onChannelChange: (channel: UpdateChannel) => void;
  hiddenButtons: HideableButton[];
  closeModal?: () => void;
}) {
  const [channel, setChannel] = useState(initialChannel);
  const { items: versions, selectedTag, setSelectedTag, loading: loadingVersions, error: fetchError, setError: setFetchError, load, selected: selectedRelease } = useReleasePicker(listDeckyHubReleases, channel);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selfUpdating, setSelfUpdating] = useState(false);
  const [selfUpdateProgress, setSelfUpdateProgress] = useState(0);
  const [selfUpdateStatus, setSelfUpdateStatus] = useState("");
  const [selfUpdateError, setSelfUpdateError] = useState<string | null>(null);
  const selfUpdatingRef = useRef(false);

  // Mirrors Decky Loader's own install progress for a self-update — the
  // loader pops its own native confirm/progress dialog on top of this one,
  // so this is best-effort feedback for whenever this modal is still visible.
  useEffect(() => {
    const backend = getDeckyBackend();
    if (!backend) return;
    const onStart = (name: string) => {
      if (name !== PLUGIN_NAME) return;
      selfUpdatingRef.current = true;
      setSelfUpdating(true);
      setSelfUpdateProgress(0);
      setSelfUpdateStatus(t(selfUpdateStageKey("start")));
    };
    const onInfo = (percent: number, key?: string) => {
      if (!selfUpdatingRef.current) return;
      setSelfUpdateProgress(percent);
      setSelfUpdateStatus(t(selfUpdateStageKey(key)));
    };
    const onFinish = (name: string) => {
      if (name !== PLUGIN_NAME) return;
      selfUpdatingRef.current = false;
      setSelfUpdateProgress(100);
      setSelfUpdating(false);
    };
    backend.addEventListener("loader/plugin_download_start", onStart);
    backend.addEventListener("loader/plugin_download_info", onInfo);
    backend.addEventListener("loader/plugin_download_finish", onFinish);
    return () => {
      backend.removeEventListener("loader/plugin_download_start", onStart);
      backend.removeEventListener("loader/plugin_download_info", onInfo);
      backend.removeEventListener("loader/plugin_download_finish", onFinish);
    };
  }, [t]);

  const busy = checking || downloading || selfUpdating || loadingVersions;

  const refresh = async () => {
    setChecking(true);
    onCheckUpdate();
    try {
      await load(true);
    } finally {
      setChecking(false);
    }
  };

  const changeChannel = async (next: UpdateChannel) => {
    setChannel(next);
    onChannelChange(next);
    setSelectedTag("");
    void getSettings().then((settings) => saveSettings({ ...settings, updateChannel: next }));
  };

  const selfUpdate = async (release: DeckyHubReleaseOption) => {
    const asset = release.asset;
    if (!asset) return;
    const backend = getDeckyBackend();
    if (!backend) {
      setSelfUpdateError(t("settings.selfUpdateUnavailable"));
      return;
    }
    setSelfUpdateError(null);
    const installType = resolveDeckyHubInstallType(release.tag, info.version);
    try {
      await installDeckyPlugin(asset, PLUGIN_NAME, release.tag, installType);
    } catch (error) {
      selfUpdatingRef.current = false;
      setSelfUpdating(false);
      setSelfUpdateError(String(error));
    }
  };

  const downloadZip = async (asset: Asset) => {
    try {
      const result = await downloadAsset(asset, "mazillka/deckyhub-plugin");
      if (result.error) throw new Error(result.error);
      if (result.jobId) {
        setDownloading(true);
        showDownloadModal(t, result.jobId, { state: "queued", filename: asset.name, total: asset.size }, () => setDownloading(false));
      }
    } catch (error) {
      setFetchError(String(error));
    }
  };

  const versionOptions = buildVersionOptions(versions, info.version, t);

  const displayVersion = selectedRelease ? normalizeVersion(selectedRelease.tag) : "";
  const installType = selectedRelease ? resolveDeckyHubInstallType(selectedRelease.tag, info.version) : PLUGIN_INSTALL_TYPE.UPDATE;
  const primaryLabel = selfUpdating ? t("settings.selfUpdating") : installTypeLabel(t, installType, displayVersion);

  return (
    <ModalRoot closeModal={closeModal}>
      <div style={{ display: "grid", gap: windowGap }}>
        <VersionPickerPanel
          t={t}
          title={t("settings.deckyhubUpdate")}
          subtitle={`${t("settings.current")} - v${info.version}`}
          channel={channel}
          onChannelChange={(next) => void changeChannel(next)}
          versionOptions={versionOptions}
          selectedTag={selectedTag}
          onVersionChange={setSelectedTag}
          disabled={busy}
          error={fetchError || selfUpdateError}
          isEmpty={!loadingVersions && !fetchError && versions.length === 0}
        />

        {selfUpdating && (
          <div style={{ display: "grid", gap: 6 }}>
            <ProgressBar indeterminate={!selfUpdateProgress} nProgress={selfUpdateProgress} />
            <small style={{ color: "#8fcef4" }}>{selfUpdateStatus}</small>
          </div>
        )}

        <div aria-hidden style={sectionDividerStyle} />

        {selectedRelease && (
          <>
            {/* Display Settings' "Hide Update" covers Update/Reinstall/Downgrade. */}
            {!hiddenButtons.includes("update") && (
              <Button
                style={modalButtonStyle}
                disabled={busy || !selectedRelease.asset}
                onClick={() => void selfUpdate(selectedRelease)}
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
        )}

        <ReleaseActions t={t} url={selectedRelease?.url} hideReleasePage={hiddenButtons.includes("releasePage")} checking={checking} disabled={busy} onCheck={() => void refresh()} closeModal={closeModal} />

        <Button style={modalButtonStyle} onClick={closeModal}>
          <FaTimes /> {t("settings.close")}
        </Button>
      </div>
    </ModalRoot>
  );
}
