import { toaster } from "@decky/api";
import { Navigation } from "@decky/ui";
import { useState } from "react";
import { downloadAsset, getApps } from "../api";
import { showDownloadModal } from "../components/DownloadProgress";
import { startPluginInstall } from "../components/InstallFlow";
import { showReleaseInfo } from "../components/ReleaseInfo";
import type { TFunc } from "../i18n/en";
import { displayVersion } from "../version";
import { hydrate, installAction, installTypeLabel, log, unverifiedInstallAction } from "../utils";

const plain = (version?: string | null) => displayVersion(version ?? "").replace(/^v/, "");

const showError = (error: unknown) => {
  log(`Search action failed: ${error}`);
  toaster.toast({ title: "DeckyHub", body: String(error) });
};

// The repo's latest stable release, looked up the way a Discover card does. A repo
// that isn't listed gets the entry the backend makes for an added one (_custom_apps).
async function latestRelease(t: TFunc, repo: string) {
  const listed = (await getApps()).apps.find((app) => app.repo.toLowerCase() === repo.toLowerCase());
  const app = await hydrate(
    listed ?? {
      id: `custom-${repo.replace("/", "-")}`,
      name: repo,
      repo,
      category: "Custom",
      detect: { type: "decky-plugin" },
      asset: { include: [], exclude: ["source"] },
      assets: [],
    },
    false,
  );
  if (!app.latestVersion || !app.assets[0]) throw new Error(app.error ?? t("release.noMatch"));
  return app as typeof app & { latestVersion: string };
}

// What a search result's buttons do. `track` adds a repo to DeckyHub's list.
export function useSearchActions(t: TFunc, track: (repo: string) => Promise<boolean>) {
  // The repo whose install is being prepared, so a second tap can't start another.
  const [installing, setInstalling] = useState<string | null>(null);

  const add = async (repo: string) => {
    const added = await track(repo);
    toaster.toast({ title: "DeckyHub", body: t(added ? "repos.addedToast" : "repos.alreadyAdded", { repo }) });
  };

  // Y: that release's notes, without adding or installing anything.
  const releaseInfo = async (repo: string) => {
    const app = await latestRelease(t, repo);
    showReleaseInfo(t, `${app.name} ${displayVersion(app.latestVersion)}`, app.publishedAt, app.releaseNotes);
  };

  // X: that release's ZIP to the download folder instead of installing it.
  const downloadZip = async (repo: string) => {
    const asset = (await latestRelease(t, repo)).assets[0];
    const result = await downloadAsset(asset, repo);
    if (result.error) throw new Error(result.error);
    if (result.jobId)
      showDownloadModal(t, result.jobId, { state: "queued", filename: asset.name, total: asset.size }, () => {});
  };

  // Installs its latest stable release the way a Discover card does, and tracks the
  // repo once Decky's dialog is accepted (a cancelled or failed one adds nothing).
  const install = async (repo: string) => {
    setInstalling(repo);
    try {
      const app = await latestRelease(t, repo);
      const release = { tag: app.latestVersion, assets: app.assets };
      const action = installAction(app, release);
      // An installed plugin DeckyHub can't tie to this repository: as in its Manage window, the user may install
      // over it anyway once the confirmation says what gets replaced.
      const anyway = action ? null : unverifiedInstallAction(app, release);
      if (!action && !anyway)
        throw new Error(t(app.identityUnverified ? "appcard.identityUnverified" : "release.noMatch"));
      const chosen = (action ?? anyway)!;
      const label = anyway ? t("appcard.installAnyway") : installTypeLabel(t, chosen.type, plain(app.latestVersion));
      const note = anyway
        ? t("appcard.unverifiedConfirmBody", {
            name: app.uninstallName ?? app.name,
            version: plain(app.installedVersion),
            repo: app.repo,
            tag: displayVersion(app.latestVersion),
          })
        : undefined;
      // Decky's own dialog takes over, so leave the page like a card's Install does.
      await startPluginInstall(
        t,
        app.name,
        app.repo,
        app.assets[0],
        app.latestVersion,
        chosen,
        label,
        () => {
          void track(repo).catch(showError);
          Navigation.NavigateBack();
        },
        [],
        { note },
      );
    } finally {
      setInstalling(null);
    }
  };

  return {
    installing: installing !== null,
    onInstall: (repo: string) => void install(repo).catch(showError),
    onAdd: (repo: string) => void add(repo).catch(showError),
    onReleaseInfo: (repo: string) => void releaseInfo(repo).catch(showError),
    onDownloadZip: (repo: string) => void downloadZip(repo).catch(showError),
  };
}
