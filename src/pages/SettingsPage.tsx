import { toaster } from "@decky/api";
import { ButtonItem, DropdownItem, Navigation, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import { cancelDownload, getDeckyHubInfo, getDownload, getSettings, installDeckyHubUpdate, saveSettings } from "../api";
import type { Asset, DeckyHubInfo, DeckyHubRelease, Download, Settings } from "../types";
import { latestDeckyHubRelease } from "../utils";
import { showDownloadComplete } from "../components/DownloadProgress";

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ verifySha256: true, overwriteExisting: true, downloadLocation: "plugins", updateChannel: "stable" });
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
    showDownloadComplete("DeckyHub Update Downloaded", updateJob.state.path);
  }, [updateJob?.id, updateJob?.state.state]);

  const installUpdate = async (asset: Asset) => {
    const result = await installDeckyHubUpdate(asset);
    if (result.jobId) setUpdateJob({ id: result.jobId, state: { state: "queued", filename: asset.name, total: asset.size } });
  };

  return (
    <>
      <PanelSection title="DeckyHub Update">
        <PanelSectionRow>
          Installed: {deckyHubInfo.version}
          {deckyHubRelease.version && ` · Latest: ${deckyHubRelease.version}`}
          {deckyHubRelease.error && (
            <>
              <br />
              <small>{deckyHubRelease.error}</small>
            </>
          )}
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Update Channel"
            rgOptions={[
              { label: "Stable releases", data: "stable" },
              { label: "Pre-releases", data: "prerelease" },
            ]}
            selectedOption={settings.updateChannel}
            onChange={({ data }) => setSettings({ ...settings, updateChannel: data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void latestDeckyHubRelease(settings.updateChannel).then(setDeckyHubRelease)}>
            Check DeckyHub Update
          </ButtonItem>
        </PanelSectionRow>
        {deckyHubRelease.asset && (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => void installUpdate(deckyHubRelease.asset!)}>
              Download {deckyHubRelease.version} Update
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
                <small>Downloaded to {updateJob.state.path || "the selected folder"}. Install it from Decky → Developer → Install Plugin from ZIP.</small>
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
                Cancel Update
              </ButtonItem>
            )}
          </PanelSectionRow>
        )}
        {deckyHubRelease.url && (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => Navigation.NavigateToExternalWeb(deckyHubRelease.url!)}>
              Open Release Page
            </ButtonItem>
          </PanelSectionRow>
        )}
      </PanelSection>

      <PanelSection title="Download Settings">
        <PanelSectionRow>Choose where release ZIP files are saved.</PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Download Folder"
            rgOptions={[
              { label: "/home/deck/Downloads/plugins (default)", data: "plugins" },
              { label: "/home/deck/Downloads", data: "downloads" },
            ]}
            selectedOption={settings.downloadLocation}
            onChange={({ data }) => setSettings({ ...settings, downloadLocation: data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label="Verify SHA256 When Available" checked={settings.verifySha256} onChange={(checked) => setSettings({ ...settings, verifySha256: checked })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label="Overwrite Existing Files" checked={settings.overwriteExisting} onChange={(checked) => setSettings({ ...settings, overwriteExisting: checked })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={async () => {
              setSettings(await saveSettings(settings));
              toaster.toast({ title: "DeckyHub", body: "Settings saved." });
            }}
          >
            Save Settings
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}
