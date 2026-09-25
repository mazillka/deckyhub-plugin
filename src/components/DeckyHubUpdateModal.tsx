import { DialogButtonPrimary as Button, Focusable, ModalRoot, Navigation, ProgressBar } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaDownload } from "react-icons/fa";
import { downloadAsset, getSettings, saveSettings } from "../api";
import type { TFunc } from "../i18n/en";
import type { Asset, DeckyHubInfo, DeckyHubReleaseOption, UpdateChannel, HideableButton } from "../types";
import { PLUGIN_INSTALL_TYPE, buildVersionOptions, getDeckyBackend, installDeckyPlugin, listDeckyHubReleases, modalButtonStyle, normalizeVersion, resolveDeckyHubInstallType, sectionDividerStyle, selectDefaultTag, selfUpdateStageKey } from "../utils";
import { showDownloadModal } from "./DownloadProgress";
import { VersionPickerPanel } from "./VersionPickerPanel";

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
  const [versions, setVersions] = useState<DeckyHubReleaseOption[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selfUpdating, setSelfUpdating] = useState(false);
  const [selfUpdateProgress, setSelfUpdateProgress] = useState(0);
  const [selfUpdateStatus, setSelfUpdateStatus] = useState("");
  const [selfUpdateError, setSelfUpdateError] = useState<string | null>(null);
  const selfUpdatingRef = useRef(false);

  const loadVersions = async (forChannel: UpdateChannel, { pinLatest = false } = {}) => {
    setLoadingVersions(true);
    const { items, error } = await listDeckyHubReleases(pinLatest);
    const filtered = items.filter((item) => item.prerelease === (forChannel === "prerelease"));
    setVersions(filtered);
    setFetchError(error ?? null);
    setSelectedTag((current) => selectDefaultTag(filtered, current, pinLatest));
    setLoadingVersions(false);
  };

  useEffect(() => {
    void loadVersions(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

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

  const selectedRelease = versions.find((item) => item.tag === selectedTag) ?? null;
  const busy = checking || downloading || selfUpdating || loadingVersions;

  const refresh = async () => {
    setChecking(true);
    onCheckUpdate();
    try {
      await loadVersions(channel, { pinLatest: true });
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
    const installType = resolveDeckyHubInstallType(release.version, info.version);
    try {
      await installDeckyPlugin(asset, PLUGIN_NAME, release.version, installType);
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

  const displayVersion = selectedRelease ? normalizeVersion(selectedRelease.version) : "";
  const installType = selectedRelease ? resolveDeckyHubInstallType(selectedRelease.version, info.version) : PLUGIN_INSTALL_TYPE.UPDATE;
  const primaryLabel = selfUpdating
    ? t("settings.selfUpdating")
    : installType === PLUGIN_INSTALL_TYPE.REINSTALL
    ? t("settings.reinstallTo", { version: displayVersion })
    : installType === PLUGIN_INSTALL_TYPE.DOWNGRADE
    ? t("settings.downgradeTo", { version: displayVersion })
    : t("settings.updateTo", { version: displayVersion });

  return (
    <ModalRoot closeModal={closeModal}>
      <div style={{ display: "grid", gap: 10 }}>
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
                style={{ ...modalButtonStyle, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                disabled={busy || !selectedRelease.asset}
                onClick={() => void selfUpdate(selectedRelease)}
              >
                <FaDownload /> {primaryLabel}
              </Button>
            )}
            {!hiddenButtons.includes("downloadZip") && (
              <Button style={modalButtonStyle} disabled={busy || !selectedRelease.asset} onClick={() => void downloadZip(selectedRelease.asset!)}>
                {t("settings.downloadUpdate")}
              </Button>
            )}
          </>
        )}

        <Focusable style={{ display: "flex", gap: 8 }}>
          {selectedRelease?.url && !hiddenButtons.includes("releasePage") && (
            <Button style={{ ...modalButtonStyle, flex: 1 }} onClick={() => {
                // Close first: Steam's browser otherwise opens underneath this modal.
                closeModal?.();
                Navigation.NavigateToExternalWeb(selectedRelease.url);
              }}
            >
              {t("appcard.releasePage")}
            </Button>
          )}
          <Button style={{ ...modalButtonStyle, flex: 1 }} disabled={busy} onClick={() => void refresh()}>
            {checking ? t("settings.checkingUpdate") : t("settings.checkUpdate")}
          </Button>
        </Focusable>

        <Button style={modalButtonStyle} onClick={closeModal}>
          {t("settings.close")}
        </Button>
      </div>
    </ModalRoot>
  );
}
