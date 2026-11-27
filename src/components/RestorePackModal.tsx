import { toaster } from "@decky/api";
import { DropdownItem, PanelSectionRow, ToggleField, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import { getApps, getSettings, type ImportedPack, type PackPlugin } from "../api";
import type { TFunc } from "../i18n/en";
import { fetchPluginStats, fetchVirusScans, metaDefenderReportOf, scanFor, virusTotalReportOf } from "../registryData";
import { colors } from "../styles";
import type { App, AppReleaseOption, Settings } from "../types";
import { hydrate, installAction, listAppReleases, needsFreshInstall, updateDeckyPlugins } from "../utils";
import {
  displayVersion,
  installedRelease,
  releaseVersion,
  restoreChoices,
  restoreStatus,
  type RestoreStatus,
} from "../version";
import { AppBadges } from "./AppBadges";
import { WideConfirmModal } from "./WideModal";

// One release a row can install, with the app as its badges describe it.
type Choice = { release: AppReleaseOption; saved: boolean; latest: boolean; view: App; audited: boolean };

type Row = {
  entry: PackPlugin;
  app?: App;
  status: RestoreStatus;
  choices: Choice[];
  savedUnavailable: boolean;
};

type Pick = { selected: boolean; choice: number };

type Stats = Record<string, App["stats"]>;

// The app as one particular release of it: the badges must describe what would be installed, not the latest release.
async function releaseView(app: App, releases: AppReleaseOption[], release: AppReleaseOption) {
  const asset = release.assets[0];
  const [scans, virusTotal, metaDefender] = await Promise.all([
    fetchVirusScans(false).catch(() => ({})),
    virusTotalReportOf(asset).catch(() => null),
    metaDefenderReportOf(asset).catch(() => null),
  ]);
  // The registry's audit covers only each channel's newest release.
  const coverage = installedRelease(releases, releaseVersion(release))?.audit;
  const view: App = {
    ...app,
    assets: release.assets,
    latestVersion: release.tag,
    latestPrerelease: coverage ? coverage === "prerelease" : release.prerelease,
    publishedAt: release.publishedAt,
    stats: app.stats && !coverage ? { ...app.stats, warnings: [], prereleaseWarnings: [] } : app.stats,
    scan: scanFor(scans, asset),
    virusTotal,
    metaDefender,
    installedRisk: undefined,
    updateAvailable: null,
  };
  return { view, audited: Boolean(app.stats && coverage) };
}

async function loadRow(entry: PackPlugin, listed: App | undefined, settings: Settings): Promise<Row> {
  const row: Row = { entry, app: listed, status: "missing", choices: [], savedUnavailable: false };
  if (!listed) return row;
  // A lookup that fails leaves its message on the app, and the row without choices.
  const hydrated = await hydrate(listed, false, settings.repoSettings?.[listed.repo]).catch((error: unknown) => ({
    ...listed,
    error: String(error),
  }));
  row.app = hydrated;
  row.status = restoreStatus(entry.version, hydrated.installedVersion, hydrated.identityUnverified);
  if (row.status === "installed" || row.status === "unverified") return row;
  const { items } = await listAppReleases(hydrated);
  const found = restoreChoices(items, hydrated.latestVersion, entry.version, hydrated.installedVersion);
  // With no releases at all, the lookup's own error says why.
  row.savedUnavailable = found.savedUnavailable && items.length > 0;
  row.choices = await Promise.all(
    found.choices.map(async (choice) => ({ ...choice, ...(await releaseView(hydrated, items, choice.release)) })),
  );
  return row;
}

// A few at a time: a repository outside the release index asks GitHub itself.
const LOADS_AT_ONCE = 4;

async function loadRows(entries: PackPlugin[]): Promise<Row[]> {
  const [{ apps }, stats, settings] = await Promise.all([
    getApps(),
    fetchPluginStats(false).catch(() => ({}) as Stats),
    getSettings(),
  ]);
  const rows: Row[] = [];
  for (let start = 0; start < entries.length; start += LOADS_AT_ONCE) {
    const batch = entries.slice(start, start + LOADS_AT_ONCE).map((entry) => {
      const repo = entry.repo.toLowerCase();
      const app = apps.find((candidate) => candidate.repo.toLowerCase() === repo);
      return loadRow(entry, app && { ...app, stats: (stats as Stats)[repo] }, settings);
    });
    rows.push(...(await Promise.all(batch)));
  }
  return rows;
}

// What Decky Loader would be handed for the row's chosen release; null when this window can't install it.
function installOf(row: Row, pick: Pick | undefined) {
  const choice = row.choices[pick?.choice ?? 0];
  if (!row.app || !choice) return null;
  const action = installAction(choice.view, choice.release);
  // A plugin that must be removed before it can change version is left to its Manage window.
  if (!action || needsFreshInstall(action.name, action.type)) return null;
  return {
    asset: choice.release.assets[0],
    repo: row.app.repo,
    name: action.name,
    version: choice.release.tag,
    installType: action.type,
  };
}

function RowStatus({ row, t }: { row: Row; t: TFunc }) {
  const installed = row.app?.installedVersion;
  const note = (text: string, color: string = colors.muted) => <small style={{ color }}>{text}</small>;
  if (!row.app) return note(t("restore.unlisted"), colors.caution);
  return (
    <>
      {row.entry.version && note(t("restore.saved", { version: displayVersion(row.entry.version) }))}
      {note(installed ? t("restore.installed", { version: displayVersion(installed) }) : t("restore.missing"))}
      {row.status === "installed" && note(t("restore.nothingToDo"))}
      {row.status === "unverified" && note(t("restore.unverified"), colors.caution)}
      {row.savedUnavailable &&
        note(t("restore.savedUnavailable", { version: displayVersion(row.entry.version ?? "") }), colors.caution)}
      {row.app.error && row.status !== "installed" && note(row.app.error, colors.caution)}
      {row.entry.disabled && note(t("restore.wasOff"), colors.caution)}
    </>
  );
}

function RestoreRow({ row, pick, onPick, t }: { row: Row; pick: Pick; onPick: (next: Pick) => void; t: TFunc }) {
  const choice = row.choices[pick.choice];
  const label = (item: Choice) => {
    const kinds = [item.saved && t("restore.savedLabel"), item.latest && t("settings.latestLabel")].filter(Boolean);
    const version = displayVersion(item.release.tag);
    return kinds.length ? `${version} (${kinds.join(", ")})` : version;
  };
  const name = row.app?.name ?? row.entry.name ?? row.entry.repo;
  return (
    <div data-restore-row={row.entry.repo} style={{ display: "grid", gap: 4, padding: "8px 0", ...divider }}>
      <strong>{name}</strong>
      <small style={{ color: colors.muted }}>{row.entry.repo}</small>
      <RowStatus row={row} t={t} />
      {choice && (
        <>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <AppBadges app={choice.view} t={t} />
          </span>
          {!choice.audited && <small style={{ color: colors.caution }}>{t("restore.noAudit")}</small>}
          {row.choices.length > 1 && (
            <PanelSectionRow>
              <DropdownItem
                label={t("restore.version")}
                rgOptions={row.choices.map((item, index) => ({ data: index, label: label(item) }))}
                selectedOption={pick.choice}
                onChange={(option) => onPick({ ...pick, choice: Number(option.data) })}
              />
            </PanelSectionRow>
          )}
          {installOf(row, pick) ? (
            <PanelSectionRow>
              <ToggleField
                label={t("restore.include", { name, version: label(choice) })}
                checked={pick.selected}
                onChange={(selected) => onPick({ ...pick, selected })}
              />
            </PanelSectionRow>
          ) : (
            <small style={{ color: colors.caution }}>{t("restore.manageOnly")}</small>
          )}
        </>
      )}
    </div>
  );
}

const divider = { borderTop: `1px solid ${colors.muted}44` };

function ByHand({ plugins, t }: { plugins: ImportedPack["manual"]; t: TFunc }) {
  return (
    <div style={{ padding: "8px 0", ...divider }}>
      <strong>{t("restore.byHand")}</strong>
      <p style={{ color: colors.muted }}>{t("restore.byHandNote")}</p>
      <ul style={{ paddingLeft: 18 }}>
        {plugins.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            {item.name} {item.version ? displayVersion(item.version) : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

type ModalProps = { pack: ImportedPack; t: TFunc; closeModal?: () => void };

// An imported pack: what is missing or installed in another version, each with the badges of the release it would
// install. Nothing installs until the button is pressed, and Decky Loader then asks once more.
function RestorePackModal({ pack, t, closeModal }: ModalProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failure, setFailure] = useState<string>();
  const [picks, setPicks] = useState<Pick[]>([]);

  useEffect(() => {
    let open = true;
    loadRows(pack.plugins).then(
      (loaded) => {
        if (!open) return;
        // What's missing starts selected; changing an installed version is the user's own choice.
        setPicks(loaded.map((row) => ({ selected: row.status === "missing", choice: 0 })));
        setRows(loaded);
      },
      (error: unknown) => open && setFailure(String(error)),
    );
    return () => {
      open = false;
    };
  }, []);

  const installs = (rows ?? []).flatMap((row, index) => {
    const install = picks[index]?.selected ? installOf(row, picks[index]) : null;
    return install ? [install] : [];
  });
  const nothingToDo = rows?.every((row) => row.status === "installed") && !pack.manual.length;

  return (
    <WideConfirmModal
      closeModal={closeModal}
      strTitle={pack.name ?? t("restore.title")}
      strDescription={
        <>
          <p>{t("restore.description")}</p>
          <span style={{ color: colors.danger }}>{t("install.disclaimer")}</span>
        </>
      }
      strOKButtonText={t("pending.install")}
      bOKDisabled={!installs.length}
      onOK={() =>
        void updateDeckyPlugins(installs).catch((error: unknown) =>
          toaster.toast({ title: "DeckyHub", body: String(error) }),
        )
      }
    >
      {!rows && <p style={{ color: failure ? colors.caution : colors.muted }}>{failure ?? t("restore.loading")}</p>}
      {nothingToDo && <p>{t("pending.nothing")}</p>}
      {rows?.map((row, index) => (
        <RestoreRow
          key={row.entry.repo}
          row={row}
          pick={picks[index]}
          onPick={(next) => setPicks((current) => current.map((pick, at) => (at === index ? next : pick)))}
          t={t}
        />
      ))}
      {pack.manual.length > 0 && <ByHand plugins={pack.manual} t={t} />}
    </WideConfirmModal>
  );
}

export const showRestorePack = (pack: ImportedPack, t: TFunc) => showModal(<RestorePackModal pack={pack} t={t} />);
