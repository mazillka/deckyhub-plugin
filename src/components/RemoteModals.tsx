import { DialogButtonPrimary as Button, Focusable, ToggleField, showModal } from "@decky/ui";
import { toaster } from "@decky/api";
import { FaTrash } from "react-icons/fa";
import { revokeRemoteDevice, setRemoteDeviceTrusted } from "../api";
import { usePairing, useRemoteStatus } from "../hooks/usePairing";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import { iconRow } from "../utils";
import { PairedNotice, PairingQr, PairingRequest } from "./PairingParts";
import { WideConfirmModal, WideModalRoot } from "./WideModal";

/**
 * Pair a device: one window with everything the pairing needs, so Quick Access stays short.
 * It shows the QR code first; when a browser asks to pair it turns into a single question
 * (approve or reject), and then into a confirmation. Opening it never changes Remote access.
 */
export function PairDeviceModal({ t, closeModal }: { t: TFunc; closeModal?: () => void }) {
  const p = usePairing();
  return (
    <WideModalRoot closeModal={closeModal}>
      <div style={{ display: "grid", gap: 14 }}>
        <strong style={{ fontSize: "1.25em" }}>{t("remote.pairDevice")}</strong>
        <PairDeviceBody t={t} p={p} />
        <Button style={{ ...iconRow, margin: 0, width: "100%" }} onClick={() => closeModal?.()}>
          {t("settings.close")}
        </Button>
      </div>
    </WideModalRoot>
  );
}

// Which step the pairing is on: paired, a browser asking, Remote Install not running, or the QR code.
function PairDeviceBody({ t, p }: { t: TFunc; p: ReturnType<typeof usePairing> }) {
  if (p.pairedName) return <PairedNotice t={t} name={p.pairedName} />;
  if (p.request) return <PairingRequest t={t} request={p.request} decide={p.decide} />;
  if (!p.running)
    return (
      <div style={{ color: colors.danger, overflowWrap: "anywhere" }}>{p.status?.error || t("remote.notRunning")}</div>
    );
  return <PairingQr t={t} p={p} />;
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
