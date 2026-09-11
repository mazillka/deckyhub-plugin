import { toaster } from "@decky/api";
import { ButtonItem, DropdownItem, Navigation, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import { cancelDownload, getDeckyHubInfo, getDownload, getSettings, installDeckyHubUpdate, saveSettings } from "../api";
import { LOCALE_CHANGED, LOCALES, useT } from "../i18n";
import type { Asset, DeckyHubInfo, DeckyHubRelease, Download, Settings } from "../types";
import { latestDeckyHubRelease } from "../utils";
import { showDownloadComplete } from "../components/DownloadProgress";

export function SettingsPage() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>({ verifySha256: true, overwriteExisting: true, downloadLocation: "plugins", updateChannel: "stable", language: "auto" });
  const [deckyHubInfo, setDeckyHubInfo] = useState<DeckyHubInfo>({ version: "unknown" });
  const [deckyHubRelease, setDeckyHubRelease] = useState<DeckyHubRelease>({});
  const [updateJob, setUpdateJob] = useState<{ id: string; state: Download } | null>(null);

  useEffect(() => {
    void getSettings().then(setSettings);
    void getDeckyHubInfo().then(setDeckyHubInfo);
  }, []);

  useEffect(() => {
    if (!updateJob || !["queued", "downloading"].includes(updateJob.state.state)) return;
    const timer = window.setInterval(() => void getDownload(updateJob.id).then((state) => setUpdateJob({ id: updateJob.id, state })), 500);
    return () => window.clearInterval(timer);
  }, [updateJob]);

  useEffect(() => {
    if (updateJob?.state.state !== "complete") return;
    showDownloadComplete(t, t("settings.deckyhubUpdate"), updateJob.state.path);
  }, [updateJob?.id, updateJob?.state.state]);

  const installUpdate = async (asset: Asset) => {
    const result = await installDeckyHubUpdate(asset);
    if (result.jobId) setUpdateJob({ id: result.jobId, state: { state: "queued", filename: asset.name, total: asset.size } });
  };

  const update = (next: Partial<Settings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    void saveSettings(merged).then((saved) => {
      setSettings(saved);
      if ("language" in next) window.dispatchEvent(new Event(LOCALE_CHANGED));
      toaster.toast({ title: "DeckyHub", body: t("settings.saveSettings") });
    });
  };

  return (
    <>
      <PanelSection title={t("settings.deckyhubUpdate")}>
        <PanelSectionRow>
          {t("settings.installedVersion", { version: deckyHubInfo.version })}
          {deckyHubRelease.version && ` ${t("settings.latestVersion", { version: deckyHubRelease.version })}`}
          {deckyHubRelease.error && (
            <>
              <br />
              <small>{deckyHubRelease.error}</small>
            </>
          )}
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label={t("settings.updateChannel")}
            rgOptions={[
              { label: t("settings.stableReleases"), data: "stable" },
              { label: t("settings.preReleases"), data: "prerelease" },
            ]}
            selectedOption={settings.updateChannel}
            onChange={({ data }) => update({ updateChannel: data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void latestDeckyHubRelease(settings.updateChannel).then(setDeckyHubRelease)}>
            {t("settings.checkUpdate")}
          </ButtonItem>
        </PanelSectionRow>
        {deckyHubRelease.asset && (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => void installUpdate(deckyHubRelease.asset!)}>
              {t("settings.downloadUpdate")}
            </ButtonItem>
          </PanelSectionRow>
        )}
        {updateJob && (
          <PanelSectionRow>
            {updateJob.state.filename}: {updateJob.state.state}{" "}
            {updateJob.state.total ? `(${Math.round((100 * (updateJob.state.received ?? 0)) / updateJob.state.total)}%)` : ""}
            {updateJob.state.state === "complete" && (
              <>
                <br />
                <small>{t("settings.downloadedTo", { path: updateJob.state.path || t("dl.selectedFolder") })}</small>
              </>
            )}
            {updateJob.state.error && (
              <>
                <br />
                <small>{updateJob.state.error}</small>
              </>
            )}
            {["queued", "downloading"].includes(updateJob.state.state) && (
              <ButtonItem layout="below" onClick={() => void cancelDownload(updateJob.id)}>
                {t("content.cancel")}
              </ButtonItem>
            )}
          </PanelSectionRow>
        )}
        {deckyHubRelease.url && (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => Navigation.NavigateToExternalWeb(deckyHubRelease.url!)}>
              {t("appcard.releasePage")}
            </ButtonItem>
          </PanelSectionRow>
        )}
      </PanelSection>

      <PanelSection title={t("settings.downloadSettings")}>
        <PanelSectionRow>{t("settings.whereZipsSaved")}</PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label={t("settings.downloadFolder")}
            rgOptions={[
              { label: "/home/deck/Downloads/plugins (default)", data: "plugins" },
              { label: "/home/deck/Downloads", data: "downloads" },
            ]}
            selectedOption={settings.downloadLocation}
            onChange={({ data }) => update({ downloadLocation: data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label={t("settings.verifySha256")} checked={settings.verifySha256} onChange={(checked) => update({ verifySha256: checked })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label={t("settings.overwriteExisting")} checked={settings.overwriteExisting} onChange={(checked) => update({ overwriteExisting: checked })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label={t("settings.language")}
            rgOptions={[{ label: t("settings.autoDetect"), data: "auto" }, ...LOCALES.map((locale) => ({ label: locale.label, data: locale.code }))]}
            selectedOption={settings.language}
            onChange={({ data }) => update({ language: data })}
          />
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}
