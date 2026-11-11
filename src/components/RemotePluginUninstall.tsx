import { showModal } from "@decky/ui";
import {
  claimRemoteRequest,
  decideRemoteRequest,
  finishRemoteRequest,
  finishRemoteRequestUnknown,
  getApps,
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

export async function approveRemoteUninstall(request: RemoteInstallRequest, t: TFunc) {
  const app = (await getApps()).apps.find((item) => item.id === request.pluginId);
  if (!matchesRequest(app, request)) throw new Error(t("appcard.noMatchingAsset"));
  const accepted = await new Promise<boolean>((resolve) =>
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
  );
  if (!accepted) {
    await decideRemoteRequest(request.id, false);
    return;
  }
  let claimed = false;
  await decideRemoteRequest(request.id, true);
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
