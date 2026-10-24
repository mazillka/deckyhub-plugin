import { DialogButtonPrimary as Button, ConfirmModal, Navigation, PanelSection, PanelSectionRow, showModal } from "@decky/ui";
import { useState } from "react";
import { FaArrowUp, FaCog, FaPlus } from "react-icons/fa";
import { useT } from "../i18n";
import type { App, Asset, HideableButton, RepoPreference, UpdateChannel } from "../types";
import { compactButtonStyle, cardDescriptionStyle, installAction, PLUGIN_INSTALL_TYPE, statusKey, statusColor } from "../utils";
import { displayVersion } from "../version";
import type { TFunc } from "../i18n/en";
import { AppDetailsModal, startPluginInstall } from "./AppDetailsModal";

// ponytail: raw markdown minus images and HTML tags; render markdown if plain text reads badly.
// Repeats until nothing changes, so a nested tag like <scr<b>ipt> can't reassemble one.
function plainNotes(notes = "") {
  for (let previous = ""; previous !== notes; ) {
    previous = notes;
    notes = notes.replace(/!\[[^\]]*\]\([^)]*\)|<[^>]*>/g, "");
  }
  return notes.replace(/\n{3,}/g, "\n\n").trim();
}

// Y on an Install/Update button shows what that release changes before installing it.
export const showReleaseInfo = (t: TFunc, title: string, publishedAt?: string | null, notes?: string) =>
  showModal(
    <ConfirmModal
      bAlertDialog
      strTitle={title}
      strDescription={
        <div style={{ whiteSpace: "pre-wrap" }}>
          {publishedAt && <p><small>{new Date(publishedAt).toLocaleDateString()}</small></p>}
          {plainNotes(notes) || t("appcard.noReleaseNotes")}
        </div>
      }
    />,
  );

export function AppCard({
  app,
  preference,
  downloadDisabled,
  hiddenButtons,
  onDownload,
  onChannelChange,
  onUninstalled,
}: {
  app: App;
  preference: RepoPreference;
  downloadDisabled?: boolean;
  hiddenButtons: HideableButton[];
  onDownload: (asset: Asset) => Promise<void>;
  onChannelChange: (repo: string, channel: UpdateChannel) => void;
  onUninstalled: () => void;
}) {
  const t = useT();
  // Quick install/update to the latest release of a Decky plugin;
  // Manage still offers other versions/channels.
  const install = app.latestVersion ? installAction(app, { tag: app.latestVersion, assets: app.assets }) : null;
  // Only offer Update when the card's own status says one is available.
  const isUpdate = install?.type === PLUGIN_INSTALL_TYPE.UPDATE && app.updateAvailable === true;
  const quickAction = install && (isUpdate || install.type === PLUGIN_INSTALL_TYPE.INSTALL) && !hiddenButtons.includes(isUpdate ? "update" : "install");
  // Installs hand over to Decky's own dialog, so leave the Updates/Discover page.
  const leavePage = () => Navigation.NavigateBack();
  // Blocks a second tap from starting a second install while the first is handed over.
  const [installing, setInstalling] = useState(false);
  const latest = app.latestVersion ? displayVersion(app.latestVersion).replace(/^v/, "") : "";
  const quickLabel = t(isUpdate ? "settings.updateTo" : "appcard.installVersion", { version: latest });
  return (
    <PanelSection title={app.name}>
      <PanelSectionRow>
        <div>
          <small style={cardDescriptionStyle}>{app.description || " "}</small>
          <span style={{ color: statusColor(app) }}>{t(statusKey(app))}</span>
          {app.installedVersion && (
            <>
              <br />
              <small>{t("settings.installedVersion", { version: displayVersion(app.installedVersion) })}</small>
            </>
          )}
          <br />
          {/* No release and no error yet: its GitHub check is still running. */}
          <small>{t("settings.latestVersion", { version: app.latestVersion ? displayVersion(app.latestVersion) : app.error ? "—" : t("settings.checkingUpdate") })}</small>
          {/* Stable is the default, so only a pre-release override earns a line. */}
          {app.channel === "prerelease" && (
            <>
              <br />
              <small style={{ color: "#ffa94d" }}>{t("appcard.channel", { channel: t("appcard.channelPrerelease") })}</small>
            </>
          )}
          {app.error && (
            <>
              <br />
              <small style={{ color: "#ff6b6b" }}>{app.error}</small>
            </>
          )}
        </div>
      </PanelSectionRow>
      {install && quickAction && (
        <PanelSectionRow>
          <Button
            style={compactButtonStyle}
            disabled={installing}
            onSecondaryButton={() => showReleaseInfo(t, `${app.name} v${latest}`, app.publishedAt, app.releaseNotes)}
            onSecondaryActionDescription={t("appcard.releaseInfo")}
            // X downloads the same release's ZIP instead of installing it.
            onOptionsButton={hiddenButtons.includes("downloadZip") || downloadDisabled || !app.assets[0] ? undefined : () => void onDownload(app.assets[0])}
            onOptionsActionDescription={t("settings.downloadUpdate")}
            onClick={() => {
              setInstalling(true);
              void startPluginInstall(t, app.name, app.repo, app.assets[0], app.latestVersion!, install, quickLabel, leavePage).finally(() => setInstalling(false));
            }}
          >
            {isUpdate ? <FaArrowUp /> : <FaPlus />} {quickLabel}
          </Button>
        </PanelSectionRow>
      )}
      <PanelSectionRow>
        <Button
          style={compactButtonStyle}
          onClick={() =>
            showModal(
              <AppDetailsModal
                t={t}
                app={app}
                preference={preference}
                downloadDisabled={downloadDisabled}
                hiddenButtons={hiddenButtons}
                onDownload={onDownload}
                onChannelChange={(channel) => onChannelChange(app.repo, channel)}
                onUninstalled={onUninstalled}
              />
            )
          }
        >
          <FaCog /> {t("appcard.manage")}
        </Button>
      </PanelSectionRow>
    </PanelSection>
  );
}
