import { DialogButtonPrimary as Button, Focusable, PanelSection, PanelSectionRow } from "@decky/ui";
import { useState } from "react";
import { FaHdd } from "react-icons/fa";
import { scanPluginHealth, type PluginHealth } from "../api";
import { readableBytes, timeAgo } from "../format";
import { useT } from "../i18n";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import { compactButtonStyle } from "../utils";
import { Card } from "./Card";
import { keepInView } from "./KeepInView";

const AREAS = ["plugins", "settings", "data", "logs"] as const;

const sizeText = (bytes: number | null, t: TFunc) =>
  bytes === null ? t("health.unknown") : bytes === 0 ? "0 B" : readableBytes(bytes);

// One focus target per plugin, so the D-pad walks and scrolls the list.
function HealthRow({ plugin, t }: { plugin: PluginHealth; t: TFunc }) {
  const known = AREAS.map((area) => plugin.sizes[area]).filter((size): size is number => size !== null);
  const total = known.reduce((sum, size) => sum + size, 0);
  // With a folder unread, the sum is only a floor, and says so.
  const totalText =
    known.length === AREAS.length
      ? sizeText(total, t)
      : known.length
        ? t("health.atLeast", { size: sizeText(total, t) })
        : t("health.unknown");
  return (
    <Focusable
      data-health-row={plugin.folder}
      onActivate={() => {}}
      onFocus={keepInView}
      style={{ display: "grid", gap: 2, width: "100%" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong>{plugin.name}</strong>
        <strong style={{ whiteSpace: "nowrap" }}>{totalText}</strong>
      </div>
      <small style={{ color: colors.muted }}>
        {AREAS.map((area) => `${t(`health.area.${area}`)}: ${sizeText(plugin.sizes[area], t)}`).join(" · ")}
      </small>
      <small style={{ color: colors.muted }}>
        {plugin.logsChanged === null
          ? t("health.logsUnknown")
          : plugin.logsChanged
            ? t("health.logsChanged", { when: timeAgo(plugin.logsChanged) })
            : t("health.noLogs")}
      </small>
    </Focusable>
  );
}

// What each installed plugin takes on the device (health.py). Measured only when asked: walking every folder
// takes a while. Sizes and times only, with no judgement about a plugin.
export function HealthSection() {
  const t = useT();
  const [plugins, setPlugins] = useState<PluginHealth[]>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  const measure = () => {
    setBusy(true);
    setFailure(undefined);
    scanPluginHealth().then(
      (result) => {
        setPlugins(result.plugins);
        setBusy(false);
      },
      (error: unknown) => {
        setFailure(String(error));
        setBusy(false);
      },
    );
  };

  return (
    <Card>
      <PanelSection title={t("health.title")}>
        <PanelSectionRow>
          <div style={{ color: colors.muted, fontSize: "max(12px, 0.85em)" }}>{t("health.note")}</div>
        </PanelSectionRow>
        <PanelSectionRow>
          <Button style={compactButtonStyle} disabled={busy} onClick={measure}>
            <FaHdd /> {busy ? t("health.measuring") : t("health.measure")}
          </Button>
        </PanelSectionRow>
        {failure && (
          <PanelSectionRow>
            <span style={{ color: colors.caution }}>{failure}</span>
          </PanelSectionRow>
        )}
        {plugins?.map((plugin) => (
          <PanelSectionRow key={plugin.folder}>
            <HealthRow plugin={plugin} t={t} />
          </PanelSectionRow>
        ))}
      </PanelSection>
    </Card>
  );
}
