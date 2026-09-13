import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Navigation, PanelSection, PanelSectionRow } from "@decky/ui";
import { useEffect, useState } from "react";
import { cancelDownload, getDeckyHubInfo, getDownload, getSettings, installDeckyHubUpdate } from "../api";
import { useT } from "../i18n";
import type { Asset, DeckyHubInfo, DeckyHubRelease, Download, UpdateChannel } from "../types";
import { compactButtonStyle, latestDeckyHubRelease, sectionDividerStyle } from "../utils";
import { DownloadProgress, showDownloadComplete } from "./DownloadProgress";

export function DeckyHubUpdate() {
  const t = useT();
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [info, setInfo] = useState<DeckyHubInfo>({ version: "unknown" });
  const [release, setRelease] = useState<DeckyHubRelease>({});
  const [job, setJob] = useState<{ id: string; state: Download } | null>(null);

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
    });
  }, []);

  useEffect(() => {
    if (info.version !== "unknown") checkForUpdate();
  }, [channel, info.version]);

  useEffect(() => {
    if (!job || !["queued", "downloading"].includes(job.state.state)) return;
    const timer = window.setInterval(() => void getDownload(job.id).then((state) => setJob({ id: job.id, state })), 500);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (job?.state.state === "complete") showDownloadComplete(t, t("settings.deckyhubUpdate"), job.state.path);
  }, [job?.id, job?.state.state]);

  const upToDate = Boolean(release.version && info.version !== "unknown" && release.version.trim().replace(/^v/i, "") === info.version.trim().replace(/^v/i, ""));

  const installUpdate = async (asset: Asset) => {
    const result = await installDeckyHubUpdate(asset);
    if (result.jobId) setJob({ id: result.jobId, state: { state: "queued", filename: asset.name, total: asset.size } });
  };

  return (
    <PanelSection title={t("settings.deckyhubUpdate")}>
      <PanelSectionRow>
        {t("settings.installedVersion", { version: info.version })}
        {release.version && ` ${t("settings.latestVersion", { version: release.version })}`}
        {(release.error || upToDate) && (
          <>
            <br />
            <small>{release.error || t("settings.noUpdateAvailable", { version: info.version })}</small>
          </>
        )}
      </PanelSectionRow>
      <div aria-hidden style={sectionDividerStyle} />
      <PanelSectionRow>
        <Button style={compactButtonStyle} onClick={checkForUpdate}>{t("settings.checkUpdate")}</Button>
      </PanelSectionRow>
      {release.asset && !upToDate && (
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={() => void installUpdate(release.asset!)}>{t("settings.downloadUpdate")}</Button>
        </PanelSectionRow>
      )}
      {job && (
        <PanelSectionRow>
          {job.state.filename}: {job.state.state} {job.state.total ? `(${Math.round((100 * (job.state.received ?? 0)) / job.state.total)}%)` : ""}
          <DownloadProgress download={job.state} />
          {job.state.state === "complete" && <small>{t("settings.downloadedTo", { path: job.state.path || t("dl.selectedFolder") })}</small>}
          {job.state.error && <small>{job.state.error}</small>}
          {["queued", "downloading"].includes(job.state.state) && <Button style={compactButtonStyle} onClick={() => void cancelDownload(job.id)}>{t("content.cancel")}</Button>}
        </PanelSectionRow>
      )}
      {release.url && !upToDate && (
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={() => Navigation.NavigateToExternalWeb(release.url!)}>{t("appcard.releasePage")}</Button>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}
