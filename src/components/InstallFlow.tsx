import { toaster } from "@decky/api";
import { Focusable, showModal } from "@decky/ui";
import { WideConfirmModal } from "./WideModal";
import type { TFunc } from "../i18n/en";
import { isAuditWarning, type Asset } from "../types";
import { keepInView } from "./KeepInView";
import { getDeckyBackend, installDeckyPlugin, manifestName, needsFreshInstall } from "../utils";
import { VirusScanReport } from "./VirusScanReport";
import { WarningBadge } from "./AppBadges";

// Every install, update or reinstall of a third-party plugin first says
// DeckyHub doesn't vouch for it; resolves true once the user accepts.
export function confirmPluginInstall(t: TFunc, title: string, okLabel: string, note?: string, asset?: Asset, warnings: string[] = []): Promise<boolean> {
  return new Promise((resolve) =>
    showModal(
      <WideConfirmModal
        strTitle={title}
        // Each block is focusable so the D-pad scrolls through all of it, like VirusScanReport.
        strDescription={<Focusable flow-children="down">
          <Focusable onActivate={() => {}} onFocus={keepInView}><span style={{ color: "#ff6b6b" }}>{t("install.disclaimer")}</span></Focusable>
          {note && <Focusable onActivate={() => {}} onFocus={keepInView}><p>{note}</p></Focusable>}
          {warnings.filter(isAuditWarning).map((warning) => <Focusable key={warning} onActivate={() => {}} onFocus={keepInView}><p><WarningBadge t={t} warning={warning} /> {t(`appcard.warning.${warning}.hint`)}</p></Focusable>)}
          {asset && <VirusScanReport t={t} asset={asset} showExternalActions={false} />}
        </Focusable>}
        strOKButtonText={okLabel}
        onOK={() => resolve(true)}
        onCancel={() => resolve(false)}
      />,
    ),
  );
}

// Hands one release to Decky Loader's installer, shared by this window and the
// card's quick Install/Update. installDeckyPlugin() uninstalls fresh-install
// plugins first, before Decky's own dialog appears, so cancelling that dialog
// would leave the plugin uninstalled — say so before starting.
export function startPluginInstall(t: TFunc, appName: string, repo: string, asset: Asset, tag: string, action: { name: string; type: 0 | 1 | 2 | 3 }, label: string, onStarted?: () => void, warnings: string[] = []): Promise<void> {
  if (!getDeckyBackend()) {
    toaster.toast({ title: "DeckyHub", body: t("settings.selfUpdateUnavailable") });
    return Promise.resolve();
  }
  // Settles once Decky has the request (its own dialog is up) or it failed.
  const start = async () => {
    // A repo the user added has no detect names, so installAction() falls back to
    // its "owner/name"; Decky needs the plugin's own name from its plugin.json.
    const name = action.name === repo ? ((await manifestName(repo)) ?? repo) : action.name;
    const request = installDeckyPlugin(asset, repo, name, tag, action.type).then(
      () => undefined,
      (error: unknown) => void toaster.toast({ title: "DeckyHub", body: String(error) }),
    );
    onStarted?.();
    return request;
  };
  const note = needsFreshInstall(action.name, action.type) ? t("appcard.freshInstallDescription", { name: appName }) : undefined;
  return confirmPluginInstall(t, `${label}?`, label, note, asset, warnings).then((accepted) => (accepted ? start() : undefined));
}
