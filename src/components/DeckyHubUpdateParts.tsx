import { DialogButtonPrimary as Button, DropdownItem, Focusable } from "@decky/ui";
import { FaDownload, FaFileArchive, FaSync, FaTimes } from "react-icons/fa";
import type { useDeckyHubUpdate } from "../hooks/useDeckyHubUpdate";
import type { TFunc } from "../i18n/en";
import type { DeckyHubInfo, DeckyHubReleaseOption, HideableButton, UpdateChannel } from "../types";
import { installTypeLabel, modalButtonStyle, resolveDeckyHubInstallType } from "../utils";
import { normalizeVersion } from "../version";
import { primaryButtonStyle } from "./AppDetailsParts";
import { DetailsRow } from "./DetailsParts";
import { showReleaseInfo } from "./ReleaseInfo";
import { ReleaseActions } from "./VersionPickerPanel";

type Update = ReturnType<typeof useDeckyHubUpdate>;

type PartProps = {
  t: TFunc;
  u: Update;
  hiddenButtons: HideableButton[];
  closeModal?: () => void;
};

// Update / Reinstall / Downgrade for the selected release, and Download ZIP.
export function DeckyHubUpdatePrimary({ t, u, info, hiddenButtons }: PartProps & { info: DeckyHubInfo }) {
  const release: DeckyHubReleaseOption | null = u.picker.selected;
  if (!release) return null;
  const version = normalizeVersion(release.tag);
  const type = resolveDeckyHubInstallType(release.tag, info.version);
  const noAsset = u.busy || !release.asset;
  return (
    <>
      {/* Display Settings' "Hide Update" covers Update/Reinstall/Downgrade. */}
      {!hiddenButtons.includes("update") && (
        <Button
          style={primaryButtonStyle}
          disabled={noAsset}
          onClick={() => void u.selfUpdate(release)}
          onSecondaryButton={() => showReleaseInfo(t, `DeckyHub v${version}`, release.publishedAt, release.notes)}
          onSecondaryActionDescription={t("appcard.releaseInfo")}
          onOptionsButton={
            hiddenButtons.includes("downloadZip") || noAsset ? undefined : () => void u.downloadZip(release.asset!)
          }
          onOptionsActionDescription={t("settings.downloadUpdate")}
        >
          <FaDownload /> {installTypeLabel(t, type, version)}
        </Button>
      )}
      {!hiddenButtons.includes("downloadZip") && (
        <Button style={modalButtonStyle} disabled={noAsset} onClick={() => void u.downloadZip(release.asset!)}>
          <FaFileArchive /> {t("settings.downloadUpdate")}
        </Button>
      )}
    </>
  );
}

// The release link in one row; Check for Updates and the registry's channel behind More; Close.
export function DeckyHubUpdateFooter({ t, u, hiddenButtons, closeModal }: PartProps) {
  return (
    <>
      <ReleaseActions
        t={t}
        url={u.picker.selected?.url}
        hideReleasePage={hiddenButtons.includes("releasePage")}
        checking={u.checking}
        disabled={u.busy}
        onCheck={() => void u.refresh()}
        closeModal={closeModal}
        hideCheck
      />
      <DetailsRow title={t("notice.more")}>
        <Focusable flow-children="down" style={{ display: "grid", gap: 8 }}>
          <Button style={modalButtonStyle} disabled={u.busy} onClick={() => void u.refresh()}>
            <FaSync /> {u.checking ? t("settings.checkingUpdate") : t("settings.checkUpdate")}
          </Button>
          <div
            style={{ display: "grid", gap: 4, padding: "8px 12px", background: "rgba(0, 0, 0, 0.2)", borderRadius: 10 }}
          >
            <DropdownItem
              layout="below"
              bottomSeparator="none"
              label={t("settings.registryChannel")}
              description={t("settings.registryChannelHint")}
              rgOptions={[
                { label: t("appcard.channelStable"), data: "stable" },
                { label: t("appcard.channelPrerelease"), data: "prerelease" },
              ]}
              selectedOption={u.registryChannel}
              onChange={({ data }) => u.changeRegistryChannel(data as UpdateChannel)}
            />
          </div>
        </Focusable>
      </DetailsRow>
      <Button style={modalButtonStyle} onClick={closeModal}>
        <FaTimes /> {t("settings.close")}
      </Button>
    </>
  );
}
