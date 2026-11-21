import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Focusable, PanelSection, PanelSectionRow, showModal } from "@decky/ui";
import { FaArrowUp, FaSync } from "react-icons/fa";
import { getSettings } from "../api";
import { useT } from "../i18n";
import type { TFunc } from "../i18n/en";
import { compactButtonStyle, getDeckyBackend, installDeckyPlugin, PLUGIN_INSTALL_TYPE, visuallyHidden } from "../utils";
import { normalizeVersion } from "../version";
import { showReleaseInfo } from "./ReleaseInfo";
import { downloadDeckyHubZip } from "../hooks/useDeckyHubUpdate";
import { useDeckyHubVersion } from "../hooks/useDeckyHubVersion";
import { DeckyHubUpdateModal } from "./DeckyHubUpdateModal";
import { Card } from "./Card";
import { colors } from "../styles";

type Version = ReturnType<typeof useDeckyHubVersion>;

// Same hand-off as the update window's own Update button: Decky's
// confirm/progress dialog takes over.
function selfUpdate(t: TFunc, release: Version["release"]) {
  if (!getDeckyBackend()) {
    toaster.toast({ title: "DeckyHub", body: t("settings.selfUpdateUnavailable") });
    return;
  }
  installDeckyPlugin(
    release.asset!,
    "mazillka/deckyhub-plugin",
    "DeckyHub",
    release.version!,
    PLUGIN_INSTALL_TYPE.UPDATE,
  ).catch((error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }));
}

// The Update button for the newer release: Y shows its notes, X downloads its ZIP.
function QuickUpdateButton({ t, v }: { t: TFunc; v: Version }) {
  const { release, hiddenButtons } = v;
  return (
    <Button
      style={{ ...compactButtonStyle, marginBottom: 0 }}
      onClick={() => selfUpdate(t, release)}
      onSecondaryButton={() =>
        showReleaseInfo(t, `DeckyHub v${normalizeVersion(release.version!)}`, release.publishedAt, release.notes)
      }
      onSecondaryActionDescription={t("appcard.releaseInfo")}
      // X downloads this release's ZIP instead of installing it.
      onOptionsButton={
        hiddenButtons.includes("downloadZip")
          ? undefined
          : () =>
              void downloadDeckyHubZip(t, release.asset!).catch((error: unknown) =>
                toaster.toast({ title: "DeckyHub", body: String(error) }),
              )
      }
      onOptionsActionDescription={t("settings.downloadUpdate")}
    >
      {/* "Update to vX" doesn't fit beside the gear in Quick Access; the note above names the version. */}
      <FaArrowUp /> <span aria-hidden="true">{t("appcard.update")}</span>
      <span style={visuallyHidden}>{t("settings.updateTo", { version: normalizeVersion(release.version!) })}</span>
    </Button>
  );
}

// Opens the update window; reads settings on open so Display Settings' hidden buttons are current.
function openUpdateWindow(t: TFunc, v: Version) {
  void getSettings().then((settings) => {
    v.setHiddenButtons(settings.hiddenButtons ?? []);
    showModal(
      <DeckyHubUpdateModal
        t={t}
        info={v.info}
        channel={v.channel}
        registryChannel={settings.registryChannel}
        onCheckUpdate={(checkedChannel) => v.checkForUpdate(false, checkedChannel)}
        onChannelChange={v.setChannel}
        hiddenButtons={settings.hiddenButtons}
      />,
    );
  });
}

// Deliberately thin, like an app card: a header naming the installed version,
// a note naming the newer release and Update while one is known, and Manage. Everything else
// (channel, other versions, download-zip fallback, release page, re-check)
// lives in DeckyHubUpdateModal.
export function DeckyHubUpdate() {
  const t = useT();
  const v = useDeckyHubVersion(t);
  const { hasUpdate, release } = v;
  const title = v.loading ? `${t("settings.checkingVersion")}…` : `DeckyHub v${v.info.version}`;
  return (
    <Card accent={hasUpdate ? colors.warning : undefined}>
      <PanelSection>
        {/* Steam's section title (as measured on a Deck), minus its capitals:
            "DECKYHUB V3.0.0-RC.13" crowded the panel. */}
        <div
          style={{
            paddingTop: 10,
            paddingBottom: 8,
            color: "rgba(255, 255, 255, 0.7)",
            fontSize: 16,
            fontWeight: 600,
            lineHeight: "22px",
          }}
        >
          {title}
        </div>
        {hasUpdate && (
          <PanelSectionRow>
            <div style={{ color: colors.warning, fontSize: "max(12px, 0.85em)" }}>
              {t("settings.updateAvailable", { version: `v${normalizeVersion(release.version!)}` })}
            </div>
          </PanelSectionRow>
        )}
        {/* Update, with Manage as a gear beside it; Manage alone takes the full row. */}
        <PanelSectionRow>
          <Focusable flow-children="right" style={{ display: "flex", gap: 8 }}>
            {hasUpdate && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <QuickUpdateButton t={t} v={v} />
              </div>
            )}
            <div style={hasUpdate ? { flex: "0 0 44px" } : { flex: 1 }}>
              <Button
                style={{ ...compactButtonStyle, marginBottom: 0, ...(hasUpdate && { padding: 0 }) }}
                aria-label={t("settings.deckyhubUpdate")}
                onClick={() => openUpdateWindow(t, v)}
              >
                <FaSync /> <span style={hasUpdate ? visuallyHidden : undefined}>{t("nav.updates")}</span>
              </Button>
            </div>
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}
