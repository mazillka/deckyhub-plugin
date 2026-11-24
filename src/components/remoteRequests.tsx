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
import { installWarnings, type App, type AppReleaseOption, type RemoteInstallRequest } from "../types";
import type { TFunc } from "../i18n/en";
import { fetchPluginStats } from "../registryData";
import { listAppReleases } from "../releases";
import { getDeckyBackend } from "../deckyLoader";
import { runsUnattended } from "../remoteTrusted";
import { installAction, installDeckyPlugin, needsFreshInstall, PLUGIN_INSTALL_TYPE } from "../install";
import { manifestName } from "../utils";
import { confirmPluginInstall } from "./InstallFlow";
import { approveRemoteToggle } from "./RemotePluginToggle";
import { approveRemoteUninstall } from "./RemotePluginUninstall";

type Resolved = {
  app: App;
  release: AppReleaseOption;
  action: NonNullable<ReturnType<typeof installAction>>;
};

// The plugin and release a request names, if DeckyHub can install it: listed, not store-only, and for an update
// really newer (a request that would change nothing is declined and said so).
async function resolveRequest(request: RemoteInstallRequest, t: TFunc, auto: boolean): Promise<Resolved> {
  const { apps } = await getApps();
  const app = apps.find((item) => item.id === request.pluginId);
  if (!app) throw new Error(t("appcard.noMatchingAsset"));
  if (request.action === "update" && (!app.installedVersion || app.repo !== request.repo))
    throw new Error(t("appcard.noMatchingAsset"));
  if (app.store) throw new Error(t("release.inStore"));
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
  return { app, release, action };
}

// Asks on the Deck whether to install what the browser requested, with the audit warnings and what it will do.
// A trusted device's request was approved when it arrived, so nothing is asked then (`unattended`, see runsUnattended).
async function confirmRequest(request: RemoteInstallRequest, t: TFunc, unattended: boolean, found: Resolved) {
  if (unattended) return true;
  const { app, release, action } = found;
  const stats = await fetchPluginStats(false).catch(() => ({}) as Awaited<ReturnType<typeof fetchPluginStats>>);
  const warningApp = {
    ...app,
    stats: stats[app.repo.toLowerCase()],
    channel: release.prerelease ? ("prerelease" as const) : ("stable" as const),
    latestPrerelease: release.prerelease,
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
  return confirmPluginInstall(
    t,
    `${app.name} — ${release.tag}`,
    t(request.action === "update" ? "appcard.update" : "appcard.install"),
    {
      note,
      asset: release.assets[0],
      warnings: installWarnings(warningApp),
    },
  );
}

// Refreshes registry and release data after approval, and never substitutes a different ZIP: the plugin, release,
// install action and the ZIP's URL and checksum must all be what was approved.
async function reverify(request: RemoteInstallRequest, t: TFunc, found: Resolved) {
  const { app, release, action } = found;
  const current = (await getApps()).apps.find((item) => item.id === request.pluginId);
  if (!current || current.repo !== app.repo) throw new Error(t("appcard.noMatchingAsset"));
  const refreshed = (await listAppReleases(current, true)).items.find((item) => item.tag === release.tag);
  const freshAction = refreshed && installAction(current, refreshed);
  const asset = refreshed?.assets[0];
  if (
    !refreshed ||
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
  return { current, refreshed, freshAction, asset, name };
}

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
    const found = await resolveRequest(request, t, auto);
    const unattended = runsUnattended(auto, found.release.assets[0]);
    if (!(await confirmRequest(request, t, unattended, found))) {
      // A trusted browser's request was approved already, so it ends as failed rather than rejected.
      await (auto ? finishRemoteRequest(request.id, false) : decideRemoteRequest(request.id, false));
      return;
    }
    if (!auto) await decideRemoteRequest(request.id, true);
    approved = true;
    const { current, refreshed, freshAction, asset, name } = await reverify(request, t, found);
    const claim = await claimRemoteRequest(request.id);
    if (claim.pluginId !== request.pluginId || (claim.releaseTag ?? null) !== (request.releaseTag ?? null))
      throw new Error(t("appcard.noMatchingAsset"));
    if ((claim.action ?? "install") !== (request.action ?? "install")) throw new Error(t("appcard.noMatchingAsset"));
    // Loader's confirmation can be cancelled, and its events lack request IDs. A handoff
    // cannot prove success: report unknown unless a future correlated result is available.
    handedOver = true;
    await installDeckyPlugin(asset, current.repo, name, refreshed.tag, freshAction.type, unattended);
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
