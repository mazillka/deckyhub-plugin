import { Navigation } from "@decky/ui";
import { startPluginInstall } from "../components/InstallFlow";
import type { TFunc } from "../i18n/en";
import { installWarnings, type App, type AppReleaseOption } from "../types";
import { installAction, installTypeLabel, unverifiedInstallAction } from "../utils";
import { displayVersion, plainVersion } from "../version";

// Hands the selected release to Decky Loader's installer, which shows its own
// confirm/progress dialog; Content reloads the list once the loader finishes.
export function useAppInstall(
  t: TFunc,
  app: App,
  release: AppReleaseOption | null | undefined,
  closeModal: (() => void) | undefined,
) {
  const install = release && installAction(app, release);
  const installLabel =
    install && release ? installTypeLabel(t, install.type, plainVersion(release.tag), t("appcard.update")) : "";
  // An unverified plugin DeckyHub can still address by one unambiguous name: the user may install over it
  // anyway, or trust it so it updates like any other. Both say what will be replaced and by what.
  const anyway = release && unverifiedInstallAction(app, release);

  const start = (
    chosen: AppReleaseOption,
    action: NonNullable<typeof install | typeof anyway>,
    label: string,
    options: { root?: boolean; prerelease: boolean; note?: string },
  ) =>
    // Decky's own confirm/progress dialog would otherwise open behind this
    // window; the Updates/Discover page behind it is left too.
    void startPluginInstall(
      t,
      app.name,
      app.repo,
      chosen.assets[0],
      chosen.tag,
      action,
      label,
      () => {
        closeModal?.();
        Navigation.NavigateBack();
      },
      chosen.assets[0]?.url === app.assets[0]?.url ? installWarnings(app, chosen.prerelease) : [],
      options,
    );

  const runInstall = (chosen: AppReleaseOption, action: NonNullable<typeof install>) =>
    start(chosen, action, installLabel, {
      // The registry's root flag describes the card's release; a pre-release says so for any release.
      root: chosen.assets[0]?.url === app.assets[0]?.url && app.stats?.root === true,
      prerelease: chosen.prerelease === true,
      note: app.identityTrusted
        ? t("install.replaces", { name: app.pluginName ?? app.name, version: plainVersion(app.installedVersion) })
        : app.storeLatest
          ? t("install.replacesStore", { version: plainVersion(app.installedVersion) })
          : undefined,
    });
  const runInstallAnyway = (chosen: AppReleaseOption, action: NonNullable<typeof anyway>) =>
    start(chosen, action, t("appcard.installAnyway"), {
      prerelease: chosen.prerelease === true,
      note: t("appcard.unverifiedConfirmBody", {
        name: app.uninstallName ?? app.name,
        version: plainVersion(app.installedVersion),
        repo: app.repo,
        tag: displayVersion(chosen.tag),
      }),
    });
  return { install, installLabel, anyway, runInstall, runInstallAnyway };
}
