import { DialogButtonPrimary as Button, PanelSection, PanelSectionRow, showModal } from "@decky/ui";
import { useT } from "../i18n";
import type { App, Asset, RepoPreference, UpdateChannel } from "../types";
import { compactButtonStyle, cardDescriptionStyle, statusKey, statusColor } from "../utils";
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
  return (
    <PanelSection title={app.name}>
      <PanelSectionRow>
        <div>
          <small style={cardDescriptionStyle}>{app.description || " "}</small>
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
