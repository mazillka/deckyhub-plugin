import { showModal } from "@decky/ui";
import {
  claimRemoteRequest,
  decideRemoteRequest,
  finishRemoteRequest,
  finishRemoteRequestUnknown,
  getRemoteInstalledVersion,
} from "../api";
import { setDeckyPluginEnabled } from "../install";
import type { TFunc } from "../i18n/en";
import type { RemoteInstallRequest } from "../types";
import { WideConfirmModal } from "./WideModal";

// What a request to enable or disable plugins is shown as: the plugin's name, or how many for a pack.
export const toggleSubject = (request: Pick<RemoteInstallRequest, "pluginNames">, t: TFunc) => {
  const names = request.pluginNames ?? [];
  return names.length === 1 ? names[0] : t("remote.plugins", { count: names.length });
};

// Switches the plugins named by a remote enable / disable request, one Decky Loader call each. Nothing is
// installed or removed, and the request names only plugins the backend found installed (never DeckyHub).
export async function approveRemoteToggle(request: RemoteInstallRequest, t: TFunc, auto: boolean) {
  const enable = request.action === "enable";
  const names = request.pluginNames ?? [];
  if (!names.length) throw new Error(t("appcard.noMatchingAsset"));
  const accepted =
    auto ||
    (await new Promise<boolean>((resolve) =>
      showModal(
        <WideConfirmModal
          strTitle={t(enable ? "remote.enableTitle" : "remote.disableTitle", { name: toggleSubject(request, t) })}
          strDescription={`${t("remote.from", { name: request.ownerName })} · ${names.join(", ")}`}
          strOKButtonText={t(enable ? "remote.enable" : "remote.disable")}
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
    claimed = true;
    if (claim.action !== request.action || claim.pluginNames?.join("\n") !== names.join("\n"))
      throw new Error(t("appcard.noMatchingAsset"));
    for (const name of names) await setDeckyPluginEnabled(name, enable);
    // Success only when Decky Loader's own setting now says so for every plugin.
    const states = await Promise.all(names.map((name) => getRemoteInstalledVersion(name)));
    if (states.every((state) => state.version !== null && state.disabled === !enable))
      await finishRemoteRequest(request.id, true);
    else await finishRemoteRequestUnknown(request.id);
  } catch (error) {
    if (claimed) await finishRemoteRequestUnknown(request.id).catch(() => undefined);
    else await finishRemoteRequest(request.id, false).catch(() => undefined);
    throw error;
  }
}
