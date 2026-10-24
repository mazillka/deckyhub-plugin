import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, PanelSection, PanelSectionRow, showModal } from "@decky/ui";
import { useEffect, useRef, useState } from "react";
import { FaArrowUp, FaCog } from "react-icons/fa";
import { getDeckyHubInfo, getSettings } from "../api";
import { useT } from "../i18n";
import type { DeckyHubInfo, DeckyHubRelease, HideableButton, UpdateChannel } from "../types";
import { compactButtonStyle, getDeckyBackend, installDeckyPlugin, latestDeckyHubRelease, log, seenOnce, PLUGIN_INSTALL_TYPE, resolveDeckyHubInstallType } from "../utils";
import { normalizeVersion } from "../version";
import { showReleaseInfo } from "./AppCard";
import { DeckyHubUpdateModal, downloadDeckyHubZip } from "./DeckyHubUpdateModal";
import { KeepInView } from "./KeepInView";

const SELF_UPDATE_NOTICE_KEY = "deckyhub-self-update-notice";

// Deliberately thin, like an app card: a header naming the installed version,
// "Update to vX" while a newer release is known, and Manage. Everything else
// (channel, other versions, download-zip fallback, release page, re-check)
// lives in DeckyHubUpdateModal.
export function DeckyHubUpdate() {
  const t = useT();
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [info, setInfo] = useState<DeckyHubInfo>({ version: "unknown" });
  const [release, setRelease] = useState<DeckyHubRelease>({});
  const [hiddenButtons, setHiddenButtons] = useState<HideableButton[]>([]);

  // Only a strictly newer release counts as available — e.g. a pre-release
  // install on the stable channel mustn't be offered the older stable one.
  const isNewer = (version?: string) =>
    Boolean(version && info.version !== "unknown" && resolveDeckyHubInstallType(version, info.version) === PLUGIN_INSTALL_TYPE.UPDATE);

  // Only the automatic check toasts, once per version: the button already
  // names the update, and an explicit check happens in the open update window.
  const checkForUpdate = (notify: boolean, checkedChannel = channel) =>
    void latestDeckyHubRelease(checkedChannel).then((next) => {
      setRelease(next);
      if (!notify || !next.version || next.error || !isNewer(next.version) || !seenOnce(SELF_UPDATE_NOTICE_KEY, next.version)) return;
      toaster.toast({ title: "DeckyHub", body: t("settings.updateAvailable", { version: next.version }) });
    });

  useEffect(() => {
    void Promise.all([getSettings(), getDeckyHubInfo()]).then(([settings, nextInfo]) => {
      setChannel(settings.updateChannel);
      setHiddenButtons(settings.hiddenButtons ?? []);
      setInfo(nextInfo);
    }).catch((error) => {
      log(`Loading DeckyHub info failed: ${error}`);
      setRelease({ error: String(error) });
    });
  }, []);

  // Channel changes come from the open update window, so they don't toast.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (info.version === "unknown") return;
    checkForUpdate(!autoChecked.current);
    autoChecked.current = true;
  }, [channel, info.version]);

  const loading = info.version === "unknown";
  const title = loading ? `${t("settings.checkingVersion")}…` : `${t("settings.current")} - v${info.version}`;
  const hasUpdate = Boolean(release.asset && release.version && isNewer(release.version)) && !hiddenButtons.includes("update");

  // Same hand-off as the update window's own Update button: Decky's
  // confirm/progress dialog takes over.
  const update = () => {
    if (!getDeckyBackend()) {
      toaster.toast({ title: "DeckyHub", body: t("settings.selfUpdateUnavailable") });
      return;
    }
    installDeckyPlugin(release.asset!, "mazillka/deckyhub-plugin", "DeckyHub", release.version!, PLUGIN_INSTALL_TYPE.UPDATE).catch((error: unknown) =>
      toaster.toast({ title: "DeckyHub", body: String(error) }),
    );
  };

  return (
    <KeepInView>
      <PanelSection title={title}>
        {hasUpdate && (
          <PanelSectionRow>
            <Button
              style={compactButtonStyle}
              onClick={update}
              onSecondaryButton={() => showReleaseInfo(t, `DeckyHub v${normalizeVersion(release.version!)}`, release.publishedAt, release.notes)}
              onSecondaryActionDescription={t("appcard.releaseInfo")}
              // X downloads this release's ZIP instead of installing it.
              onOptionsButton={hiddenButtons.includes("downloadZip") ? undefined : () => void downloadDeckyHubZip(t, release.asset!).catch((error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }))}
              onOptionsActionDescription={t("settings.downloadUpdate")}
            >
              <FaArrowUp /> {t("settings.updateTo", { version: normalizeVersion(release.version!) })}
            </Button>
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <Button
            style={compactButtonStyle}
            // Read settings on open so Display Settings' hidden buttons are current.
            onClick={() => void getSettings().then((settings) => {
              setHiddenButtons(settings.hiddenButtons ?? []);
              showModal(<DeckyHubUpdateModal t={t} info={info} channel={channel} onCheckUpdate={(checkedChannel) => checkForUpdate(false, checkedChannel)} onChannelChange={setChannel} hiddenButtons={settings.hiddenButtons} />);
            })}
          >
            <FaCog /> {t("appcard.manage")}
          </Button>
        </PanelSectionRow>
      </PanelSection>
    </KeepInView>
  );
}
