import { useDeckyHubUpdate } from "../hooks/useDeckyHubUpdate";
import { DeckyHubIcon } from "./DeckyHubIcon";
import type { TFunc } from "../i18n/en";
import type { DeckyHubInfo, UpdateChannel, HideableButton } from "../types";
import { buildVersionOptions } from "../utils";
import { iconTileStyle } from "./Card";
import { DeckyHubUpdateFooter, DeckyHubUpdatePrimary } from "./DeckyHubUpdateParts";
import { DetailsWindow } from "./DetailsWindow";
import { VirusScanReport } from "./VirusScanReport";

// showModal() mounts onto a separate root from the QAM panel (Decky's own
// MAIN-window modal manager in production; a fresh React root in the local
// mock), so it never inherits I18nProvider's context — `t` must be a resolved
// function passed in from a caller that does have it, not `useT()` called here.
export function DeckyHubUpdateModal(props: {
  t: TFunc;
  info: DeckyHubInfo;
  channel: UpdateChannel;
  registryChannel: UpdateChannel;
  onCheckUpdate: (channel: UpdateChannel) => void;
  onChannelChange: (channel: UpdateChannel) => void;
  hiddenButtons: HideableButton[];
  closeModal?: () => void;
}) {
  const { t, info, hiddenButtons, closeModal } = props;
  const u = useDeckyHubUpdate(props);
  const { picker } = u;
  const release = picker.selected;
  return (
    <DetailsWindow
      t={t}
      closeModal={closeModal}
      icon={
        <div aria-hidden style={{ ...iconTileStyle, width: 72, height: 72, borderRadius: 16, fontSize: 34 }}>
          <DeckyHubIcon />
        </div>
      }
      title={t("settings.deckyhubUpdate")}
      aside="mazillka/deckyhub-plugin"
      meta={<span>{t("settings.installedVersion", { version: `v${info.version}` })}</span>}
      release={release}
      primary={<DeckyHubUpdatePrimary t={t} u={u} info={info} hiddenButtons={hiddenButtons} />}
      // The update first; the scan report, versions and notes are rows you open (as in a plugin's Manage window).
      collapsible
      report={
        <VirusScanReport
          t={t}
          asset={release?.asset}
          version={release?.tag}
          note={t("scan.deckyhubChecks")}
          closeModal={closeModal}
          showZipActions={false}
        />
      }
      channel={u.channel}
      onChannelChange={u.changeChannel}
      versionOptions={buildVersionOptions(picker.items, info.version, t)}
      selectedTag={picker.selectedTag}
      onVersionChange={picker.setSelectedTag}
      disabled={u.busy}
      error={picker.error || u.selfUpdateError}
      isEmpty={!picker.loading && !picker.error && picker.items.length === 0}
      footer={<DeckyHubUpdateFooter t={t} u={u} hiddenButtons={hiddenButtons} closeModal={closeModal} />}
    />
  );
}
