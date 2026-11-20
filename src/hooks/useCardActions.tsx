import { Navigation, showModal } from "@decky/ui";
import { useState, useSyncExternalStore } from "react";
import { AppDetailsModal } from "../components/AppDetailsModal";
import { startPluginInstall } from "../components/InstallFlow";
import { plainNotes, showReleaseInfo } from "../components/ReleaseInfo";
import { openExternalWeb, rememberOpener } from "../external";
import { useT } from "../i18n";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import { installWarnings, type App, type Asset, type HideableButton, type RepoPreference } from "../types";
import { installAction, isInstalling, PLUGIN_INSTALL_TYPE, statusColor, subscribeInstalling } from "../utils";
import { displayVersion } from "../version";

// "row": one line of a list.
export type CardLayout = "card" | "row";

export type AppCardProps = {
  app: App;
  preference: RepoPreference;
  downloadDisabled?: boolean;
  hiddenButtons: HideableButton[];
  onDownload: (asset: Asset) => Promise<void>;
  onPreferenceChange: (repo: string, preference: RepoPreference) => void;
  onUninstalled: () => void;
  layout?: CardLayout;
  // Discover only: narrows the list to this plugin's author (count: how many plugins that is).
  moreFromAuthor?: { count: number; show: () => void };
};

type Install = NonNullable<ReturnType<typeof installAction>>;

// Hands the card's latest release to Decky Loader's own dialog (installs leave the Updates/Discover page).
function startQuickInstall(t: TFunc, app: App, install: Install, label: string) {
  return startPluginInstall(
    t,
    app.name,
    app.repo,
    app.assets[0],
    app.latestVersion!,
    install,
    label,
    () => Navigation.NavigateBack(),
    installWarnings(app),
    {
      root: app.stats?.root === true,
      prerelease: app.latestPrerelease === true,
      note: app.identityTrusted
        ? t("install.replaces", {
            name: app.pluginName ?? app.name,
            version: displayVersion(app.installedVersion ?? "").replace(/^v/, ""),
          })
        : undefined,
    },
  );
}

// The Manage window. Its Repository button closes it from code, which doesn't give focus back to the card.
function showManage(t: TFunc, props: AppCardProps, event: MouseEvent) {
  const { app, onPreferenceChange } = props;
  rememberOpener(event.currentTarget);
  showModal(
    <AppDetailsModal
      t={t}
      app={app}
      preference={props.preference}
      downloadDisabled={props.downloadDisabled}
      hiddenButtons={props.hiddenButtons}
      onDownload={props.onDownload}
      onPreferenceChange={(next) => onPreferenceChange(app.repo, next)}
      onUninstalled={props.onUninstalled}
      moreFromAuthor={props.moreFromAuthor}
    />,
  );
}

// What a card can do, shared by the Default card and the Experimental one (ExpAppCard):
// the quick Install / Update (with Y / X / Menu on it) and the Manage window.
export function useCardActions(props: AppCardProps) {
  const { app, downloadDisabled, hiddenButtons, onDownload } = props;
  const t = useT();
  // Quick install/update to the latest release of a Decky plugin;
  // Manage still offers other versions/channels.
  const install =
    !app.store && app.latestVersion ? installAction(app, { tag: app.latestVersion, assets: app.assets }) : null;
  // Only offer Update when the card's own status says one is available.
  const isUpdate = install?.type === PLUGIN_INSTALL_TYPE.UPDATE && app.updateAvailable === true;
  const quickAction = Boolean(
    install &&
    (isUpdate || install.type === PLUGIN_INSTALL_TYPE.INSTALL) &&
    !hiddenButtons.includes(isUpdate ? "update" : "install"),
  );
  // Blocks a second tap from starting a second install while the first is handed over.
  const [installing, setInstalling] = useState(false);
  const latest = app.latestVersion ? displayVersion(app.latestVersion).replace(/^v/, "") : "";
  const quickLabel = t(isUpdate ? "settings.updateTo" : "appcard.installVersion", { version: latest });
  // Decky is installing it now (after its confirmation): say so until it finishes.
  const deckyInstalling = useSyncExternalStore(subscribeInstalling, () =>
    Boolean(install && isInstalling(install.name)),
  );
  const quickButtonProps = {
    disabled: installing || deckyInstalling,
    onSecondaryButton: () => showReleaseInfo(t, `${app.name} v${latest}`, app.publishedAt, app.releaseNotes),
    onSecondaryActionDescription: t("appcard.releaseInfo"),
    // X downloads the same release's ZIP instead of installing it.
    onOptionsButton:
      hiddenButtons.includes("downloadZip") || downloadDisabled || !app.assets[0]
        ? undefined
        : () => void onDownload(app.assets[0]),
    onOptionsActionDescription: t("settings.downloadUpdate"),
    // Menu opens the plugin's GitHub page, to read about it before installing.
    onMenuButton: () => openExternalWeb(`https://github.com/${app.repo}`),
    onMenuActionDescription: t("appcard.repository"),
    onClick: () => {
      if (!install) return;
      setInstalling(true);
      void startQuickInstall(t, app, install, quickLabel).finally(() => setInstalling(false));
    },
  };
  const openManage = (event: MouseEvent) => showManage(t, props, event);
  return {
    t,
    install,
    isUpdate,
    quickAction,
    latest,
    quickLabel,
    notes: isUpdate ? plainNotes(app.releaseNotes).replace(/\s+/g, " ") : "",
    deckyInstalling,
    accent: deckyInstalling ? colors.blue : (statusColor(app) ?? colors.accent),
    quickButtonProps,
    openManage,
  };
}
