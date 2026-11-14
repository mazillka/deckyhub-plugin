import { toaster } from "@decky/api";
import {
  finishRemoteRequest,
  finishRemoteRequestUnknown,
  claimRemoteRequest,
  decideRemoteRequest,
  getApps,
  getRemoteInstalledVersion,
} from "../api";
import { settleInstall } from "../remoteOutcome";
import { installWarnings, type RemoteInstallRequest } from "../types";
import type { TFunc } from "../i18n/en";
import { listAppReleases, fetchPluginStats } from "../releases";
import { getDeckyBackend, installAction, installDeckyPlugin, needsFreshInstall, PLUGIN_INSTALL_TYPE } from "../install";
import { manifestName } from "../utils";
import { confirmPluginInstall } from "./InstallFlow";
import { approveRemoteToggle } from "./RemotePluginToggle";
import { approveRemoteUninstall } from "./RemotePluginUninstall";

// Runs one remote request on this device. `auto` is true for a trusted browser, whose
// request was approved when it arrived, so no DeckyHub dialog is shown.
export async function runRemoteRequest(request: RemoteInstallRequest, t: TFunc, auto: boolean) {
  let approved = false;
  let handedOver = false;
  try {
    if (!getDeckyBackend()) throw new Error(t("settings.selfUpdateUnavailable"));
    if (request.action === "uninstall") {
      await approveRemoteUninstall(request, t, auto);
      return;
    }
    if (request.action === "enable" || request.action === "disable") {
      await approveRemoteToggle(request, t, auto);
      return;
    }
    const { apps } = await getApps();
    const app = apps.find((item) => item.id === request.pluginId);
    if (!app) throw new Error(t("appcard.noMatchingAsset"));
    if (request.action === "update" && (!app.installedVersion || app.repo !== request.repo))
      throw new Error(t("appcard.noMatchingAsset"));
    const { items, error } = await listAppReleases(app, true);
    const release = request.releaseTag
      ? items.find((item) => item.tag === request.releaseTag)
      : items.find((item) => !item.prerelease);
    const action = release && installAction(app, release);
    if (!release || !action || !release.assets[0]) throw new Error(error || t("appcard.noMatchingAsset"));
    if (request.action === "update" && action.type !== PLUGIN_INSTALL_TYPE.UPDATE) {
      await (auto ? finishRemoteRequest(request.id, false) : decideRemoteRequest(request.id, false));
      throw new Error(t("status.upToDate"));
    }
    const stats = await fetchPluginStats(false).catch(() => ({}) as Awaited<ReturnType<typeof fetchPluginStats>>);
    const warningApp = {
      ...app,
      stats: stats[app.repo.toLowerCase()],
      channel: release.prerelease ? ("prerelease" as const) : ("stable" as const),
    };
    const note = [
      request.ownerName,
      app.repo,
      release.tag,
      warningApp.stats?.root ? t("appcard.runsAsRootHint") : "",
      needsFreshInstall(action.name, action.type) ? t("appcard.freshInstallDescription", { name: app.name }) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    // A trusted device's request was approved when it arrived; nothing is asked here.
    const accepted =
      auto ||
      (await confirmPluginInstall(
        t,
        `${app.name} — ${release.tag}`,
        t(request.action === "update" ? "appcard.update" : "appcard.install"),
        {
          note,
          asset: release.assets[0],
          warnings: installWarnings(warningApp),
        },
      ));
    if (!accepted) {
      await decideRemoteRequest(request.id, false);
      return;
    }
    if (!auto) await decideRemoteRequest(request.id, true);
    approved = true;
    // Refresh registry and release data after approval. Never substitute a different ZIP.
    const current = (await getApps()).apps.find((item) => item.id === request.pluginId);
    if (!current || current.repo !== app.repo) throw new Error(t("appcard.noMatchingAsset"));
    const refreshed = (await listAppReleases(current, true)).items.find((item) => item.tag === release.tag);
    const freshAction = refreshed && installAction(current, refreshed);
    const asset = refreshed?.assets[0];
    if (
      !freshAction ||
      freshAction.name !== action.name ||
      freshAction.type !== action.type ||
      !asset ||
      asset.url !== release.assets[0].url ||
      asset.sha256 !== release.assets[0].sha256
    )
      throw new Error(t("appcard.noMatchingAsset"));
    const name =
      freshAction.name === current.repo ? ((await manifestName(current.repo)) ?? current.repo) : freshAction.name;
    const claim = await claimRemoteRequest(request.id);
    if (claim.pluginId !== request.pluginId || (claim.releaseTag ?? null) !== (request.releaseTag ?? null))
      throw new Error(t("appcard.noMatchingAsset"));
    if ((claim.action ?? "install") !== (request.action ?? "install")) throw new Error(t("appcard.noMatchingAsset"));
    // Loader's confirmation can be cancelled, and its events lack request IDs. A handoff
    // cannot prove success: report unknown unless a future correlated result is available.
    handedOver = true;
    await installDeckyPlugin(asset, current.repo, name, refreshed.tag, freshAction.type, auto);
    // Decky reports no result: look at what is installed (a minute and a half), so the browser hears "Installed".
    await settleInstall({
      installedVersion: async () => (await getRemoteInstalledVersion(name)).version,
      before: request.installedVersion ?? null,
      succeeded: () => {
        // Decky's own window can stay open while it fetches a plugin's extra files, after the plugin is there.
        toaster.toast({ title: "DeckyHub", body: t("remote.extraFilesHint", { name }) });
        return finishRemoteRequest(request.id, true);
      },
      unknown: () => finishRemoteRequestUnknown(request.id),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
  } catch (error) {
    if (approved || auto) {
      if (handedOver) await finishRemoteRequestUnknown(request.id).catch(() => undefined);
      else await finishRemoteRequest(request.id, false).catch(() => undefined);
    }
    throw error;
  }
}
