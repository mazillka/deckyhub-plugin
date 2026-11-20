import { toaster } from "@decky/api";
import { Navigation } from "@decky/ui";
import { useState, type Dispatch, type SetStateAction } from "react";
import { downloadAsset } from "../api";
import { confirmPluginInstall } from "../components/InstallFlow";
import { showDownloadModal } from "../components/DownloadProgress";
import type { TFunc } from "../i18n/en";
import { installWarnings, type App, type Asset, type RepoPreference } from "../types";
import { hydrate, updateDeckyPlugins } from "../utils";

type BatchUpdate = Parameters<typeof updateDeckyPlugins>[0][number];

// What the cards can do: download an asset, change a plugin's repo preference, update every plugin at once.
export function useAppActions(
  t: TFunc,
  apps: App[],
  setApps: Dispatch<SetStateAction<App[]>>,
  setRepoPreferences: Dispatch<SetStateAction<Record<string, RepoPreference>>>,
) {
  const [downloading, setDownloading] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);

  // Resolves once the download settles (or its window closes), so the Manage
  // window, which can't see this component's state, can re-enable its buttons.
  const startDownload = async (asset: Asset, repo?: string) => {
    try {
      const result = await downloadAsset(asset, repo);
      if (result.error) throw new Error(result.error);
      if (!result.jobId) return;
      setDownloading(true);
      await new Promise<void>((resolve) =>
        showDownloadModal(t, result.jobId!, { state: "queued", filename: asset.name, total: asset.size }, () => {
          setDownloading(false);
          resolve();
        }),
      );
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  // AppDetailsModal persists the change itself (saveRepoSettings); this keeps
  // the card's preference in sync and re-checks that one card's latest release
  // for the new channel or skipped version (from the release cache), so its status
  // and quick Update button follow without a full reload.
  const changeAppPreference = (repo: string, preference: RepoPreference) => {
    setRepoPreferences((current) => ({ ...current, [repo]: preference }));
    setApps((current) => current.map((app) => (app.repo === repo ? { ...app, channel: preference.channel } : app)));
    const app = apps.find((item) => item.repo === repo);
    if (app)
      void hydrate(app, false, preference).then((next) =>
        setApps((current) => current.map((item) => (item.id === next.id ? next : item))),
      );
  };

  // Decky's own dialog takes over, so leave the page once the request is sent.
  const updateAll = async (batchUpdates: BatchUpdate[], shown: App[]) => {
    const label = t("content.updateAll", { count: batchUpdates.length });
    // Every audit warning any of the batch's releases carries, once each.
    const repos = new Set(batchUpdates.map((update) => update.repo));
    const batchApps = shown.filter((app) => repos.has(app.repo));
    const warnings = [...new Set(batchApps.flatMap((app) => installWarnings(app)))];
    if (!(await confirmPluginInstall(t, `${label}?`, label, { warnings }))) return;
    setUpdatingAll(true);
    void updateDeckyPlugins(batchUpdates)
      .catch((error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }))
      .finally(() => setUpdatingAll(false));
    Navigation.NavigateBack();
  };

  return { downloading, updatingAll, startDownload, changeAppPreference, updateAll };
}
