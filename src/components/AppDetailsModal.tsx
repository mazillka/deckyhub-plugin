import { DialogButtonPrimary as Button, DropdownItem, Focusable, ModalRoot, Navigation } from "@decky/ui";
import { useEffect, useState } from "react";
import { saveRepoSettings } from "../api";
import type { MessageKey } from "../i18n/en";
import type { App, AppReleaseOption, Asset, RepoPreference, UpdateChannel } from "../types";
import { listAppReleases, normalizeVersion, readableBytes, sectionDividerStyle } from "../utils";

const modalButtonStyle = { width: "100%", minHeight: 36, padding: "6px 10px", textAlign: "center" as const };

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

// showModal() mounts onto a separate root from the caller's tree (see the
// same note on DeckyHubUpdateModal), so `t` must be a resolved function
// passed in from AppCard — calling useT() here throws on mount.
export function AppDetailsModal({
  t,
  app,
  preference: initialPreference,
  downloadDisabled,
  onDownload,
  onChannelChange,
  closeModal,
}: {
  t: T;
  app: App;
  preference: RepoPreference;
  downloadDisabled?: boolean;
  onDownload: (asset: Asset) => void;
  onChannelChange: (channel: UpdateChannel) => void;
  closeModal?: () => void;
}) {
  const [channel, setChannel] = useState<UpdateChannel>(initialPreference.channel);
  const [releases, setReleases] = useState<AppReleaseOption[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadReleases = async (forChannel: UpdateChannel, { pinLatest = false } = {}) => {
    setLoading(true);
    const { items, error } = await listAppReleases(app, initialPreference, pinLatest);
    const filtered = items.filter((item) => item.prerelease === (forChannel === "prerelease"));
    setReleases(filtered);
    setFetchError(error ?? null);
    setSelectedTag((current) => {
      // Always default to the channel's newest release — opening the modal
      // (or switching channel) should point at what's actually available,
      // not silently pre-select "the version you already have" just because
      // it happens to be in the list. "Check for Updates" (pinLatest)
      // additionally overrides a still-valid manual selection (e.g. an
      // older version picked to look at); the initial load and a channel
      // switch only fall back to latest when there's no selection to keep.
      if (!pinLatest && current && filtered.some((item) => item.tag === current)) return current;
      return filtered[0]?.tag ?? "";
    });
    setLoading(false);
  };

  useEffect(() => {
    void loadReleases(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const changeChannel = (next: UpdateChannel) => {
    setChannel(next);
    onChannelChange(next);
    setSelectedTag("");
    void saveRepoSettings(app.repo, { ...initialPreference, channel: next });
  };

  const selectedRelease = releases.find((item) => item.tag === selectedTag) ?? null;

  const versionOptions = releases.map((item) => {
    const version = normalizeVersion(item.version);
    const isInstalled = Boolean(app.installedVersion) && version === normalizeVersion(app.installedVersion!);
    const isLatest = releases[0]?.tag === item.tag;
    const suffix = isInstalled ? ` (${t("settings.installedLabel")})` : isLatest ? ` (${t("settings.latestLabel")})` : "";
    return { data: item.tag, label: `v${version}${suffix}` };
  });

  return (
    <ModalRoot closeModal={closeModal}>
      <div style={{ display: "grid", gap: 10 }}>
        <strong style={{ fontSize: 16 }}>{app.name}</strong>
        <div style={{ fontSize: 13, opacity: 0.75 }}>{t("settings.installedVersion", { version: app.installedVersion ?? "—" })}</div>

        <div style={{ display: "grid", gap: 8, padding: 12, background: "rgba(0, 0, 0, 0.2)", borderRadius: 8 }}>
          <DropdownItem
            label={t("settings.updateChannel")}
            rgOptions={[
              { label: t("settings.stableReleases"), data: "stable" },
              { label: t("settings.preReleases"), data: "prerelease" },
            ]}
            selectedOption={channel}
            disabled={loading}
            onChange={({ data }) => changeChannel(data as UpdateChannel)}
          />
          {versionOptions.length > 0 && (
            <DropdownItem
              label={t("settings.version")}
              rgOptions={versionOptions}
              selectedOption={selectedTag}
              disabled={loading}
              onChange={({ data }) => setSelectedTag(String(data))}
            />
          )}
        </div>

        {fetchError && <small style={{ color: "#ff6b6b" }}>{fetchError}</small>}
        {!loading && !fetchError && releases.length === 0 && <small style={{ color: "#ff6b6b" }}>{t("settings.noReleasesFound")}</small>}

        <div aria-hidden style={sectionDividerStyle} />

        {selectedRelease && (
          <>
            {selectedRelease.assets[0] ? (
              <Button style={modalButtonStyle} disabled={downloadDisabled} onClick={() => onDownload(selectedRelease.assets[0])}>
                {t("appcard.downloadSelected")}
              </Button>
            ) : (
              <small style={{ color: "#ff6b6b" }}>{t("appcard.noMatchingAsset")}</small>
            )}
            {selectedRelease.assets.slice(1).map((asset) => (
              <Button key={asset.name} style={modalButtonStyle} disabled={downloadDisabled} onClick={() => onDownload(asset)}>
                {`${asset.name} (${readableBytes(asset.size)})`}
              </Button>
            ))}
          </>
        )}

        <Focusable style={{ display: "flex", gap: 8 }}>
          {selectedRelease?.url && (
            <Button style={{ ...modalButtonStyle, flex: 1 }} onClick={() => Navigation.NavigateToExternalWeb(selectedRelease.url)}>
              {t("appcard.releasePage")}
            </Button>
          )}
          <Button style={{ ...modalButtonStyle, flex: 1 }} disabled={loading} onClick={() => void loadReleases(channel, { pinLatest: true })}>
            {loading ? t("settings.checkingUpdate") : t("settings.checkUpdate")}
          </Button>
        </Focusable>

        <Button style={modalButtonStyle} onClick={closeModal}>
          {t("settings.close")}
        </Button>
      </div>
    </ModalRoot>
  );
}
