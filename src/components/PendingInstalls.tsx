import { toaster } from "@decky/api";
import { showModal } from "@decky/ui";
import { WideConfirmModal } from "./WideModal";
import { clearPendingInstalls, getApps, getPendingInstalls } from "../api";
import type { TFunc } from "../i18n/en";
import { fetchPluginStats } from "../releases";
import { displayVersion } from "../version";
import type { App } from "../types";
import { hydrate, installAction, PLUGIN_INSTALL_TYPE, updateDeckyPlugins } from "../utils";
import { AppBadges } from "./AppBadges";

// Plugins picked in the Desktop Mode installer's checklist wait in a file until DeckyHub
// starts. The installer never installs them: this lists them (with their AI and warning
// badges and the usual "not responsible" notice), and only on a tap hands the latest
// release of each to Decky Loader, which asks once more before installing.
let offered = false;

async function pendingApps(): Promise<App[]> {
  const repos = await getPendingInstalls().catch(() => [] as string[]);
  if (!repos.length) return [];
  const [{ apps }, stats] = await Promise.all([getApps(), fetchPluginStats(false).catch(() => ({}))]);
  const wanted = repos
    .map((repo) => apps.find((app) => app.repo.toLowerCase() === repo.toLowerCase()))
    .filter((app): app is App => Boolean(app) && !app?.installedVersion)
    .map((app) => ({ ...app, stats: (stats as Record<string, App["stats"]>)[app.repo.toLowerCase()] }));
  // Each one's newest stable release, so the list says which version it would install.
  return Promise.all(wanted.map((app) => hydrate(app, false).catch(() => app)));
}

// Fetches each plugin's newest stable release and installs them in one batch.
async function installPending(t: TFunc, apps: App[]) {
  const updates: { asset: NonNullable<App["assets"][number]>; repo: string; name: string; version: string }[] = [];
  for (const hydrated of apps) {
    const app = hydrated;
    const tag = hydrated.latestVersion;
    const action = tag ? installAction(hydrated, { tag, assets: hydrated.assets }) : null;
    if (tag && action && hydrated.assets[0]) updates.push({ asset: hydrated.assets[0], repo: app.repo, name: action.name, version: tag });
    else toaster.toast({ title: "DeckyHub", body: `${app.name}: ${hydrated.error ?? t("appcard.noMatchingAsset")}` });
  }
  if (updates.length) await updateDeckyPlugins(updates, PLUGIN_INSTALL_TYPE.INSTALL);
}

// A toast at startup, so the picks aren't forgotten.
export async function announcePendingInstalls(t: TFunc) {
  const count = (await getPendingInstalls().catch(() => [] as string[])).length;
  if (count) toaster.toast({ title: "DeckyHub", body: t("pending.toast") });
}

// The offer itself, once per session (when the Quick Access tab opens).
export async function offerPendingInstalls(t: TFunc) {
  if (offered) return;
  offered = true;
  const apps = await pendingApps();
  if (!apps.length) {
    await clearPendingInstalls().catch(() => undefined);
    return;
  }
  showModal(
    <WideConfirmModal
      strTitle={t("pending.title")}
      strDescription={
        <>
          <p>{t("pending.description")}</p>
          <ul style={{ paddingLeft: 18 }}>
            {apps.map((app) => (
              <li key={app.id} style={{ margin: "6px 0" }}>
                <strong>{app.name}</strong> {app.latestVersion ? displayVersion(app.latestVersion) : ""} <AppBadges app={app} t={t} />
              </li>
            ))}
          </ul>
          <span style={{ color: "#ff6b6b" }}>{t("install.disclaimer")}</span>
        </>
      }
      strOKButtonText={t("pending.install")}
      onOK={() => {
        void clearPendingInstalls();
        void installPending(t, apps).catch((error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }));
      }}
      onCancel={() => {
        void clearPendingInstalls();
        toaster.toast({ title: "DeckyHub", body: t("pending.skipped") });
      }}
    />,
  );
}
