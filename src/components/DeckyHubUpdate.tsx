import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, PanelSection, PanelSectionRow, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import { getDeckyHubInfo, getSettings } from "../api";
import { useT } from "../i18n";
import type { DeckyHubInfo, DeckyHubRelease, UpdateChannel } from "../types";
import { compactButtonStyle, latestDeckyHubRelease } from "../utils";
import { DeckyHubUpdateModal } from "./DeckyHubUpdateModal";

// Deliberately thin: a header naming the installed version and a single
// "Update" button. Everything else (latest version, self-update progress,
// download-zip fallback, release page, re-check) lives in DeckyHubUpdateModal.
export function DeckyHubUpdate() {
  const t = useT();
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [info, setInfo] = useState<DeckyHubInfo>({ version: "unknown" });
  const [release, setRelease] = useState<DeckyHubRelease>({});

  const checkForUpdate = () =>
    void latestDeckyHubRelease(channel).then((next) => {
      setRelease(next);
      if (next.version && !next.error && info.version !== "unknown" && next.version.trim().replace(/^v/i, "") !== info.version.trim().replace(/^v/i, "")) {
        toaster.toast({ title: "DeckyHub", body: t("settings.updateAvailable", { version: next.version }) });
      }
    });

  useEffect(() => {
    void Promise.all([getSettings(), getDeckyHubInfo()]).then(([settings, nextInfo]) => {
      setChannel(settings.updateChannel);
      setInfo(nextInfo);
    }).catch((error) => setRelease({ error: String(error) }));
  }, []);

  useEffect(() => {
    if (info.version !== "unknown") checkForUpdate();
  }, [channel, info.version]);

  const upToDate = Boolean(release.version && info.version !== "unknown" && release.version.trim().replace(/^v/i, "") === info.version.trim().replace(/^v/i, ""));
  const loading = info.version === "unknown";
  const title = loading ? `${t("settings.checkingVersion")}…` : `${t("settings.current")} - v${info.version}`;
  const buttonLabel =
    release.asset && !upToDate && release.version
      ? t("settings.updateButtonAvailable", { version: release.version.trim().replace(/^v/i, "") })
      : t("settings.updateButton");

  return (
    <PanelSection title={title}>
      <PanelSectionRow>
        <Button
          style={compactButtonStyle}
          onClick={() => showModal(<DeckyHubUpdateModal t={t} info={info} channel={channel} onCheckUpdate={checkForUpdate} onChannelChange={setChannel} />)}
        >
          {buttonLabel}
        </Button>
      </PanelSectionRow>
    </PanelSection>
  );
}
