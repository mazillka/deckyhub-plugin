import { DialogButtonPrimary as Button, Navigation, PanelSection, PanelSectionRow } from "@decky/ui";
import { FaDownload } from "react-icons/fa";
import { useT } from "../i18n";
import type { App, Asset, Download } from "../types";
import { compactButtonStyle, readableBytes, sectionDividerStyle, statusKey, statusColor } from "../utils";
import { DownloadProgress } from "./DownloadProgress";

export function AppCard({
  app,
  job,
  downloadDisabled,
  onDownload,
  onCancel,
}: {
  app: App;
  job?: { id: string; state: Download } | null;
  downloadDisabled?: boolean;
  onDownload: (asset: Asset) => void;
  onCancel: (jobId: string) => void;
}) {
  const t = useT();
  const active = job && app.assets.some((asset) => asset.name === job.state.filename) ? job : null;
  const hasActions = Boolean(active || app.assets.length || app.releaseUrl);
  return (
    <PanelSection title={`${app.name} · ${app.category}`}>
      <PanelSectionRow>
        <div>
          <span style={{ color: statusColor(app) }}>{t(statusKey(app))}</span>
          <br />
          <small>{t("appcard.installedLatest", { installed: app.installedVersion ?? "—", latest: app.latestVersion ?? "—" })}</small>
          {app.error && (
            <>
              <br />
              <small>{app.error}</small>
            </>
          )}
        </div>
      </PanelSectionRow>
      {hasActions && <div aria-hidden style={sectionDividerStyle} />}
      {active && (
        <PanelSectionRow>
          <div>
            <strong>
              {active.state.state === "complete" ? t("appcard.downloadComplete") : active.state.state === "error" ? t("appcard.downloadFailed") : t("appcard.downloading")}
            </strong>
            <br />
            <small>
              {readableBytes(active.state.received)} / {active.state.total ? readableBytes(active.state.total) : t("appcard.unknownSize")}
            </small>
            <DownloadProgress download={active.state} />
            {active.state.error && (
              <>
                <br />
                <small>{active.state.error}</small>
              </>
            )}
            {active.state.state === "downloading" && (
              <Button style={compactButtonStyle} onClick={() => onCancel(active.id)}>
                {t("content.cancel")}
              </Button>
            )}
          </div>
        </PanelSectionRow>
      )}
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
    </PanelSection>
  );
}
