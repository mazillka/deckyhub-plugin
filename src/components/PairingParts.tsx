import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import { toaster } from "@decky/api";
import { FaCheck, FaLink, FaSyncAlt, FaTimes } from "react-icons/fa";
import { copyText } from "../clipboard";
import { PAIRING_SECONDS, type usePairing } from "../hooks/usePairing";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import { iconRow } from "../utils";

type Pairing = ReturnType<typeof usePairing>;

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export const buttonRow = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } as const;
export const bigButton = { ...iconRow, margin: 0, flex: 1, minWidth: 150 } as const;

// The browser is paired: a check mark and its name.
export function PairedNotice({ t, name }: { t: TFunc; name: string }) {
  return (
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
      <strong style={{ fontSize: "1.15em", overflowWrap: "anywhere" }}>{t("remote.paired", { name })}</strong>
    </div>
  );
}

// A browser asks to pair: one question, approve or reject.
export function PairingRequest({
  t,
  request,
  decide,
}: {
  t: TFunc;
  request: { id: string; name: string };
  decide: Pairing["decide"];
}) {
  return (
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
}

// The pairing code, and how long it has left.
function CodeCountdown({ t, code, remaining }: { t: TFunc; code: string; remaining: number }) {
  const low = remaining <= 20;
  return (
    <div style={{ display: "grid", gap: 6, width: "100%" }}>
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
        {code}
      </div>
      <div aria-hidden style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.12)" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, (remaining / PAIRING_SECONDS) * 100)}%`,
            borderRadius: 2,
            background: low ? colors.warning : colors.success,
            transition: "width 1s linear",
          }}
        />
      </div>
      <small style={{ color: low ? colors.warning : colors.muted, fontVariantNumeric: "tabular-nums" }}>
        {t("remote.expiresIn", { time: formatClock(remaining) })}
      </small>
    </div>
  );
}

// The QR code beside its code, so the window fits a 1280x800 screen with its buttons.
function QrAndCode({ t, p }: { t: TFunc; p: Pairing }) {
  const { qr, expired, ticket, last, status } = p;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 20,
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
      }}
    >
      {qr && !expired ? (
        <img src={qr.src} alt="" style={{ width: qr.size, height: qr.size, imageRendering: "pixelated" }} />
      ) : (
        <div style={{ color: colors.warning }}>{t("remote.expired")}</div>
      )}
      <div style={{ display: "grid", gap: 8, justifyItems: "center", flex: "1 1 240px", maxWidth: 340 }}>
        <span style={{ color: colors.muted }}>{t("remote.scanPairingQr")}</span>
        {ticket && !expired && <CodeCountdown t={t} code={ticket.code} remaining={p.remaining} />}
        <small style={{ color: colors.accent }}>{t("remote.sameWifi")}</small>
        <small style={{ color: colors.dim }}>
          {last
            ? t("remote.lastAttempt", {
                peer: last.peer,
                what: t(`remote.attempt.${last.what}`),
                time: formatClock(last.ago),
              })
            : t("remote.waiting")}
        </small>
        {status?.address && (
          <small style={{ color: colors.dim, overflowWrap: "anywhere" }}>
            {status.address.replace(/^https?:\/\//, "").replace(/\/remote-install$/, "")}
          </small>
        )}
      </div>
    </div>
  );
}

// Waiting for a browser: the QR code, its code, and New code / Copy pairing link.
export function PairingQr({ t, p }: { t: TFunc; p: Pairing }) {
  const { link } = p;
  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
      <QrAndCode t={t} p={p} />
      <Focusable flow-children="right" style={{ ...buttonRow, width: "100%" }}>
        <Button style={bigButton} onClick={() => void p.newCode()}>
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
    </div>
  );
}
