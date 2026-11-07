import { toaster } from "@decky/api";
import { DropdownItem, PanelSection, PanelSectionRow } from "@decky/ui";
import { useT } from "../i18n";
import type { UiStyle } from "../types";
import { changeUiStyle, useUiStyle } from "../uiStyle";
import { Card } from "./Card";
import { colors } from "../styles";

// Quick Access' UI Style: Default (the classic look) or Experimental (the redesign).
// Shown in both, so the Experimental one can always be switched back.
export function UiStyleSection() {
  const t = useT();
  const style = useUiStyle();
  return (
    <Card>
      <PanelSection title={t("settings.uiStyle")}>
        <PanelSectionRow>
          {/* The menu under its label: beside it, "Experimental" was cut short in Quick Access. */}
          <DropdownItem
            layout="below"
            label={t("settings.uiStyle")}
            rgOptions={[
              { label: t("settings.uiStyleDefault"), data: "default" },
              { label: t("settings.uiStyleExperimental"), data: "experimental" },
            ]}
            selectedOption={style}
            onChange={({ data }) =>
              void changeUiStyle(data as UiStyle).catch((error: unknown) =>
                toaster.toast({ title: "DeckyHub", body: String(error) }),
              )
            }
          />
        </PanelSectionRow>
        {/* Its own line rather than the dropdown's description, which Quick Access draws under 12px. */}
        <PanelSectionRow>
          <div style={{ color: colors.subtle, fontSize: "max(12px, 0.85em)" }}>{t("settings.uiStyleHint")}</div>
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}
