import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Focusable, ModalRoot, Navigation } from "@decky/ui";
import { useEffect, useState } from "react";
import { saveRepoSettings } from "../api";
import type { TFunc } from "../i18n/en";
import type { App, AppReleaseOption, Asset, RepoPreference, UpdateChannel } from "../types";
import { buildVersionOptions, getDeckyBackend, installAction, installDeckyPlugin, listAppReleases, modalButtonStyle, PLUGIN_INSTALL_TYPE, readableBytes, sectionDividerStyle, selectDefaultTag } from "../utils";
import { VersionPickerPanel } from "./VersionPickerPanel";

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
  t: TFunc;
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
    setSelectedTag((current) => selectDefaultTag(filtered, current, pinLatest));
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

  const versionOptions = buildVersionOptions(releases, app.installedVersion, t);

  // Hands the selected release to Decky Loader's installer, which shows its own
  // confirm/progress dialog; Content reloads the list once the loader finishes.
  const install = selectedRelease && installAction(app, selectedRelease);
  const runInstall = (release: AppReleaseOption, action: NonNullable<typeof install>) => {
    if (!getDeckyBackend()) {
      toaster.toast({ title: "DeckyHub", body: t("settings.selfUpdateUnavailable") });
      return;
    }
    installDeckyPlugin(release.assets[0], action.name, release.tag, action.type).catch((error: unknown) =>
      toaster.toast({ title: "DeckyHub", body: String(error) }),
    );
  };

  return (
    <ModalRoot closeModal={closeModal}>
      <div style={{ display: "grid", gap: 10 }}>
        <VersionPickerPanel
          t={t}
          title={app.name}
          subtitle={t("settings.installedVersion", { version: app.installedVersion ?? "—" })}
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
            {install && (
              <Button style={modalButtonStyle} onClick={() => runInstall(selectedRelease, install)}>
                {t(install.type === PLUGIN_INSTALL_TYPE.INSTALL ? "appcard.install" : "appcard.update")}
              </Button>
            )}
            {selectedRelease.assets[0] ? (
              <Button style={modalButtonStyle} disabled={downloadDisabled} onClick={() => onDownload(selectedRelease.assets[0])}>
                {t("settings.downloadUpdate")}
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
