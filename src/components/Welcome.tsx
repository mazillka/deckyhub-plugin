import { DialogButtonPrimary as Button, PanelSection, PanelSectionRow } from "@decky/ui";
import { useState } from "react";
import { FaCheck, FaShieldAlt } from "react-icons/fa";
import { useT } from "../i18n";
import { compactButtonStyle } from "../utils";
import { Card, IconNote } from "./Card";

export const WELCOME_KEY = "deckyhub-welcome";

const seen = () => {
  try {
    return localStorage.getItem(WELCOME_KEY) === "seen";
  } catch {
    return true; // No storage: don't nag on every visit.
  }
};

// Shown once, at the top of Discover (above its spinner on a first launch): what
// DeckyHub does, where things are, and the safety note in full.
export function Welcome() {
  const t = useT();
  const [show, setShow] = useState(() => !seen());
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(WELCOME_KEY, "seen");
    } catch {
      // Storage unavailable: it just shows again next time.
    }
    setShow(false);
  };
  return (
    <Card accent="#1a9fff">
      <div className="deckyhub-welcome" style={{ paddingTop: 12 }}>
        <PanelSection>
          <PanelSectionRow>
            <div style={{ display: "grid", gap: 8 }}>
              <strong style={{ color: "#fff", fontSize: "1.15em" }}>{t("welcome.title")}</strong>
              <div>{t("welcome.body")}</div>
              <IconNote icon={<FaShieldAlt />}>{t("welcome.safety")}</IconNote>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <div style={{ maxWidth: 220, marginTop: 8 }}>
              <Button style={{ ...compactButtonStyle, marginBottom: 0 }} onClick={dismiss}>
                <FaCheck /> {t("welcome.gotIt")}
              </Button>
            </div>
          </PanelSectionRow>
        </PanelSection>
      </div>
    </Card>
  );
}
