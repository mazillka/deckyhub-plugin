import {
  DialogButtonPrimary as Button,
  Focusable,
  PanelSection,
  PanelSectionRow,
  ToggleField,
  showModal,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { FaCheck, FaInfoCircle, FaMobileAlt, FaTimes, FaTrash } from "react-icons/fa";
import {
  beginRemotePairing,
  decideRemotePairing,
  decideRemoteRequest,
  getRemoteInstallStatus,
  revokeRemoteDevice,
  setRemoteDeviceTrusted,
  setRemoteInstallEnabled,
} from "../api";
import { Card, IconNote } from "./Card";
import { colors } from "../styles";
import type { RemoteInstallRequest, RemoteInstallStatus } from "../types";
import { useT } from "../i18n";
import { copyText } from "../clipboard";
import { compactButtonStyle, sectionDividerStyle } from "../utils";
import { runRemoteRequest } from "./remoteRequests";
import { WideConfirmModal } from "./WideModal";

// How long a pairing code lasts (RemoteInstallService.begin_pairing), for the countdown bar.
const PAIRING_SECONDS = 120;
const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function RemoteInstallSection() {
  const t = useT();
  const [status, setStatus] = useState<RemoteInstallStatus | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [pairingTicket, setPairingTicket] = useState<{ code: string; token: string } | null>(null);
  // When the pairing code runs out (from the backend's seconds left), and the clock that counts down to it.
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const refresh = async () => {
    try {
      const current = await getRemoteInstallStatus();
      setStatus(current);
      setCode(current.pairingCode ?? null);
      setNow(Date.now());
      setExpiresAt(
        current.pairingCode && current.pairingExpiresIn != null ? Date.now() + current.pairingExpiresIn * 1000 : null,
      );
      setPairingTicket((ticket) => (ticket?.code === current.pairingCode ? ticket : null));
    } catch {
      // Ignored if plugin is unloading
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (expiresAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const onToggle = async (enabled: boolean) => {
    setLoading(true);
    try {
      const next = await setRemoteInstallEnabled(enabled);
      setStatus(next);
      if (!enabled) {
        setCode(null);
        setPairingTicket(null);
        setExpiresAt(null);
        setShowDetails(false);
      } else if (next.active) {
        // Turning pairing on shows the QR straight away; there is nothing else to press.
        await onPair(true);
      }
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const onPair = async (quiet = false) => {
    try {
      const res = await beginRemotePairing();
      setCode(res.code);
      setPairingTicket({ code: res.code, token: res.pairingToken });
      setNow(Date.now());
      setExpiresAt(Date.now() + res.expiresInSeconds * 1000);
      if (!quiet) toaster.toast({ title: t("remote.pair"), body: res.code });
      void refresh();
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  const onDecidePairing = async (pairId: string, approve: boolean) => {
    try {
      await decideRemotePairing(pairId, approve);
      toaster.toast({
        title: "DeckyHub",
        body: approve ? t("remote.approve") : t("remote.reject"),
      });
      void refresh();
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  const onRevokeDevice = async (deviceId: string) => {
    try {
      await revokeRemoteDevice(deviceId);
      toaster.toast({ title: "DeckyHub", body: t("repos.removeConfirm") });
      void refresh();
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  const onTrustDevice = async (device: { id: string; name: string; trusted?: boolean }, trusted: boolean) => {
    try {
      if (trusted) {
        // Trust skips every approval on this device, so it is only ever switched on here, after a warning.
        const accepted = await new Promise<boolean>((resolve) =>
          showModal(
            <WideConfirmModal
              strTitle={t("remote.trustTitle", { name: device.name })}
              strDescription={t("remote.trustWarning")}
              strOKButtonText={t("remote.trust")}
              bDestructiveWarning
              onOK={() => resolve(true)}
              onCancel={() => resolve(false)}
            />,
          ),
        );
        if (!accepted) return;
      }
      await setRemoteDeviceTrusted(device.id, trusted);
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

  const remaining = expiresAt === null ? 0 : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const isEnabled = Boolean(status?.enabled);
  const isActive = Boolean(status?.active);
  const pairingLink =
    status?.address &&
    status.fingerprint &&
    pairingTicket &&
    pairingTicket.code === code &&
    (() => {
      const device = new URL(status.address).host;
      const details = new URLSearchParams({ device, fingerprint: status.fingerprint, pair: pairingTicket.token, code });
      if (status.deviceName) details.set("name", status.deviceName);
      return `https://deckyhub.com/develop/remote-install/#${details}`;
    })();

  const pairingQr = useMemo(() => {
    if (!pairingLink) return null;
    const qr = qrcode(0, "M");
    qr.addData(pairingLink);
    qr.make();
    return qr.createDataURL(4, 16);
  }, [pairingLink]);

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

        {isEnabled && (
          <>
            {status?.error && (
              <PanelSectionRow>
                <div style={{ color: colors.danger, fontSize: "0.9em" }}>
                  <IconNote icon={<FaInfoCircle />}>{status.error}</IconNote>
                </div>
              </PanelSectionRow>
            )}

            {isActive && status?.address && (
              <>
                {/* Pending Pairing Requests */}
                {Boolean(status.pairings?.length) && (
                  <>
                    <div aria-hidden style={sectionDividerStyle} />
                    <PanelSectionRow>
                      <strong style={{ color: colors.warning }}>{t("remote.pairings")}</strong>
                    </PanelSectionRow>
                    {status.pairings.map((p) => (
                      <PanelSectionRow key={p.id}>
                        {/* The browser's name on its own line, like a plugin request below. */}
                        <div style={{ display: "grid", gap: 6 }}>
                          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{p.name}</span>
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
                  </>
                )}

                {/* Pending Install Requests */}
                {Boolean(status.requests?.length) && (
                  <>
                    <div aria-hidden style={sectionDividerStyle} />
                    <PanelSectionRow>
                      <strong style={{ color: colors.accent }}>{t("remote.requests")}</strong>
                    </PanelSectionRow>
                    {status.requests.map((r) => (
                      <PanelSectionRow key={r.id}>
                        {/* What is asked on its own line, the buttons under it: beside them, in the narrow
                            Quick Access panel, the plugin's name had no room and the buttons covered it. */}
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

                {/* Pairing: the code with its countdown, the QR code, and the buttons */}
                <div aria-hidden style={sectionDividerStyle} />
                <PanelSectionRow>
                  <div style={{ display: "grid", gap: 10, width: "100%" }}>
                    {code ? (
                      <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div
                            style={{
                              fontSize: "1.2em",
                              fontWeight: "bold",
                              letterSpacing: 2,
                              color: colors.success,
                              padding: "2px 8px",
                              border: `1px solid ${colors.success}`,
                              borderRadius: 4,
                            }}
                          >
                            {code}
                          </div>
                          <span
                            style={{
                              color: remaining <= 20 ? colors.warning : colors.muted,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {t("remote.expiresIn", { time: formatClock(remaining) })}
                          </span>
                        </div>
                        <div aria-hidden style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.min(100, (remaining / PAIRING_SECONDS) * 100)}%`,
                              borderRadius: 2,
                              background: remaining <= 20 ? colors.warning : colors.success,
                              transition: "width 1s linear",
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <IconNote icon={<FaInfoCircle />}>{t("remote.expired")}</IconNote>
                    )}
                    {pairingQr && (
                      <div style={{ display: "grid", justifyItems: "center", gap: 8, textAlign: "center" }}>
                        <img src={pairingQr} alt="" style={{ maxWidth: "100%", height: "auto" }} />
                        <span>{t("remote.scanPairingQr")}</span>
                      </div>
                    )}
                  </div>
                </PanelSectionRow>
                <PanelSectionRow>
                  <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Button style={{ ...compactButtonStyle, marginBottom: 0 }} onClick={() => void onPair()}>
                      {t("remote.pair")}
                    </Button>
                    {pairingLink && (
                      <Button
                        style={{ ...compactButtonStyle, marginBottom: 0 }}
                        onClick={() =>
                          void copyText(pairingLink).then((copied) => {
                            toaster.toast({
                              title: copied ? t("remote.copyPairingLink") : t("scan.copyFailed"),
                              body: "",
                            });
                          })
                        }
                      >
                        {t("remote.copyPairingLink")}
                      </Button>
                    )}
                  </Focusable>
                </PanelSectionRow>

                {/* Paired Browsers */}
                {Boolean(status.devices?.length) && (
                  <>
                    <div aria-hidden style={sectionDividerStyle} />
                    <PanelSectionRow>
                      <span style={{ fontSize: "0.9em", color: colors.muted }}>{t("remote.devices")}</span>
                    </PanelSectionRow>
                    {status.devices.map((d) => (
                      <PanelSectionRow key={d.id}>
                        <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ flex: 1 }}>{d.name}</span>
                          <ToggleField
                            label={t("remote.trusted")}
                            checked={Boolean(d.trusted)}
                            onChange={(checked) => void onTrustDevice(d, checked)}
                          />
                          <Button
                            style={{ ...compactButtonStyle, marginBottom: 0 }}
                            onClick={() => void onRevokeDevice(d.id)}
                          >
                            <FaTrash /> {t("repos.removeConfirm")}
                          </Button>
                        </Focusable>
                      </PanelSectionRow>
                    ))}
                  </>
                )}
                <div aria-hidden style={sectionDividerStyle} />
                <PanelSectionRow>
                  <ToggleField label={t("remote.address")} checked={showDetails} onChange={setShowDetails} />
                </PanelSectionRow>
                {showDetails && (
                  <PanelSectionRow>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: "0.85em", color: colors.muted }}>{t("remote.address")}</div>
                      <code style={{ fontSize: "0.95em", color: colors.accent }}>
                        {status.address.replace(/^https?:\/\//, "").replace(/\/remote-install$/, "")}
                      </code>
                      {status.fingerprint && (
                        <>
                          <div style={{ fontSize: "0.85em", color: colors.muted, marginTop: 4 }}>
                            {t("remote.fingerprint")}
                          </div>
                          <code
                            style={{
                              fontSize: "0.75em",
                              wordBreak: "break-all",
                              background: "rgba(0,0,0,0.2)",
                              padding: "4px 8px",
                              borderRadius: 4,
                            }}
                          >
                            {status.fingerprint}
                          </code>
                        </>
                      )}
                    </div>
                  </PanelSectionRow>
                )}
              </>
            )}
          </>
        )}
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <div style={{ display: "grid", gap: 8 }}>
            <IconNote icon={<FaMobileAlt />}>{t("remote.description")}</IconNote>
          </div>
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}
