import { DialogButtonPrimary as Button, Focusable, ToggleField, showModal } from "@decky/ui";
import { toaster } from "@decky/api";
import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { FaCheck, FaLink, FaSyncAlt, FaTimes, FaTrash } from "react-icons/fa";
import {
  beginRemotePairing,
  decideRemotePairing,
  getRemoteInstallStatus,
  revokeRemoteDevice,
  setRemoteDeviceTrusted,
} from "../api";
import { copyText } from "../clipboard";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import type { RemoteInstallStatus } from "../types";
import { iconRow } from "../utils";
import { WideConfirmModal, WideModalRoot } from "./WideModal";

// How long a pairing code lasts (RemoteInstallService.begin_pairing), for the countdown bar.
const PAIRING_SECONDS = 120;
const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const buttonRow = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } as const;
const bigButton = { ...iconRow, margin: 0, flex: 1, minWidth: 150 } as const;

// The status of Remote Install, refreshed while a window is open.
function useRemoteStatus(): [RemoteInstallStatus | null, () => Promise<void>] {
  const [status, setStatus] = useState<RemoteInstallStatus | null>(null);
  const refresh = async () => {
    try {
      setStatus(await getRemoteInstallStatus());
    } catch {
      // The plugin is unloading: keep what is shown.
    }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, []);
  return [status, refresh];
}

/**
 * Pair a device: one window with everything the pairing needs, so Quick Access stays short.
 * It shows the QR code first; when a browser asks to pair it turns into a single question
 * (approve or reject), and then into a confirmation. Opening it never changes Pair mode.
 */
export function PairDeviceModal({ t, closeModal }: { t: TFunc; closeModal?: () => void }) {
  const [status, refresh] = useRemoteStatus();
  const [ticket, setTicket] = useState<{ code: string; token: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const newCode = async () => {
    try {
      const res = await beginRemotePairing();
      setTicket({ code: res.code, token: res.pairingToken, expiresAt: Date.now() + res.expiresInSeconds * 1000 });
      setNow(Date.now());
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  useEffect(() => {
    void newCode();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = ticket ? Math.max(0, Math.ceil((ticket.expiresAt - now) / 1000)) : 0;
  const expired = Boolean(ticket) && remaining === 0;
  const request = status?.pairings?.[0];

  const link =
    status?.address && status.fingerprint && ticket
      ? (() => {
          const details = new URLSearchParams({
            device: new URL(status.address).host,
            fingerprint: status.fingerprint,
            pair: ticket.token,
            code: ticket.code,
          });
          if (status.deviceName) details.set("name", status.deviceName);
          return `https://deckyhub.com/develop/remote-install/#${details}`;
        })()
      : null;
  const qr = useMemo(() => {
    if (!link) return null;
    const code = qrcode(0, "M");
    code.addData(link);
    code.make();
    return code.createDataURL(5, 12);
  }, [link]);

  const decide = async (id: string, name: string, approve: boolean) => {
    try {
      await decideRemotePairing(id, approve);
      if (approve) setPairedName(name);
      void refresh();
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  const running = Boolean(status?.enabled && status.active && status.address);
  let body;
  if (pairedName) {
    body = (
      <div style={{ display: "grid", justifyItems: "center", gap: 14, textAlign: "center", padding: "12px 0" }}>
        <span
          style={{
            alignItems: "center",
            background: colors.success,
            borderRadius: "50%",
            color: "#0d1b14",
            display: "inline-flex",
            fontSize: 34,
            fontWeight: 700,
            height: 64,
            justifyContent: "center",
            width: 64,
          }}
        >
          ✓
        </span>
        <strong style={{ fontSize: "1.15em", overflowWrap: "anywhere" }}>
          {t("remote.paired", { name: pairedName })}
        </strong>
      </div>
    );
  } else if (request) {
    body = (
      <div style={{ display: "grid", gap: 16, padding: "8px 0" }}>
        <strong style={{ fontSize: "1.2em", overflowWrap: "anywhere", textAlign: "center" }}>
          {t("remote.pairingWants", { name: request.name })}
        </strong>
        <Focusable flow-children="right" style={buttonRow}>
          <Button
            style={{ ...bigButton, background: colors.success }}
            onClick={() => void decide(request.id, request.name, true)}
          >
            <FaCheck /> {t("remote.approve")}
          </Button>
          <Button
            style={{ ...bigButton, background: colors.danger }}
            onClick={() => void decide(request.id, request.name, false)}
          >
            <FaTimes /> {t("remote.reject")}
          </Button>
        </Focusable>
      </div>
    );
  } else if (!running) {
    body = (
      <div style={{ color: colors.danger, overflowWrap: "anywhere" }}>{status?.error || t("remote.notRunning")}</div>
    );
  } else {
    body = (
      <div style={{ display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
        <span style={{ color: colors.muted }}>{t("remote.scanPairingQr")}</span>
        {qr && !expired ? (
          <img src={qr} alt="" style={{ width: "min(100%, 300px)", height: "auto", imageRendering: "pixelated" }} />
        ) : (
          <div style={{ color: colors.warning }}>{t("remote.expired")}</div>
        )}
        {ticket && !expired && (
          <div style={{ display: "grid", gap: 6, width: "min(100%, 300px)" }}>
            <div
              style={{
                fontSize: "1.5em",
                fontWeight: "bold",
                letterSpacing: 4,
                color: colors.success,
                padding: "2px 8px",
                border: `1px solid ${colors.success}`,
                borderRadius: 4,
              }}
            >
              {ticket.code}
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
            <small
              style={{ color: remaining <= 20 ? colors.warning : colors.muted, fontVariantNumeric: "tabular-nums" }}
            >
              {t("remote.expiresIn", { time: formatClock(remaining) })}
            </small>
          </div>
        )}
        <small style={{ color: colors.accent }}>{t("remote.sameWifi")}</small>
        <small style={{ color: colors.dim }}>{t("remote.waiting")}</small>
        <Focusable flow-children="right" style={{ ...buttonRow, width: "100%" }}>
          <Button style={bigButton} onClick={() => void newCode()}>
            <FaSyncAlt /> {t("remote.newCode")}
          </Button>
          {link && (
            <Button
              style={bigButton}
              onClick={() =>
                void copyText(link).then((copied) =>
                  toaster.toast({ title: copied ? t("remote.copyPairingLink") : t("scan.copyFailed"), body: "" }),
                )
              }
            >
              <FaLink /> {t("remote.copyPairingLink")}
            </Button>
          )}
        </Focusable>
        {status?.address && (
          <div style={{ width: "100%", textAlign: "start" }}>
            <ToggleField label={t("remote.address")} checked={showDetails} onChange={setShowDetails} />
            {showDetails && (
              <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                <code style={{ color: colors.accent }}>
                  {status.address.replace(/^https?:\/\//, "").replace(/\/remote-install$/, "")}
                </code>
                {status.fingerprint && (
                  <code style={{ fontSize: "0.75em", wordBreak: "break-all" }}>{status.fingerprint}</code>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <WideModalRoot closeModal={closeModal}>
      <div style={{ display: "grid", gap: 14 }}>
        <strong style={{ fontSize: "1.25em" }}>{t("remote.pairDevice")}</strong>
        {body}
        <Button style={{ ...iconRow, margin: 0, width: "100%" }} onClick={() => closeModal?.()}>
          {t("settings.close")}
        </Button>
      </div>
    </WideModalRoot>
  );
}

/** The paired browsers: who can reach this device, with a Trusted switch and Remove for each. */
export function PairedBrowsersModal({ t, closeModal }: { t: TFunc; closeModal?: () => void }) {
  const [status, refresh] = useRemoteStatus();

  const onRevoke = async (id: string) => {
    try {
      await revokeRemoteDevice(id);
      void refresh();
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };
  const onTrust = async (device: { id: string; name: string }, trusted: boolean) => {
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

  const devices = status?.devices ?? [];
  return (
    <WideModalRoot closeModal={closeModal}>
      <div style={{ display: "grid", gap: 14 }}>
        <strong style={{ fontSize: "1.25em" }}>{t("remote.devices")}</strong>
        {devices.length === 0 && <div style={{ color: colors.muted }}>{t("remote.noBrowsers")}</div>}
        {devices.map((device) => (
          <div key={device.id} style={{ display: "grid", gap: 6 }}>
            <span style={{ overflowWrap: "anywhere", fontWeight: "bold" }}>{device.name}</span>
            <Focusable
              flow-children="right"
              style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <ToggleField
                  label={t("remote.trusted")}
                  checked={Boolean(device.trusted)}
                  onChange={(checked) => void onTrust(device, checked)}
                />
              </div>
              <Button style={{ ...iconRow, margin: 0 }} onClick={() => void onRevoke(device.id)}>
                <FaTrash /> {t("repos.removeConfirm")}
              </Button>
            </Focusable>
          </div>
        ))}
        <Button style={{ ...iconRow, margin: 0, width: "100%" }} onClick={() => closeModal?.()}>
          {t("settings.close")}
        </Button>
      </div>
    </WideModalRoot>
  );
}

export const openPairDevice = (t: TFunc) => showModal(<PairDeviceModal t={t} />);
export const openPairedBrowsers = (t: TFunc) => showModal(<PairedBrowsersModal t={t} />);
