import { DialogButtonPrimary as Button, Focusable, Navigation, showModal } from "@decky/ui";
import { useState } from "react";
import { FaArrowUp, FaCog, FaPlus } from "react-icons/fa";
import { useT } from "../i18n";
import type { App, Asset, HideableButton, RepoPreference, UpdateChannel } from "../types";
import { compactButtonStyle, cardDescriptionStyle, ellipsis, installAction, PLUGIN_INSTALL_TYPE, statusKey, statusColor, surfaceStyle, visuallyHidden } from "../utils";
import { displayVersion } from "../version";
import { AppDetailsModal } from "./AppDetailsModal";
import { startPluginInstall } from "./InstallFlow";
import { AppBadges, AppMonogram, AppStats, pillStyle } from "./AppBadges";
import { showReleaseInfo } from "./ReleaseInfo";

// Card chrome. The top border takes the status color (see statusColor()).
const cardStyle = {
  display: "grid",
  gridTemplateColumns: "40px minmax(0, 1fr)",
  gridTemplateRows: "auto auto",
  alignContent: "start",
  columnGap: 10,
  rowGap: 8,
  ...surfaceStyle,
  height: "100%",
  padding: 12,
  borderTop: "3px solid",
};
const fullRow = { gridColumn: "1 / -1" };
const cardTitleStyle = { margin: 0, overflow: "hidden", color: "#fff", fontSize: "1.05em", fontWeight: 700, lineHeight: 1.2, textOverflow: "ellipsis", whiteSpace: "nowrap" as const };
const categoryStyle = { color: "#8fcef4", fontSize: "max(12px, 0.78em)", letterSpacing: "0.04em", textTransform: "uppercase" as const };

export function AppCard({
  app,
  preference,
  downloadDisabled,
  hiddenButtons,
  onDownload,
  onChannelChange,
  onUninstalled,
  layout = "card",
}: {
  app: App;
  preference: RepoPreference;
  downloadDisabled?: boolean;
  hiddenButtons: HideableButton[];
  onDownload: (asset: Asset) => Promise<void>;
  onChannelChange: (repo: string, channel: UpdateChannel) => void;
  onUninstalled: () => void;
  // "row": one line of Discover's list view.
  layout?: "card" | "row";
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
  const accent = statusColor(app) ?? "#8fcef4";
  const statusPill = <span style={{ ...pillStyle, color: accent, background: `${accent}22`, borderColor: `${accent}66` }}>{t(statusKey(app))}</span>;
  const row = layout === "row";
  // Install/Update, with Manage as a gear beside it; Manage alone takes the full width.
  const actions = (
      <Focusable flow-children="right" style={{ display: "flex", gap: 8, ...(row ? {} : { ...fullRow, marginTop: "auto" }) }}>
      {install && quickAction && (
          <div style={{ flex: 1, minWidth: 0 }}>
          <Button
            style={{ ...compactButtonStyle, marginBottom: 0 }}
            disabled={installing}
            onSecondaryButton={() => showReleaseInfo(t, `${app.name} v${latest}`, app.publishedAt, app.releaseNotes)}
            onSecondaryActionDescription={t("appcard.releaseInfo")}
            // X downloads the same release's ZIP instead of installing it.
            onOptionsButton={hiddenButtons.includes("downloadZip") || downloadDisabled || !app.assets[0] ? undefined : () => void onDownload(app.assets[0])}
            onOptionsActionDescription={t("settings.downloadUpdate")}
            // Menu opens the plugin's GitHub page, to read about it before installing.
            onMenuButton={() => Navigation.NavigateToExternalWeb(`https://github.com/${app.repo}`)}
            onMenuActionDescription={t("appcard.repository")}
            onClick={() => {
              setInstalling(true);
              void startPluginInstall(t, app.name, app.repo, app.assets[0], app.latestVersion!, install, quickLabel, leavePage).finally(() => setInstalling(false));
            }}
          >
            {isUpdate ? <FaArrowUp /> : <FaPlus />} <span style={ellipsis}>{quickLabel}</span>
          </Button>
          </div>
      )}
        <div style={install && quickAction ? { flex: "0 0 44px" } : { flex: 1 }}>
        <Button
          style={{ ...compactButtonStyle, marginBottom: 0, ...(install && quickAction && { padding: 0 }) }}
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
          {/* The label stays as hidden text, so the gear keeps its name for screen readers and tests. */}
          <FaCog /> <span style={install && quickAction ? visuallyHidden : undefined}>{t("appcard.manage")}</span>
        </Button>
        </div>
      </Focusable>
  );
  if (row)
    return (
      // The name is a direct child here too, so a row's buttons are found from its heading.
      <div className="deckyhub-app-row deckyhub-focus-ring" style={{ ...surfaceStyle, display: "grid", gridTemplateColumns: "40px minmax(0, 1.5fr) minmax(0, 1.5fr) 230px", gridTemplateRows: "auto auto", alignItems: "center", columnGap: 12, rowGap: 2, padding: "8px 12px" }}>
        <AppMonogram app={app} style={{ gridRow: "1 / 3", width: 40, height: 40, fontSize: "0.85em" }} />
        {/* Name, with the description under it. */}
        <h3 style={{ ...cardTitleStyle, gridColumn: 2, gridRow: 1 }}>{app.name}</h3>
        <small style={{ gridColumn: 2, gridRow: 2, color: "#b8c7d3", ...ellipsis }}>{app.error || app.description}</small>
        {/* Status and badges, then the stats on one line under them. */}
        <div style={{ gridColumn: 3, gridRow: 1, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 10px" }}>
          {statusPill}
          <AppBadges app={app} t={t} />
        </div>
        <div style={{ gridColumn: 3, gridRow: 2, display: "flex", gap: 10, color: "#8b9aa7", fontSize: "max(12px, 0.8em)", ...ellipsis }}>
          <AppStats app={app} t={t} />
        </div>
        <div style={{ gridColumn: 4, gridRow: "1 / 3" }}>{actions}</div>
      </div>
    );
  return (
    // The name stays a direct child of the card: tests (and screen readers)
    // find a card's buttons from its heading.
    <div className="deckyhub-focus-ring" style={{ ...cardStyle, borderTopColor: accent }}>
      <AppMonogram app={app} style={{ gridRow: "1 / 3", alignSelf: "center" }} />
      <h3 style={cardTitleStyle}>{app.name}</h3>
      <small style={categoryStyle}>{app.category}</small>
      <div style={fullRow}>
        {statusPill}
        {/* Stable is the default, so only a pre-release override earns a pill. */}
        {app.channel === "prerelease" && (
          <span style={{ ...pillStyle, color: "#ffa94d", background: "#ffa94d22", borderColor: "#ffa94d66" }}>{t("appcard.channel", { channel: t("appcard.channelPrerelease") })}</span>
        )}
        <AppBadges app={app} t={t} />
      </div>
      <small style={{ ...cardDescriptionStyle, ...fullRow, display: "-webkit-box", color: "#b8c7d3" }}>{app.description || " "}</small>
      <div style={{ ...fullRow, display: "flex", flexWrap: "wrap", gap: "2px 14px", color: "#8b9aa7", fontSize: "max(12px, 0.8em)" }}>
        {app.installedVersion && <span>{t("settings.installedVersion", { version: displayVersion(app.installedVersion) })}</span>}
        {/* No release and no error yet: its GitHub check is still running. */}
        <span>{t("settings.latestVersion", { version: app.latestVersion ? displayVersion(app.latestVersion) : app.error ? "—" : t("settings.checkingUpdate") })}</span>
        <AppStats app={app} t={t} />
      </div>
      {app.error && <small style={{ ...fullRow, color: "#ff6b6b", overflowWrap: "anywhere" }}>{app.error}</small>}
      {actions}
    </div>
  );
}
