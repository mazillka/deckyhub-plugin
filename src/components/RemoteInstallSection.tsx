import { DialogButtonPrimary as Button, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { FaInfoCircle, FaMobileAlt, FaUsers } from "react-icons/fa";
import { Card, IconNote } from "./Card";
import { colors } from "../styles";
import { useT } from "../i18n";
import { iconRow, sectionDividerStyle } from "../utils";
import { useRemoteInstall } from "../hooks/useRemoteInstall";
import { PendingPairings, PendingRequests } from "./RemoteDecisions";
import { openPairDevice, openPairedBrowsers } from "./RemoteModals";

// Remote Install in Quick Access stays short: the switch, one button that opens the pairing window (the QR
// code and everything it needs live there, see RemoteModals), the requests waiting for an answer, and the browsers.
export function RemoteInstallSection() {
  const t = useT();
  const { status, loading, onToggle, onDecidePairing, onDecideRequest } = useRemoteInstall(t);
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
            <PendingPairings
              t={t}
              pairings={status.pairings ?? []}
              onDecide={(id, approve) => void onDecidePairing(id, approve)}
            />
            <PendingRequests
              t={t}
              requests={status.requests ?? []}
              loading={loading}
              onDecide={(request, approve) => void onDecideRequest(request, approve)}
            />

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
