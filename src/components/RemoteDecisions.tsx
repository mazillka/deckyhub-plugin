import { DialogButtonPrimary as Button, Focusable, PanelSectionRow } from "@decky/ui";
import { FaCheck, FaTimes } from "react-icons/fa";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import type { RemoteInstallRequest } from "../types";
import { compactButtonStyle, sectionDividerStyle } from "../utils";
import { toggleSubject } from "./RemotePluginToggle";

const REQUEST_LABELS = {
  uninstall: "appcard.uninstall",
  update: "appcard.update",
  enable: "remote.enable",
  disable: "remote.disable",
} as const;

// Approve and Reject side by side, for a pairing or a plugin request.
function DecideButtons({
  t,
  disabled,
  onDecide,
}: {
  t: TFunc;
  disabled?: boolean;
  onDecide: (approve: boolean) => void;
}) {
  return (
    <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Button
        style={{ ...compactButtonStyle, background: colors.success, marginBottom: 0 }}
        disabled={disabled}
        onClick={() => onDecide(true)}
      >
        <FaCheck /> {t("remote.approve")}
      </Button>
      <Button
        style={{ ...compactButtonStyle, background: colors.danger, marginBottom: 0 }}
        disabled={disabled}
        onClick={() => onDecide(false)}
      >
        <FaTimes /> {t("remote.reject")}
      </Button>
    </Focusable>
  );
}

// Browsers asking to pair while the pairing window is closed.
export function PendingPairings({
  t,
  pairings,
  onDecide,
}: {
  t: TFunc;
  pairings: { id: string; name: string }[];
  onDecide: (id: string, approve: boolean) => void;
}) {
  return (
    <>
      {pairings.map((p) => (
        <PanelSectionRow key={p.id}>
          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ color: colors.warning, overflowWrap: "anywhere" }}>
              {t("remote.pairingWants", { name: p.name })}
            </strong>
            <DecideButtons t={t} onDecide={(approve) => onDecide(p.id, approve)} />
          </div>
        </PanelSectionRow>
      ))}
    </>
  );
}

// Plugin requests waiting for an answer: what is asked on its own line, the buttons under it.
export function PendingRequests({
  t,
  requests,
  loading,
  onDecide,
}: {
  t: TFunc;
  requests: RemoteInstallRequest[];
  loading: boolean;
  onDecide: (request: RemoteInstallRequest, approve: boolean) => void;
}) {
  if (!requests.length) return null;
  return (
    <>
      <div aria-hidden style={sectionDividerStyle} />
      <PanelSectionRow>
        <strong style={{ color: colors.accent }}>{t("remote.requests")}</strong>
      </PanelSectionRow>
      {requests.map((r) => (
        <PanelSectionRow key={r.id}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
              <div style={{ fontWeight: "bold" }}>
                {t(REQUEST_LABELS[r.action as keyof typeof REQUEST_LABELS] ?? "appcard.install")} ·{" "}
                {r.action === "enable" || r.action === "disable" ? toggleSubject(r, t) : r.pluginName || r.pluginId}
              </div>
              <div style={{ fontSize: "0.8em", color: colors.muted }}>
                {t("remote.from", { name: r.ownerName })}
                {r.releaseTag ? ` (${r.releaseTag})` : ""}
              </div>
            </div>
            <DecideButtons t={t} disabled={loading} onDecide={(approve) => onDecide(r, approve)} />
          </div>
        </PanelSectionRow>
      ))}
    </>
  );
}
