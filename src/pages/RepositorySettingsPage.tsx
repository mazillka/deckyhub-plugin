import { toaster } from "@decky/api";
import { ButtonItem, DropdownItem, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaSync } from "react-icons/fa";
import { getApps, getSettings, REGISTRY_UPDATED, refreshRegistry, saveRepoSettings } from "../api";
import type { App, RepoPreference, Settings } from "../types";

export function RepositorySettingsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [prefs, setPrefs] = useState<Record<string, RepoPreference>>({});

  useEffect(() => {
    void Promise.all([getApps(), getSettings()]).then(([appData, settings]) => {
      setApps(appData.apps);
      setPrefs((settings as Settings & { repoSettings?: Record<string, RepoPreference> }).repoSettings || {});
    });
  }, []);

  const preference = (repo: string) => prefs[repo] || { channel: "stable", downloadLocation: "default", assetFilter: [] };

  return (
    <>
      <PanelSection title="Repository settings">
        <PanelSectionRow>Choose a release channel, asset keywords, and download folder for each repository.</PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() =>
              void refreshRegistry().then((result) => {
                toaster.toast({ title: "DeckyHub", body: `Registry refreshed: ${result.count} repositories.` });
                window.dispatchEvent(new Event(REGISTRY_UPDATED));
              })
            }
          >
            <FaSync /> Refresh registry from GitHub
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
      {apps.map((app) => {
        const value = preference(app.repo);
        const update = (next: Partial<RepoPreference>) => setPrefs({ ...prefs, [app.repo]: { ...value, ...next } });
        return (
          <PanelSection key={app.repo} title={app.name}>
            <PanelSectionRow>
              <DropdownItem
                label="Release channel"
                rgOptions={[
                  { label: "Stable", data: "stable" },
                  { label: "Pre-release", data: "prerelease" },
                ]}
                selectedOption={value.channel}
                onChange={({ data }) => update({ channel: data })}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <DropdownItem
                label="Download folder"
                rgOptions={[
                  { label: "Use global setting", data: "default" },
                  { label: "/home/deck/Downloads/plugins", data: "plugins" },
                  { label: "/home/deck/Downloads", data: "downloads" },
                ]}
                selectedOption={value.downloadLocation}
                onChange={({ data }) => update({ downloadLocation: data })}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <TextField
                label="Asset filter (comma-separated)"
                value={value.assetFilter.join(", ")}
                onChange={(event) => update({ assetFilter: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) })}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <ButtonItem
                layout="below"
                onClick={() =>
                  void saveRepoSettings(app.repo, preference(app.repo)).then((saved) => {
                    setPrefs({ ...prefs, [app.repo]: saved });
                    toaster.toast({ title: "DeckyHub", body: `${app.name} settings saved.` });
                  })
                }
              >
                Save {app.name} settings
              </ButtonItem>
            </PanelSectionRow>
          </PanelSection>
        );
      })}
    </>
  );
}
