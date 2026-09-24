import { DialogButtonPrimary as Button, Navigation, PanelSection, PanelSectionRow, showModal } from "@decky/ui";
import { FaDownload } from "react-icons/fa";
import { useT } from "../i18n";
import type { App, Asset, RepoPreference, UpdateChannel } from "../types";
import { cardDescriptionStyle, compactButtonStyle, readableBytes, sectionDividerStyle, statusKey, statusColor } from "../utils";
import { AppDetailsModal } from "./AppDetailsModal";

export function AppCard({
  app,
  preference,
  downloadDisabled,
  onDownload,
  onChannelChange,
}: {
  app: App;
  preference: RepoPreference;
  downloadDisabled?: boolean;
  onDownload: (asset: Asset) => void;
  onChannelChange: (repo: string, channel: UpdateChannel) => void;
}) {
  const t = useT();
  const hasActions = Boolean(app.assets.length || app.releaseUrl);
  return (
    <PanelSection title={app.name}>
      <PanelSectionRow>
        <div>
          <small style={cardDescriptionStyle}>{app.description || " "}</small>
          <span style={{ color: statusColor(app) }}>{t(statusKey(app))}</span>
          <br />
          <small>{t("settings.installedVersion", { version: app.installedVersion ?? "—" })}</small>
          <br />
          <small>{t("settings.latestVersion", { version: app.latestVersion ?? "—" })}</small>
          <br />
          <small style={{ color: app.channel === "prerelease" ? "#ffa94d" : undefined }}>
            {t("appcard.channel", { channel: t(app.channel === "prerelease" ? "appcard.channelPrerelease" : "appcard.channelStable") })}
          </small>
          {app.error && (
            <>
              <br />
              <small>{app.error}</small>
            </>
          )}
        </div>
      </PanelSectionRow>
      {hasActions && <div aria-hidden style={sectionDividerStyle} />}
      {app.assets[0] && (
        <PanelSectionRow>
          <Button style={compactButtonStyle} disabled={downloadDisabled} onClick={() => onDownload(app.assets[0])}>
            <FaDownload /> {t("appcard.latest", { name: app.assets[0].name })}
          </Button>
        </PanelSectionRow>
      )}
      {app.assets.slice(1).map((asset) => (
        <PanelSectionRow key={asset.name}>
          <Button style={compactButtonStyle} disabled={downloadDisabled} onClick={() => onDownload(asset)}>{`${asset.name} (${readableBytes(asset.size)})`}</Button>
        </PanelSectionRow>
      ))}
      {app.releaseUrl && (
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={() => Navigation.NavigateToExternalWeb(app.releaseUrl!)}>
            {t("appcard.releasePage")}
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
                onDownload={onDownload}
                onChannelChange={(channel) => onChannelChange(app.repo, channel)}
              />
            )
          }
        >
          {t("appcard.details")}
        </Button>
      </PanelSectionRow>
    </PanelSection>
  );
}
