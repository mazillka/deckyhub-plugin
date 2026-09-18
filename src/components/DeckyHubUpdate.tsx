import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Navigation, PanelSection, PanelSectionRow } from "@decky/ui";
import { useEffect, useState } from "react";
import { getDeckyHubInfo, getSettings, installDeckyHubUpdate } from "../api";
import { useT } from "../i18n";
import type { Asset, DeckyHubInfo, DeckyHubRelease, UpdateChannel } from "../types";
import { compactButtonStyle, latestDeckyHubRelease, sectionDividerStyle } from "../utils";
import { showDownloadModal } from "./DownloadProgress";

export function DeckyHubUpdate() {
  const t = useT();
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [info, setInfo] = useState<DeckyHubInfo>({ version: "unknown" });
  const [release, setRelease] = useState<DeckyHubRelease>({});
  const [downloading, setDownloading] = useState(false);

  const checkForUpdate = () =>
    void latestDeckyHubRelease(channel).then((next) => {
      setRelease(next);
      if (next.version && !next.error && info.version !== "unknown" && next.version.trim().replace(/^v/i, "") !== info.version.trim().replace(/^v/i, "")) {
        toaster.toast({ title: "DeckyHub", body: t("settings.updateAvailable", { version: next.version }) });
      }
    });

  useEffect(() => {
    void Promise.all([getSettings(), getDeckyHubInfo()]).then(([settings, nextInfo]) => {
      setChannel(settings.updateChannel);
      setInfo(nextInfo);
    }).catch((error) => setRelease({ error: String(error) }));
  }, []);

  useEffect(() => {
    if (info.version !== "unknown") checkForUpdate();
  }, [channel, info.version]);

  const upToDate = Boolean(release.version && info.version !== "unknown" && release.version.trim().replace(/^v/i, "") === info.version.trim().replace(/^v/i, ""));

  const installUpdate = async (asset: Asset) => {
    try {
      const result = await installDeckyHubUpdate(asset);
      if (result.jobId) {
        setDownloading(true);
        showDownloadModal(t, result.jobId, { state: "queued", filename: asset.name, total: asset.size }, () => setDownloading(false));
      }
    } catch (error) {
      setRelease((current) => ({ ...current, error: String(error) }));
    }
  };

  return (
    <PanelSection title={t("settings.deckyhubUpdate")}>
      <PanelSectionRow>
        <div style={{ display: "grid", gap: 4 }}>
          <div>{t("settings.installedVersion", { version: info.version })}</div>
          {release.version && <div>{t("settings.latestVersion", { version: release.version })}</div>}
          {(release.error || upToDate) && (
            <small style={{ color: release.error ? "#ff6b6b" : "#6bcb6b", marginTop: 4 }}>{release.error || t("settings.noUpdateAvailable", { version: info.version })}</small>
          )}
        </div>
      </PanelSectionRow>
      <div aria-hidden style={sectionDividerStyle} />
      <PanelSectionRow>
        <Button style={compactButtonStyle} onClick={checkForUpdate}>{t("settings.checkUpdate")}</Button>
      </PanelSectionRow>
      {release.asset && !upToDate && (
        <PanelSectionRow>
          <Button style={compactButtonStyle} disabled={downloading} onClick={() => void installUpdate(release.asset!)}>{t("settings.downloadUpdate")}</Button>
        </PanelSectionRow>
      )}
      {release.url && (
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={() => Navigation.NavigateToExternalWeb(release.url!)}>{t("appcard.releasePage")}</Button>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}
