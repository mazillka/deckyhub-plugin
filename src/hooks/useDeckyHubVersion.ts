import { toaster } from "@decky/api";
import { useEffect, useRef, useState } from "react";
import { getDeckyHubInfo, getSettings } from "../api";
import type { TFunc } from "../i18n/en";
import type { DeckyHubInfo, DeckyHubRelease, HideableButton, UpdateChannel } from "../types";
import { latestDeckyHubRelease, log, PLUGIN_INSTALL_TYPE, resolveDeckyHubInstallType, seenOnce } from "../utils";

const SELF_UPDATE_NOTICE_KEY = "deckyhub-self-update-notice";

// DeckyHub's installed version, its latest release on the chosen channel, and whether that one is an update.
export function useDeckyHubVersion(t: TFunc) {
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [info, setInfo] = useState<DeckyHubInfo>({ version: "unknown", downloadDir: "" });
  const [release, setRelease] = useState<DeckyHubRelease>({});
  const [hiddenButtons, setHiddenButtons] = useState<HideableButton[]>([]);

  // Only a strictly newer release counts as available — e.g. a pre-release
  // install on the stable channel mustn't be offered the older stable one.
  const isNewer = (version?: string) =>
    Boolean(
      version &&
      info.version !== "unknown" &&
      resolveDeckyHubInstallType(version, info.version) === PLUGIN_INSTALL_TYPE.UPDATE,
    );

  // Only the automatic check toasts, once per version: the button already
  // names the update, and an explicit check happens in the open update window.
  const checkForUpdate = (notify: boolean, checkedChannel = channel) =>
    void latestDeckyHubRelease(checkedChannel).then((next) => {
      setRelease(next);
      if (
        !notify ||
        !next.version ||
        next.error ||
        !isNewer(next.version) ||
        !seenOnce(SELF_UPDATE_NOTICE_KEY, next.version)
      )
        return;
      toaster.toast({ title: "DeckyHub", body: t("settings.updateAvailable", { version: next.version }) });
    });

  useEffect(() => {
    void Promise.all([getSettings(), getDeckyHubInfo()])
      .then(([settings, nextInfo]) => {
        setChannel(settings.updateChannel);
        setHiddenButtons(settings.hiddenButtons ?? []);
        setInfo(nextInfo);
      })
      .catch((error) => {
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

  return {
    channel,
    setChannel,
    info,
    release,
    hiddenButtons,
    setHiddenButtons,
    checkForUpdate,
    loading: info.version === "unknown",
    hasUpdate:
      Boolean(release.asset && release.version && isNewer(release.version)) && !hiddenButtons.includes("update"),
  };
}
