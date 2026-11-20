import { Focusable } from "@decky/ui";
import { useState } from "react";
import type { TFunc } from "../i18n/en";
import type { App, AppReleaseOption, Asset, HideableButton, RepoPreference } from "../types";
import { buildVersionOptions, listAppReleases, PLUGIN_INSTALL_TYPE } from "../utils";
import { useAppInstall } from "../hooks/useAppInstall";
import { useRepoPreference } from "../hooks/useRepoPreference";
import { AppMonogram, FindingsSummary } from "./AppBadges";
import { AppMeta, DownloadButtons, InstallButton, StoreInstallSteps, UnverifiedActions } from "./AppDetailsParts";
import { AppFooter } from "./AppDetailsFooter";
import { DetailsWindow } from "./DetailsWindow";
import { KnownIssues } from "./KnownIssues";
import { useReleasePicker } from "./VersionPickerPanel";
import { VirusScanReport } from "./VirusScanReport";

export type Props = {
  t: TFunc;
  app: App;
  preference: RepoPreference;
  downloadDisabled?: boolean;
  hiddenButtons: HideableButton[];
  onDownload: (asset: Asset) => Promise<void>;
  onPreferenceChange: (preference: RepoPreference) => void;
  onUninstalled: () => void;
  moreFromAuthor?: { count: number; show: () => void };
  closeModal?: () => void;
};

// showModal() mounts onto a separate root from the caller's tree (see the
// same note on DeckyHubUpdateModal), so `t` must be a resolved function
// passed in from AppCard — calling useT() here throws on mount.
export function AppDetailsModal(props: Props) {
  const { t, app, hiddenButtons, onUninstalled, moreFromAuthor, closeModal } = props;
  const pref = useRepoPreference(app, props.preference, props.onPreferenceChange);
  const { channel } = pref;
  const picker = useReleasePicker((force) => listAppReleases(app, force), channel);
  const { selected: release } = picker;
  // Every action but Check for Updates and Download ZIP closes this window.
  // This modal was rendered once by showModal(), so the downloadDisabled prop
  // never updates — track downloads started from here locally.
  const [downloading, setDownloading] = useState(Boolean(props.downloadDisabled));
  const download = (asset: Asset) => {
    setDownloading(true);
    void props.onDownload(asset).finally(() => setDownloading(false));
  };
  const install = useAppInstall(t, app, release, closeModal);
  const unverified = (
    <UnverifiedActions t={t} app={app} release={release} pref={pref} install={install} closeModal={closeModal} />
  );
  return (
    <DetailsWindow
      t={t}
      closeModal={closeModal}
      icon={<AppMonogram app={app} style={{ width: 72, height: 72, borderRadius: 16, fontSize: 26 }} />}
      title={app.name}
      aside={app.repo}
      meta={<AppMeta app={app} t={t} />}
      description={app.description}
      release={app.store ? null : release}
      primary={
        <AppPrimary
          {...props}
          release={release}
          pref={pref}
          install={install}
          downloading={downloading}
          download={download}
        />
      }
      // Known issues sit above the scan report, not in the header: the header is one focus
      // target, so the D-pad can't reach a link inside it (seen on a Deck).
      collapsible
      scan={!app.store && <ScanSummary t={t} app={app} closeModal={closeModal} />}
      report={!app.store && <ScanReport t={t} release={release} closeModal={closeModal} />}
      channel={channel}
      prereleaseOnly={app.prereleaseOnly}
      onChannelChange={(next) => {
        picker.setSelectedTag("");
        pref.change({ ...pref.preference, channel: next });
      }}
      versionOptions={buildVersionOptions(picker.items, app.installedVersion, t)}
      selectedTag={picker.selectedTag}
      onVersionChange={picker.setSelectedTag}
      disabled={picker.loading}
      error={picker.error}
      isEmpty={!picker.loading && !picker.error && picker.items.length === 0}
      hideVersionPicker={app.store}
      footer={
        <AppFooter
          {...props}
          release={release}
          pref={pref}
          loading={picker.loading}
          onCheck={() => void picker.load(true)}
        />
      }
    />
  );
}

function ScanSummary({ t, app, closeModal }: { t: TFunc; app: App; closeModal?: () => void }) {
  return (
    <>
      <FindingsSummary app={app} t={t} />
      {app.knownIssues?.length ? <KnownIssues t={t} issues={app.knownIssues} closeModal={closeModal} /> : null}
    </>
  );
}

function ScanReport({
  t,
  release,
  closeModal,
}: {
  t: TFunc;
  release?: AppReleaseOption | null;
  closeModal?: () => void;
}) {
  return (
    <VirusScanReport
      key={JSON.stringify([release?.assets[0]?.url, release?.assets[0]?.sha256])}
      t={t}
      asset={release?.assets[0]}
      version={release?.tag}
      closeModal={closeModal}
      showZipActions={false}
    />
  );
}

// The window's main actions: a store plugin's steps, or Install / Update for the selected
// release, the unverified-plugin choices and the downloads.
function AppPrimary({
  t,
  app,
  hiddenButtons,
  closeModal,
  release,
  pref,
  install,
  downloading,
  download,
}: Props & {
  release: AppReleaseOption | null;
  pref: ReturnType<typeof useRepoPreference>;
  install: ReturnType<typeof useAppInstall>;
  downloading: boolean;
  download: (asset: Asset) => void;
}) {
  if (app.store) return <StoreInstallSteps app={app} t={t} />;
  const unverified = (
    <UnverifiedActions t={t} app={app} release={release} pref={pref} install={install} closeModal={closeModal} />
  );
  if (!release) return unverified;
  const { install: action } = install;
  const hideZip = hiddenButtons.includes("downloadZip");
  return (
    <>
      {action && !hiddenButtons.includes(action.type === PLUGIN_INSTALL_TYPE.INSTALL ? "install" : "update") && (
        <InstallButton
          t={t}
          app={app}
          release={release}
          install={action}
          installLabel={install.installLabel}
          onInstall={() => install.runInstall(release, action)}
          // X downloads the selected release's ZIP instead of installing it.
          onDownloadZip={hideZip || downloading || !release.assets[0] ? undefined : () => download(release.assets[0])}
          closeModal={closeModal}
        />
      )}
      {unverified}
      {!hideZip && <DownloadButtons t={t} release={release} disabled={downloading} onDownload={download} />}
    </>
  );
}
