import { DialogButtonPrimary as Button, Navigation, PanelSection, PanelSectionRow } from "@decky/ui";
import { FaDownload } from "react-icons/fa";
import { useT } from "../i18n";
import type { App, Asset } from "../types";
import { compactButtonStyle, readableBytes, sectionDividerStyle, statusKey, statusColor } from "../utils";

export function AppCard({
  app,
  downloadDisabled,
  onDownload,
}: {
  app: App;
  downloadDisabled?: boolean;
  onDownload: (asset: Asset) => void;
}) {
  const t = useT();
  const hasActions = Boolean(app.assets.length || app.releaseUrl);
  return (
    <PanelSection title={app.name}>
      <PanelSectionRow>
        <div>
          {app.description && <small>{app.description}</small>}
          {app.description && <br />}
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
