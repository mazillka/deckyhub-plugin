import { toaster } from "@decky/api";
import { openExternalWeb } from "../external";
import { DialogButtonPrimary as Button, Focusable, Navigation, showModal } from "@decky/ui";
import { WideConfirmModal } from "./WideModal";
import { useState } from "react";
import {
  FaArrowDown,
  FaArrowUp,
  FaEye,
  FaEyeSlash,
  FaExclamationTriangle,
  FaShieldAlt,
  FaLock,
  FaUnlock,
  FaFileArchive,
  FaPlus,
  FaRedo,
  FaTimes,
  FaSync,
  FaTrash,
} from "react-icons/fa";
import { getDeckyHubInfo, saveRepoSettings } from "../api";
import { reportIssueUrl } from "../report";
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
  unverifiedInstallAction,
  installTypeLabel,
  listAppReleases,
  modalButtonStyle,
  PLUGIN_INSTALL_TYPE,
  readableBytes,
  surfaceStyle,
  uninstallDeckyPlugin,
} from "../utils";
import { startPluginInstall } from "./InstallFlow";
import { displayVersion } from "../version";
import { AppBadges, AppMonogram, AppStats, FindingsSummary } from "./AppBadges";
import { showReleaseInfo } from "./ReleaseInfo";
import { DetailsRow, DetailsWindow } from "./DetailsWindow";
import { VirusScanReport } from "./VirusScanReport";
import { KnownIssues } from "./KnownIssues";
import { ReleaseActions, useReleasePicker } from "./VersionPickerPanel";
import { colors } from "../styles";
import { keepInView } from "./KeepInView";

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

  // Pin: keep the installed version; no update is offered until it is unpinned.
  const pinned = Boolean(preference.pinVersion);
  const togglePin = () => {
    const { pinVersion: _, ...rest } = preference;
    changePreference(pinned ? rest : { ...rest, pinVersion: app.installedVersion! });
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
      release.assets[0]?.url === app.assets[0]?.url ? installWarnings(app, release.prerelease) : [],
      {
        // The registry's root flag describes the card's release; a pre-release says so for any release.
        root: release.assets[0]?.url === app.assets[0]?.url && app.stats?.root === true,
        prerelease: release.prerelease === true,
        note: app.identityTrusted
          ? t("install.replaces", {
              name: app.pluginName ?? app.name,
              version: displayVersion(app.installedVersion ?? "").replace(/^v/, ""),
            })
          : undefined,
      },
    );

  // An unverified plugin DeckyHub can still address by one unambiguous name: the user may install over it
  // anyway, or trust it so it updates like any other. Both say what will be replaced and by what.
  const anyway = selectedRelease && unverifiedInstallAction(app, selectedRelease);
  const unverifiedBody = (tag: string) =>
    t("appcard.unverifiedConfirmBody", {
      name: app.uninstallName ?? app.name,
      version: displayVersion(app.installedVersion ?? "").replace(/^v/, ""),
      repo: app.repo,
      tag: displayVersion(tag),
    });
  const runInstallAnyway = (release: AppReleaseOption, action: NonNullable<typeof anyway>) =>
    void startPluginInstall(
      t,
      app.name,
      app.repo,
      release.assets[0],
      release.tag,
      action,
      t("appcard.installAnyway"),
      () => {
        closeModal?.();
        Navigation.NavigateBack();
      },
      release.assets[0]?.url === app.assets[0]?.url ? installWarnings(app, release.prerelease) : [],
      { prerelease: release.prerelease === true, note: unverifiedBody(release.tag) },
    );
  const trustable = Boolean(app.identityUnverified && app.uninstallName && app.uninstallName !== "DeckyHub");
  const confirmTrust = () =>
    showModal(
      <WideConfirmModal
        strTitle={t("appcard.trustConfirmTitle")}
        strDescription={t("appcard.trustConfirmBody", { name: app.uninstallName ?? app.name })}
        strOKButtonText={t("appcard.trustPlugin")}
        bDestructiveWarning
        onOK={() => {
          changePreference({ ...preference, trustedIdentity: app.uninstallName! });
          closeModal?.();
        }}
      />,
    );
  const stopTrusting = () => {
    const { trustedIdentity: _, ...rest } = preference;
    changePreference(rest);
    closeModal?.();
  };

  // Installed Decky plugins can be removed through Decky Loader — never
  // DeckyHub itself from here. The loader doesn't confirm, so we do.
  // An unverified one is removed by the name Decky knows it by, when that name is unique (uninstallName).
  const uninstallName = app.pluginName ?? app.uninstallName;
  const canUninstall = Boolean(uninstallName && uninstallName !== "DeckyHub");
  const confirmUninstall = () =>
    showModal(
      <WideConfirmModal
        strTitle={t("appcard.uninstallTitle", { name: app.name })}
        strDescription={
          app.identityUnverified
            ? `${t("appcard.uninstallByName", { name: uninstallName! })} ${t("appcard.uninstallDescription")}`
            : t("appcard.uninstallDescription")
        }
        strOKButtonText={t("appcard.uninstall")}
        bDestructiveWarning
        onOK={() => {
          closeModal?.();
          void uninstallDeckyPlugin(uninstallName!).then(
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
          <AppStats app={app} t={t} detailed />
          {app.identityUnverified && <span style={{ color: colors.warning }}>{t("appcard.identityUnverified")}</span>}
          {app.identityTrusted && <span style={{ color: colors.muted }}>{t("appcard.identityTrusted")}</span>}
          <AppBadges app={app} t={t} />
          {/* What Runs as root means, right where you decide to install. */}
          {!app.store && app.stats?.root && (
            <span style={{ flexBasis: "100%", color: colors.caution }}>{t("appcard.runsAsRootHint")}</span>
          )}
        </>
      }
      description={app.description}
      release={app.store ? null : selectedRelease}
      primary={
        app.store ? (
          <Focusable
            flow-children="down"
            onFocus={keepInView}
            style={{ ...surfaceStyle, display: "grid", gap: 8, padding: 14 }}
          >
            <strong>{t("appcard.storeInstallTitle")}</strong>
            <span>{t("appcard.storeInstallStep1")}</span>
            <span>{t("appcard.storeInstallStep2", { name: app.name })}</span>
            <span>{t("appcard.storeInstallStep3")}</span>
          </Focusable>
        ) : (
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
        )
      }
      // Known issues sit above the scan report, not in the header: the header is one focus
      // target, so the D-pad can't reach a link inside it (seen on a Deck).
      collapsible
      scan={
        !app.store && (
          <>
            <FindingsSummary app={app} t={t} />
            {app.knownIssues?.length ? <KnownIssues t={t} issues={app.knownIssues} closeModal={closeModal} /> : null}
          </>
        )
      }
      report={
        !app.store && (
          <VirusScanReport
            key={JSON.stringify([selectedRelease?.assets[0]?.url, selectedRelease?.assets[0]?.sha256])}
            t={t}
            asset={selectedRelease?.assets[0]}
            version={selectedRelease?.tag}
            closeModal={closeModal}
            showZipActions={false}
          />
        )
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
      hideVersionPicker={app.store}
      footer={
        <>
          {/* The links, in one row. */}
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
            hideCheck
          />
          {/* The routine and the rare actions behind one row, so the window doesn't end in a long stack. */}
          <DetailsRow title={t("notice.more")}>
            <Focusable flow-children="down" style={{ display: "grid", gap: 8 }}>
              {!app.store && (
                <Button style={modalButtonStyle} disabled={loading} onClick={() => void load(true)}>
                  <FaSync /> {loading ? t("settings.checkingUpdate") : t("settings.checkUpdate")}
                </Button>
              )}
              {canSkip && (
                <Button style={modalButtonStyle} onClick={toggleSkip}>
                  {skipped ? <FaEye /> : <FaEyeSlash />}{" "}
                  {t(skipped ? "appcard.unskipVersion" : "appcard.skipVersion", { version: displayVersion(latest!) })}
                </Button>
              )}
              {app.installedVersion && !app.store && (
                <Button style={modalButtonStyle} onClick={togglePin}>
                  {pinned ? <FaUnlock /> : <FaLock />}{" "}
                  {t(pinned ? "appcard.unpinVersion" : "appcard.pinVersion", {
                    version: displayVersion(pinned ? preference.pinVersion! : app.installedVersion),
                  })}
                </Button>
              )}
              <Button
                style={modalButtonStyle}
                onClick={async () => {
                  const info = await getDeckyHubInfo().catch(() => null);
                  const issue = reportIssueUrl({
                    repo: app.repo,
                    name: app.name,
                    version: app.installedVersion ? displayVersion(app.installedVersion) : undefined,
                    deckyhubVersion: info?.version,
                  });
                  if (!issue) return;
                  closeModal?.();
                  openExternalWeb(issue);
                }}
              >
                <FaExclamationTriangle /> {t("appcard.reportProblem")}
              </Button>
            </Focusable>
          </DetailsRow>
          {/* Only for a plugin DeckyHub can't match to its repository. */}
          {(anyway || trustable || app.identityTrusted) && (
            <Focusable flow-children="right" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {anyway && selectedRelease && (
                <Button
                  style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto", color: colors.warning }}
                  onClick={() => runInstallAnyway(selectedRelease, anyway)}
                >
                  <FaExclamationTriangle /> {t("appcard.installAnyway")}
                </Button>
              )}
              {trustable && (
                <Button style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }} onClick={confirmTrust}>
                  <FaShieldAlt /> {t("appcard.trustPlugin")}
                </Button>
              )}
              {app.identityTrusted && (
                <Button style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }} onClick={stopTrusting}>
                  <FaShieldAlt /> {t("appcard.untrustPlugin")}
                </Button>
              )}
            </Focusable>
          )}
          {/* Remove apart from the rest, and Close beside it. */}
          <Focusable flow-children="right" style={{ display: "flex", gap: 8 }}>
            {canUninstall && (
              <Button
                style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto", color: colors.danger }}
                onClick={confirmUninstall}
              >
                <FaTrash /> {t("appcard.uninstall")}
              </Button>
            )}
            <Button style={{ ...modalButtonStyle, width: "auto", flex: "1 1 auto" }} onClick={closeModal}>
              <FaTimes /> {t("settings.close")}
            </Button>
          </Focusable>
        </>
      }
    />
  );
}
