import { ButtonItem, Navigation, PanelSection, PanelSectionRow } from "@decky/ui";
import { FaDownload } from "react-icons/fa";
import { useT } from "../i18n";
import type { App, Asset, Download } from "../types";
import { readableBytes, statusKey, statusColor } from "../utils";
import { DownloadProgress } from "./DownloadProgress";

export function AppCard({
  app,
  job,
  onDownload,
  onCancel,
}: {
  app: App;
  job?: { id: string; state: Download } | null;
  onDownload: (asset: Asset) => void;
  onCancel: (jobId: string) => void;
}) {
  const t = useT();
  const active = job && app.assets.some((asset) => asset.name === job.state.filename) ? job : null;
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
              <ButtonItem layout="below" onClick={() => onCancel(active.id)}>
                {t("content.cancel")}
              </ButtonItem>
            )}
          </div>
        </PanelSectionRow>
      )}
      {app.assets[0] && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => onDownload(app.assets[0])}>
            <FaDownload /> {t("appcard.latest", { name: app.assets[0].name })}
          </ButtonItem>
        </PanelSectionRow>
      )}
      {app.assets.slice(1, 4).map((asset) => (
        <PanelSectionRow key={asset.name}>
          <ButtonItem layout="below" onClick={() => onDownload(asset)}>{`${asset.name} (${readableBytes(asset.size)})`}</ButtonItem>
        </PanelSectionRow>
      ))}
      {app.releaseUrl && (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => Navigation.NavigateToExternalWeb(app.releaseUrl!)}>
            {t("appcard.releasePage")}
          </ButtonItem>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}
