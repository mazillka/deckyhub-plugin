import { toaster } from "@decky/api";
import { MotionStyle } from "../motion";
import { DialogButtonPrimary as Button, ConfirmModal, DropdownItem, ModalRoot, Navigation, showModal } from "@decky/ui";
import { useState } from "react";
import { FaArrowDown, FaArrowUp, FaFileArchive, FaPlus, FaRedo, FaTimes, FaTrash } from "react-icons/fa";
import { saveRepoSettings } from "../api";
import type { TFunc } from "../i18n/en";
import type { App, AppReleaseOption, Asset, HideableButton, RepoPreference, UpdateChannel } from "../types";
import { buildVersionOptions, getDeckyBackend, installAction, installDeckyPlugin, installTypeLabel, listAppReleases, manifestName, modalButtonStyle, needsFreshInstall, PLUGIN_INSTALL_TYPE, readableBytes, surfaceStyle, uninstallDeckyPlugin } from "../utils";
import { displayVersion } from "../version";
import { AppMonogram, plainNotes, showReleaseInfo, AppBadges, AppStats } from "./AppCard";
import { keepInView } from "./KeepInView";
import { ReleaseActions, useReleasePicker } from "./VersionPickerPanel";

// How much of the release notes the window shows; Y opens them in full.
const NOTES_PREVIEW = 700;

// Every install, update or reinstall of a third-party plugin first says
// DeckyHub doesn't vouch for it; resolves true once the user accepts.
export function confirmPluginInstall(t: TFunc, title: string, okLabel: string, note?: string): Promise<boolean> {
  return new Promise((resolve) =>
    showModal(
      <ConfirmModal
        strTitle={title}
        strDescription={<><span style={{ color: "#ff6b6b" }}>{t("install.disclaimer")}</span>{note && <p>{note}</p>}</>}
        strOKButtonText={okLabel}
        onOK={() => resolve(true)}
        onCancel={() => resolve(false)}
      />,
    ),
  );
}

// Hands one release to Decky Loader's installer, shared by this window and the
// card's quick Install/Update. installDeckyPlugin() uninstalls fresh-install
// plugins first, before Decky's own dialog appears, so cancelling that dialog
// would leave the plugin uninstalled — say so before starting.
export function startPluginInstall(t: TFunc, appName: string, repo: string, asset: Asset, tag: string, action: { name: string; type: 0 | 1 | 2 | 3 }, label: string, onStarted?: () => void): Promise<void> {
  if (!getDeckyBackend()) {
    toaster.toast({ title: "DeckyHub", body: t("settings.selfUpdateUnavailable") });
    return Promise.resolve();
  }
  // Settles once Decky has the request (its own dialog is up) or it failed.
  const start = async () => {
    // A repo the user added has no detect names, so installAction() falls back to
    // its "owner/name"; Decky needs the plugin's own name from its plugin.json.
    const name = action.name === repo ? ((await manifestName(repo)) ?? repo) : action.name;
    const request = installDeckyPlugin(asset, repo, name, tag, action.type).then(
      () => undefined,
      (error: unknown) => void toaster.toast({ title: "DeckyHub", body: String(error) }),
    );
    onStarted?.();
    return request;
  };
  const note = needsFreshInstall(action.name, action.type) ? t("appcard.freshInstallDescription", { name: appName }) : undefined;
  return confirmPluginInstall(t, `${label}?`, label, note).then((accepted) => (accepted ? start() : undefined));
}

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
  const { items: releases, selectedTag, setSelectedTag, loading, error: fetchError, load, selected: selectedRelease } = useReleasePicker((force) => listAppReleases(app, force), channel);
  // Every action but Check for Updates and Download ZIP closes this window.
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
  const runInstall = (release: AppReleaseOption, action: NonNullable<typeof install>) =>
    // Decky's own confirm/progress dialog would otherwise open behind this
    // window; the Updates/Discover page behind it is left too.
    void startPluginInstall(t, app.name, app.repo, release.assets[0], release.tag, action, installLabel, () => {
      closeModal?.();
      Navigation.NavigateBack();
    });

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

  // The release notes shown inline; Y on the Install button still opens them in full.
  const notes = plainNotes(selectedRelease?.notes);
  const notesPreview = notes.length > NOTES_PREVIEW ? `${notes.slice(0, NOTES_PREVIEW).replace(/\s+\S*$/, "")}…` : notes;
  const sectionTitle = { margin: 0, color: "#9fb0bf", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const };

  return (
    <ModalRoot closeModal={closeModal} bAllowFullSize>
      <MotionStyle />
      <div className="deckyhub-pop">
      <div className="deckyhub-details" style={{ display: "grid", gap: 18 }}>
        {/* Header: who it is, what state it's in, how popular. */}
        <div onFocus={keepInView} style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <AppMonogram app={app} style={{ width: 72, height: 72, borderRadius: 16, fontSize: 26 }} />
          <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 12px" }}>
              <strong style={{ color: "#fff", fontSize: 26, lineHeight: 1.15 }}>{app.name}</strong>
              <span style={{ color: "#9fb0bf", fontSize: 14 }}>{app.repo}</span>
            </div>
            <div className="deckyhub-details-meta" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", color: "#c3cfd9", fontSize: 14 }}>
              <span style={{ color: "#8fcef4", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{app.category}</span>
              <span>{t("settings.installedVersion", { version: app.installedVersion ? displayVersion(app.installedVersion) : "—" })}</span>
              <AppStats app={app} t={t} />
              <AppBadges app={app} t={t} />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 340px)", gap: 24, alignItems: "start" }}>
          {/* What it is and what this release changes. */}
          <div onFocus={keepInView} style={{ display: "grid", gap: 16, minWidth: 0 }}>
            {app.description && (
              <section style={{ display: "grid", gap: 6 }}>
                <h3 style={sectionTitle}>{t("details.about")}</h3>
                <div className="deckyhub-details-description" style={{ color: "#e6eef4", fontSize: 16, lineHeight: 1.5, overflowWrap: "anywhere" }}>{app.description}</div>
              </section>
            )}
            {selectedRelease && (
              <section style={{ display: "grid", gap: 6 }}>
                <h3 style={sectionTitle}>
                  {t("details.whatsNew", { version: displayVersion(selectedRelease.tag) })}
                  {selectedRelease.publishedAt && <span style={{ marginLeft: 10, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>{new Date(selectedRelease.publishedAt).toLocaleDateString()}</span>}
                </h3>
                <div className="deckyhub-details-notes" style={{ ...surfaceStyle, padding: "12px 14px", color: "#c3cfd9", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {notesPreview || t("appcard.noReleaseNotes")}
                </div>
              </section>
            )}
          </div>

          {/* Actions, most important first. */}
          <div style={{ display: "grid", gap: 10 }}>
            {selectedRelease && (
              <>
                {install && !hiddenButtons.includes(install.type === PLUGIN_INSTALL_TYPE.INSTALL ? "install" : "update") && (
                  <Button
                    style={{ ...modalButtonStyle, minHeight: 52, fontSize: "1.1em", fontWeight: 700 }}
                    onClick={() => runInstall(selectedRelease, install)}
                    onSecondaryButton={() => showReleaseInfo(t, `${app.name} ${displayVersion(selectedRelease.tag)}`, selectedRelease.publishedAt, selectedRelease.notes)}
                    onSecondaryActionDescription={t("appcard.releaseInfo")}
                    // X downloads the selected release's ZIP instead of installing it.
                    onOptionsButton={hiddenButtons.includes("downloadZip") || downloading || !selectedRelease.assets[0] ? undefined : () => download(selectedRelease.assets[0])}
                    onOptionsActionDescription={t("settings.downloadUpdate")}
                    // Menu opens the repository; close first, or Steam's browser opens underneath this modal.
                    onMenuButton={() => {
                      closeModal?.();
                      Navigation.NavigateToExternalWeb(`https://github.com/${app.repo}`);
                    }}
                    onMenuActionDescription={t("appcard.repository")}
                  >
                    {installIcons[install.type]} {installLabel}
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

            <div onFocus={keepInView} style={{ display: "grid", gap: 4, padding: "8px 12px", background: "rgba(0, 0, 0, 0.2)", borderRadius: 10 }}>
              <h3 style={sectionTitle}>{t("settings.version")}</h3>
              <DropdownItem
                bottomSeparator="none"
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
                <DropdownItem bottomSeparator="none" label={t("settings.version")} rgOptions={versionOptions} selectedOption={selectedTag} disabled={loading} onChange={({ data }) => setSelectedTag(String(data))} />
              )}
              {fetchError && <small style={{ color: "#ff6b6b" }}>{fetchError}</small>}
              {!loading && !fetchError && releases.length === 0 && <small style={{ color: "#ff6b6b" }}>{t("settings.noReleasesFound")}</small>}
            </div>

            <ReleaseActions t={t} url={selectedRelease?.url} repoUrl={`https://github.com/${app.repo}`} hideReleasePage={hiddenButtons.includes("releasePage")} checking={loading} disabled={loading} onCheck={() => void load(true)} closeModal={closeModal} />

            {canUninstall && (
              <Button style={{ ...modalButtonStyle, color: "#ff6b6b" }} onClick={confirmUninstall}>
                <FaTrash /> {t("appcard.uninstall")}
              </Button>
            )}

            <Button style={modalButtonStyle} onClick={closeModal}>
              <FaTimes /> {t("settings.close")}
            </Button>
          </div>
        </div>
      </div>
    </div>
    </ModalRoot>
  );
}
