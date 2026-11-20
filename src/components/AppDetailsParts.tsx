import { DialogButtonPrimary as Button, Focusable, showModal } from "@decky/ui";
import {
  FaArrowDown,
  FaArrowUp,
  FaExclamationTriangle,
  FaFileArchive,
  FaPlus,
  FaRedo,
  FaShieldAlt,
} from "react-icons/fa";
import { openExternalWeb } from "../external";
import type { useAppInstall } from "../hooks/useAppInstall";
import type { useRepoPreference } from "../hooks/useRepoPreference";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import type { App, AppReleaseOption } from "../types";
import { modalButtonStyle, PLUGIN_INSTALL_TYPE, readableBytes, surfaceStyle } from "../utils";
import { displayVersion } from "../version";
import { AppBadges } from "./AppBadges";
import { AppStats } from "./AppStats";
import { showReleaseInfo } from "./ReleaseInfo";
import { keepInView } from "./KeepInView";
import { WideConfirmModal } from "./WideModal";

type Close = (() => void) | undefined;
type Pref = ReturnType<typeof useRepoPreference>;
type Install = ReturnType<typeof useAppInstall>;

// The window's main action, taller than the rest.
export const primaryButtonStyle = { ...modalButtonStyle, minHeight: 52, fontSize: "1.1em", fontWeight: 700 };

const halfButtonStyle = { ...modalButtonStyle, width: "auto", flex: "1 1 auto" };

const installIcons = {
  [PLUGIN_INSTALL_TYPE.INSTALL]: <FaPlus />,
  [PLUGIN_INSTALL_TYPE.REINSTALL]: <FaRedo />,
  [PLUGIN_INSTALL_TYPE.UPDATE]: <FaArrowUp />,
  [PLUGIN_INSTALL_TYPE.DOWNGRADE]: <FaArrowDown />,
};

// Under the title: category, installed version, stats, badges and what to know before installing.
export function AppMeta({ app, t }: { app: App; t: TFunc }) {
  return (
    <>
      <span style={{ color: colors.accent, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {app.category}
      </span>
      <span>
        {t("settings.installedVersion", { version: app.installedVersion ? displayVersion(app.installedVersion) : "—" })}
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
  );
}

// A store plugin isn't installed from DeckyHub: the steps to follow in Decky's own store.
export function StoreInstallSteps({ app, t }: { app: App; t: TFunc }) {
  return (
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
  );
}

// Only for a plugin DeckyHub can't match to its repository: above Download ZIP, since they are the way to install it.
export function UnverifiedActions({
  t,
  app,
  release,
  pref,
  install,
  closeModal,
}: {
  t: TFunc;
  app: App;
  release?: AppReleaseOption | null;
  pref: Pref;
  install: Install;
  closeModal: Close;
}) {
  const { anyway, runInstallAnyway } = install;
  const trustable = Boolean(app.identityUnverified && app.uninstallName && app.uninstallName !== "DeckyHub");
  if (!anyway && !trustable && !app.identityTrusted) return null;
  const confirmTrust = () =>
    showModal(
      <WideConfirmModal
        strTitle={t("appcard.trustConfirmTitle")}
        strDescription={t("appcard.trustConfirmBody", { name: app.uninstallName ?? app.name })}
        strOKButtonText={t("appcard.trustPlugin")}
        bDestructiveWarning
        onOK={() => {
          pref.trust(app.uninstallName!);
          closeModal?.();
        }}
      />,
    );
  return (
    <Focusable flow-children="right" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {anyway && release && (
        <Button style={{ ...halfButtonStyle, color: colors.warning }} onClick={() => runInstallAnyway(release, anyway)}>
          <FaExclamationTriangle /> {t("appcard.installAnyway")}
        </Button>
      )}
      {trustable && (
        <Button style={halfButtonStyle} onClick={confirmTrust}>
          <FaShieldAlt /> {t("appcard.trustPlugin")}
        </Button>
      )}
      {app.identityTrusted && (
        <Button
          style={halfButtonStyle}
          onClick={() => {
            pref.stopTrusting();
            closeModal?.();
          }}
        >
          <FaShieldAlt /> {t("appcard.untrustPlugin")}
        </Button>
      )}
    </Focusable>
  );
}

// The Install / Update button for the selected release. X downloads its ZIP, Y shows its notes,
// Menu opens the repository.
export function InstallButton({
  t,
  app,
  release,
  install,
  installLabel,
  onInstall,
  onDownloadZip,
  closeModal,
}: {
  t: TFunc;
  app: App;
  release: AppReleaseOption;
  install: NonNullable<Install["install"]>;
  installLabel: string;
  onInstall: () => void;
  onDownloadZip?: () => void;
  closeModal: Close;
}) {
  return (
    <Button
      style={primaryButtonStyle}
      onClick={onInstall}
      onSecondaryButton={() =>
        showReleaseInfo(t, `${app.name} ${displayVersion(release.tag)}`, release.publishedAt, release.notes)
      }
      onSecondaryActionDescription={t("appcard.releaseInfo")}
      // X downloads the selected release's ZIP instead of installing it.
      onOptionsButton={onDownloadZip}
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
  );
}

// Download ZIP for the selected release's asset, and a button for each further asset.
export function DownloadButtons({
  t,
  release,
  disabled,
  onDownload,
}: {
  t: TFunc;
  release: AppReleaseOption;
  disabled: boolean;
  onDownload: (asset: AppReleaseOption["assets"][number]) => void;
}) {
  return (
    <>
      {release.assets[0] ? (
        <Button style={modalButtonStyle} disabled={disabled} onClick={() => onDownload(release.assets[0])}>
          <FaFileArchive /> {t("settings.downloadUpdate")}
        </Button>
      ) : (
        <small style={{ color: colors.danger }}>{t("appcard.noMatchingAsset")}</small>
      )}
      {release.assets.slice(1).map((asset) => (
        <Button key={asset.name} style={modalButtonStyle} disabled={disabled} onClick={() => onDownload(asset)}>
          <FaFileArchive /> {`${asset.name} (${readableBytes(asset.size)})`}
        </Button>
      ))}
    </>
  );
}
