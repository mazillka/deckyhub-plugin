import { DialogButtonPrimary as Button, Focusable, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { toaster } from "@decky/api";
import { useEffect, useState } from "react";
import { FaCheck, FaInfoCircle, FaMobileAlt, FaTimes, FaUsers } from "react-icons/fa";
import { decideRemotePairing, decideRemoteRequest, getRemoteInstallStatus, setRemoteInstallEnabled } from "../api";
import { Card, IconNote } from "./Card";
import { colors } from "../styles";
import type { RemoteInstallRequest, RemoteInstallStatus } from "../types";
import { useT } from "../i18n";
import { compactButtonStyle, iconRow, sectionDividerStyle } from "../utils";
import { runRemoteRequest } from "./remoteRequests";
import { openPairDevice, openPairedBrowsers } from "./RemoteModals";

// Remote Install in Quick Access stays short: the switch, one button that opens the pairing window (the QR
// code and everything it needs live there, see RemoteModals), the requests waiting for an answer, and the browsers.
export function RemoteInstallSection() {
  const t = useT();
  const [status, setStatus] = useState<RemoteInstallStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await getRemoteInstallStatus());
    } catch {
      // Ignored if plugin is unloading
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, []);

  const onToggle = async (enabled: boolean) => {
    setLoading(true);
    try {
      setStatus(await setRemoteInstallEnabled(enabled));
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const onDecidePairing = async (pairId: string, approve: boolean) => {
    try {
      await decideRemotePairing(pairId, approve);
      toaster.toast({ title: "DeckyHub", body: approve ? t("remote.approve") : t("remote.reject") });
      void refresh();
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  const onDecideRequest = async (request: RemoteInstallRequest, approve: boolean) => {
    if (!approve) {
      try {
        await decideRemoteRequest(request.id, false);
        await refresh();
      } catch (error) {
        toaster.toast({ title: "DeckyHub", body: String(error) });
      }
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      await runRemoteRequest(request, t, false);
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    } finally {
      setLoading(false);
      void refresh();
    }
  };

  const isEnabled = Boolean(status?.enabled);
  const isActive = Boolean(status?.active);
  const browsers = status?.devices?.length ?? 0;

  return (
    <Card>
      <PanelSection title={t("remote.title")}>
        <PanelSectionRow>
          <ToggleField
            label={t("remote.pairMode")}
            checked={isEnabled}
            disabled={loading}
            onChange={(checked) => void onToggle(checked)}
          />
        </PanelSectionRow>

        {isEnabled && status?.error && (
          <PanelSectionRow>
            <div style={{ color: colors.danger, fontSize: "0.9em" }}>
              <IconNote icon={<FaInfoCircle />}>{status.error}</IconNote>
            </div>
          </PanelSectionRow>
        )}

        {isEnabled && isActive && status?.address && (
          <>
            <PanelSectionRow>
              <Button style={{ ...iconRow, margin: 0, width: "100%" }} onClick={() => openPairDevice(t)}>
                <FaMobileAlt /> {t("remote.pairDevice")}
              </Button>
            </PanelSectionRow>

            {/* A browser asking to pair while the pairing window is closed */}
            {status.pairings?.map((p) => (
              <PanelSectionRow key={p.id}>
                <div style={{ display: "grid", gap: 6 }}>
                  <strong style={{ color: colors.warning, overflowWrap: "anywhere" }}>
                    {t("remote.pairingWants", { name: p.name })}
                  </strong>
                  <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Button
                      style={{ ...compactButtonStyle, background: colors.success, marginBottom: 0 }}
                      onClick={() => void onDecidePairing(p.id, true)}
                    >
                      <FaCheck /> {t("remote.approve")}
                    </Button>
                    <Button
                      style={{ ...compactButtonStyle, background: colors.danger, marginBottom: 0 }}
                      onClick={() => void onDecidePairing(p.id, false)}
                    >
                      <FaTimes /> {t("remote.reject")}
                    </Button>
                  </Focusable>
                </div>
              </PanelSectionRow>
            ))}

            {/* Plugin requests waiting for an answer: what is asked on its own line, the buttons under it */}
            {Boolean(status.requests?.length) && (
              <>
                <div aria-hidden style={sectionDividerStyle} />
                <PanelSectionRow>
                  <strong style={{ color: colors.accent }}>{t("remote.requests")}</strong>
                </PanelSectionRow>
                {status.requests.map((r) => (
                  <PanelSectionRow key={r.id}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                        <div style={{ fontWeight: "bold" }}>
                          {t(
                            r.action === "uninstall"
                              ? "appcard.uninstall"
                              : r.action === "update"
                                ? "appcard.update"
                                : "appcard.install",
                          )}{" "}
                          · {r.pluginName || r.pluginId}
                        </div>
                        <div style={{ fontSize: "0.8em", color: colors.muted }}>
                          {t("remote.from", { name: r.ownerName })}
                          {r.releaseTag ? ` (${r.releaseTag})` : ""}
                        </div>
                      </div>
                      <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Button
                          style={{ ...compactButtonStyle, background: colors.success, marginBottom: 0 }}
                          disabled={loading}
                          onClick={() => void onDecideRequest(r, true)}
                        >
                          <FaCheck /> {t("remote.approve")}
                        </Button>
                        <Button
                          style={{ ...compactButtonStyle, background: colors.danger, marginBottom: 0 }}
                          disabled={loading}
                          onClick={() => void onDecideRequest(r, false)}
                        >
                          <FaTimes /> {t("remote.reject")}
                        </Button>
                      </Focusable>
                    </div>
                  </PanelSectionRow>
                ))}
              </>
            )}

            {browsers > 0 && (
              <PanelSectionRow>
                <Button style={{ ...iconRow, margin: 0, width: "100%" }} onClick={() => openPairedBrowsers(t)}>
                  <FaUsers /> {t("remote.devices")} · {browsers}
                </Button>
              </PanelSectionRow>
            )}
          </>
        )}

        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <IconNote icon={<FaMobileAlt />}>{t("remote.description")}</IconNote>
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}
