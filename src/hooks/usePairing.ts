import { toaster } from "@decky/api";
import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { beginRemotePairing, decideRemotePairing, getRemoteInstallStatus } from "../api";
import type { RemoteInstallStatus } from "../types";

// How long a pairing code lasts (RemoteInstallService.begin_pairing), for the countdown bar.
export const PAIRING_SECONDS = 120;

// The status of Remote Install, refreshed while a window is open.
export function useRemoteStatus(): [RemoteInstallStatus | null, () => Promise<void>] {
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

// The link the QR code and Copy pairing link carry: the device, its certificate fingerprint and the pairing code.
function pairingLink(status: RemoteInstallStatus | null, ticket: { code: string; token: string } | null) {
  if (!status?.address || !status.fingerprint || !ticket) return null;
  const details = new URLSearchParams({
    device: new URL(status.address).host,
    fingerprint: status.fingerprint,
    pair: ticket.token,
    code: ticket.code,
  });
  if (status.deviceName) details.set("name", status.deviceName);
  return `https://deckyhub.com/develop/remote-install/#${details}`;
}

// A pairing code that expires, the QR code for it, and approving or rejecting a browser that asks to pair.
export function usePairing() {
  const [status, refresh] = useRemoteStatus();
  const [ticket, setTicket] = useState<{ code: string; token: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pairedName, setPairedName] = useState<string | null>(null);

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
  const link = pairingLink(status, ticket);
  const qr = useMemo(() => {
    if (!link) return null;
    const code = qrcode(0, "M");
    code.addData(link);
    code.make();
    // 4 px a square and a 16 px margin, shown at exactly that size: scaled to 220 px the squares were 3 or 4 px wide
    // alternately, which a camera reads badly.
    return { src: code.createDataURL(4, 16), size: code.getModuleCount() * 4 + 32 };
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

  return {
    status,
    ticket,
    remaining,
    expired: Boolean(ticket) && remaining === 0,
    link,
    qr,
    pairedName,
    request: status?.pairings?.[0],
    last: status?.connections?.[0],
    running: Boolean(status?.enabled && status.active && status.address),
    newCode,
    decide,
  };
}
