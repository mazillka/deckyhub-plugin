import { showModal } from "@decky/ui";
import {
  claimRemoteRequest,
  decideRemoteRequest,
  finishRemoteRequest,
  finishRemoteRequestUnknown,
  getApps,
  getRemoteInstalledVersion,
} from "../api";
import { uninstallDeckyPlugin } from "../install";
import type { TFunc } from "../i18n/en";
import type { App, RemoteInstallRequest } from "../types";
import { WideConfirmModal } from "./WideModal";

function matchesRequest(app: App | undefined, request: RemoteInstallRequest): app is App & { pluginName: string } {
  return Boolean(
    app &&
    app.repo === request.repo &&
    app.pluginName &&
    app.pluginName.toLowerCase() !== "deckyhub" &&
    app.pluginName === request.pluginName &&
    app.installedVersion === request.installedVersion &&
    !app.identityUnverified,
  );
}

// A plugin the registry cannot vouch for is uninstalled by the name Decky Loader knows it by.
// The backend has already matched that name to exactly one installed plugin, and checks again
// when the request is claimed.
async function approveUninstallByName(request: RemoteInstallRequest, t: TFunc, auto: boolean) {
  const name = request.pluginName;
  if (!name || name.toLowerCase() === "deckyhub") throw new Error(t("appcard.noMatchingAsset"));
  const accepted =
    auto ||
    (await new Promise<boolean>((resolve) =>
      showModal(
        <WideConfirmModal
          strTitle={t("appcard.uninstallTitle", { name })}
          strDescription={`${t("remote.from", { name: request.ownerName })}${request.repo ? ` · ${request.repo}` : ""}. ${t("appcard.uninstallDescription")}`}
          strOKButtonText={t("appcard.uninstall")}
          bDestructiveWarning
          onOK={() => resolve(true)}
          onCancel={() => resolve(false)}
        />,
      ),
    ));
  if (!accepted) {
    await decideRemoteRequest(request.id, false);
    return;
  }
  let claimed = false;
  if (!auto) await decideRemoteRequest(request.id, true);
  try {
    const claim = await claimRemoteRequest(request.id);
    if (
      claim.action !== "uninstall" ||
      claim.pluginName !== name ||
      claim.installedVersion !== request.installedVersion
    )
      throw new Error(t("appcard.noMatchingAsset"));
    claimed = true;
    await uninstallDeckyPlugin(name);
    if ((await getRemoteInstalledVersion(name)).version === null) await finishRemoteRequest(request.id, true);
    else await finishRemoteRequestUnknown(request.id);
  } catch (error) {
    if (claimed) await finishRemoteRequestUnknown(request.id).catch(() => undefined);
    else await finishRemoteRequest(request.id, false).catch(() => undefined);
    throw error;
  }
}

export async function approveRemoteUninstall(request: RemoteInstallRequest, t: TFunc, auto = false) {
  if (request.pluginId === null) return approveUninstallByName(request, t, auto);
  const app = (await getApps()).apps.find((item) => item.id === request.pluginId);
  if (!matchesRequest(app, request)) throw new Error(t("appcard.noMatchingAsset"));
  const accepted =
    auto ||
    (await new Promise<boolean>((resolve) =>
      showModal(
        <WideConfirmModal
          strTitle={t("appcard.uninstallTitle", { name: app.name })}
          strDescription={`${t("remote.from", { name: request.ownerName })} · ${app.repo}. ${t("appcard.uninstallDescription")}`}
          strOKButtonText={t("appcard.uninstall")}
          bDestructiveWarning
          onOK={() => resolve(true)}
          onCancel={() => resolve(false)}
        />,
      ),
    ));
  if (!accepted) {
    await decideRemoteRequest(request.id, false);
    return;
  }
  let claimed = false;
  if (!auto) await decideRemoteRequest(request.id, true);
  try {
    const current = (await getApps()).apps.find((item) => item.id === request.pluginId);
    if (!matchesRequest(current, request)) throw new Error(t("appcard.noMatchingAsset"));
    const claim = await claimRemoteRequest(request.id);
    if (
      claim.action !== "uninstall" ||
      claim.repo !== current.repo ||
      claim.pluginName !== current.pluginName ||
      claim.installedVersion !== current.installedVersion
    )
      throw new Error(t("appcard.noMatchingAsset"));
    claimed = true;
    await uninstallDeckyPlugin(current.pluginName);
    // Confirm that the installed copy disappeared before reporting success.
    const remaining = (await getApps()).apps.find((item) => item.id === request.pluginId);
    if (remaining?.repo === current.repo && !remaining.installedVersion) await finishRemoteRequest(request.id, true);
    else await finishRemoteRequestUnknown(request.id);
  } catch (error) {
    if (claimed) await finishRemoteRequestUnknown(request.id).catch(() => undefined);
    else await finishRemoteRequest(request.id, false).catch(() => undefined);
    throw error;
  }
}
