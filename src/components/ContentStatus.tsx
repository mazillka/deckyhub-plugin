import { DialogButtonPrimary as Button, PanelSection, PanelSectionRow, Spinner } from "@decky/ui";
import { FaSync } from "react-icons/fa";
import { useT } from "../i18n";
import { colors } from "../styles";
import { compactButtonStyle } from "../utils";
import { Card } from "./Card";

// Shown while the page's plugins load; Updates also counts the release checks done.
export function LoadingPanel({ checked, total }: { checked: number; total: number }) {
  const t = useT();
  return (
    <PanelSection>
      <PanelSectionRow>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: "50vh" }}>
          <Spinner style={{ width: "1.1em" }} /> {t("content.loading")}
          {total > 0 && ` ${checked}/${total}`}
        </div>
      </PanelSectionRow>
    </PanelSection>
  );
}

export function LoadErrorCard({ error, onRetry }: { error: string; onRetry: () => void }) {
  const t = useT();
  return (
    <Card accent={colors.danger}>
      <PanelSection title={t("content.loadErrorTitle")}>
        <PanelSectionRow>{error}</PanelSectionRow>
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={onRetry}>
            <FaSync /> {t("content.tryAgain")}
          </Button>
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}
