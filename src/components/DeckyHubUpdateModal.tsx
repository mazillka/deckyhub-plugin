import { DialogButtonPrimary as Button, DropdownItem, Focusable, ModalRoot, Navigation, ProgressBar } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaDownload } from "react-icons/fa";
import { getSettings, installDeckyHubUpdate, saveSettings } from "../api";
import type { MessageKey } from "../i18n/en";
import type { Asset, DeckyHubInfo, DeckyHubReleaseOption, UpdateChannel } from "../types";
import { PLUGIN_INSTALL_TYPE, getDeckyBackend, listDeckyHubReleases, normalizeVersion, resolveDeckyHubInstallType, sectionDividerStyle, selfUpdateStageKey } from "../utils";
import { showDownloadModal } from "./DownloadProgress";

const PLUGIN_NAME = "DeckyHub";
const modalButtonStyle = { width: "100%", minHeight: 36, padding: "6px 10px" };

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

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
  closeModal,
}: {
  t: T;
  info: DeckyHubInfo;
  channel: UpdateChannel;
  onCheckUpdate: () => void;
  onChannelChange: (channel: UpdateChannel) => void;
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
    const { items, error } = await listDeckyHubReleases();
    const filtered = items.filter((item) => item.prerelease === (forChannel === "prerelease"));
    setVersions(filtered);
    setFetchError(error ?? null);
    setSelectedTag((current) => {
      // Always default to the channel's newest release — opening the modal
      // (or switching channel) should point at what's actually available to
      // install, not silently pre-select "Reinstall <current>" just because
      // that happens to match what's running. "Check for Updates" (pinLatest)
      // additionally overrides a still-valid manual selection (e.g. an older
      // version picked to inspect a downgrade), since that's the point of
      // explicitly checking; the initial load and a channel switch only fall
      // back to latest when there's no selection to keep.
      if (!pinLatest && current && filtered.some((item) => item.tag === current)) return current;
      return filtered[0]?.tag ?? "";
    });
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
      await backend.call("utilities/install_plugin", asset.url, PLUGIN_NAME, normalizeVersion(release.version), asset.sha256 ?? "", installType);
    } catch (error) {
      selfUpdatingRef.current = false;
      setSelfUpdating(false);
      setSelfUpdateError(String(error));
    }
  };

  const installZip = async (asset: Asset) => {
    try {
      const result = await installDeckyHubUpdate(asset);
      if (result.jobId) {
        setDownloading(true);
        showDownloadModal(t, result.jobId, { state: "queued", filename: asset.name, total: asset.size }, () => setDownloading(false));
      }
    } catch (error) {
      setFetchError(String(error));
    }
  };

  const versionOptions = versions.map((item) => {
    const version = normalizeVersion(item.version);
    const isInstalled = version === normalizeVersion(info.version);
    const isLatest = versions[0]?.tag === item.tag;
    const suffix = isInstalled ? ` (${t("settings.installedLabel")})` : isLatest ? ` (${t("settings.latestLabel")})` : "";
    return { data: item.tag, label: `v${version}${suffix}` };
  });

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
        <strong style={{ fontSize: 16 }}>{t("settings.deckyhubUpdate")}</strong>
        <div style={{ fontSize: 13, opacity: 0.75 }}>{t("settings.current")} - v{info.version}</div>

        <div style={{ display: "grid", gap: 8, padding: 12, background: "rgba(0, 0, 0, 0.2)", borderRadius: 8 }}>
          <DropdownItem
            label={t("settings.updateChannel")}
            rgOptions={[
              { label: t("settings.stableReleases"), data: "stable" },
              { label: t("settings.preReleases"), data: "prerelease" },
            ]}
            selectedOption={channel}
            disabled={busy}
            onChange={({ data }) => void changeChannel(data as UpdateChannel)}
          />
          {versionOptions.length > 0 && (
            <DropdownItem
              label={t("settings.version")}
              rgOptions={versionOptions}
              selectedOption={selectedTag}
              disabled={busy}
              onChange={({ data }) => setSelectedTag(String(data))}
            />
          )}
        </div>

        {(fetchError || selfUpdateError) && <small style={{ color: "#ff6b6b" }}>{fetchError || selfUpdateError}</small>}
        {!loadingVersions && !fetchError && versions.length === 0 && <small style={{ color: "#ff6b6b" }}>{t("settings.noReleasesFound")}</small>}

        {selfUpdating && (
          <div style={{ display: "grid", gap: 6 }}>
            <ProgressBar indeterminate={!selfUpdateProgress} nProgress={selfUpdateProgress} />
            <small style={{ color: "#8fcef4" }}>{selfUpdateStatus}</small>
          </div>
        )}

        <div aria-hidden style={sectionDividerStyle} />

        {selectedRelease && (
          <>
            <Button
              style={{ ...modalButtonStyle, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              disabled={busy || !selectedRelease.asset}
              onClick={() => void selfUpdate(selectedRelease)}
            >
              <FaDownload /> {primaryLabel}
            </Button>
            <Button style={modalButtonStyle} disabled={busy || !selectedRelease.asset} onClick={() => void installZip(selectedRelease.asset!)}>
              {t("settings.downloadUpdate")}
            </Button>
          </>
        )}

        <Focusable style={{ display: "flex", gap: 8 }}>
          {selectedRelease?.url && (
            <Button style={{ ...modalButtonStyle, flex: 1 }} onClick={() => Navigation.NavigateToExternalWeb(selectedRelease.url)}>
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
