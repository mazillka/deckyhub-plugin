import { DialogButtonPrimary as Button, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { FaSearch, FaTrash } from "react-icons/fa";
import { useLeftovers } from "../hooks/useLeftovers";
import { readableBytes, timeAgo } from "../format";
import { useT } from "../i18n";
import { colors } from "../styles";
import { compactButtonStyle, sectionDividerStyle } from "../utils";
import { Card } from "./Card";

// Folders Decky keeps for plugins that are no longer installed (leftovers.py). Looked for only when asked:
// the guess can be wrong, so nothing is picked for the user, and removing backs up the settings first.
export function LeftoversSection() {
  const t = useT();
  const { items, picked, busy, scan, toggle, remove } = useLeftovers(t);

  return (
    <Card>
      <PanelSection title={t("settings.leftovers")}>
        <PanelSectionRow>
          <div style={{ color: colors.muted, fontSize: "max(12px, 0.85em)" }}>{t("settings.leftoversNote")}</div>
        </PanelSectionRow>
        <PanelSectionRow>
          <Button style={compactButtonStyle} disabled={busy} onClick={scan}>
            <FaSearch /> {t("settings.leftoversScan")}
          </Button>
        </PanelSectionRow>
        {items?.length === 0 && (
          <PanelSectionRow>
            <span style={{ color: colors.success }}>{t("settings.leftoversNone")}</span>
          </PanelSectionRow>
        )}
        {Boolean(items?.length) && <div aria-hidden style={sectionDividerStyle} />}
        {items?.map((item) => (
          <PanelSectionRow key={item.name}>
            <ToggleField
              label={item.name}
              description={t("settings.leftoverInfo", { size: readableBytes(item.size), when: timeAgo(item.modified) })}
              checked={picked.has(item.name)}
              onChange={(on) => toggle(item.name, on)}
            />
          </PanelSectionRow>
        ))}
        {picked.size > 0 && (
          <PanelSectionRow>
            <Button style={{ ...compactButtonStyle, color: colors.danger }} onClick={remove}>
              <FaTrash /> {t("settings.leftoversRemove", { count: picked.size })}
            </Button>
          </PanelSectionRow>
        )}
      </PanelSection>
    </Card>
  );
}
