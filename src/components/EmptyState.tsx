import { DialogButtonPrimary as Button, Navigation, PanelSection, PanelSectionRow } from "@decky/ui";
import { FaCompass, FaTimes } from "react-icons/fa";
import { useT } from "../i18n";
import { compactButtonStyle, surfaceStyle } from "../utils";
import { keepInView } from "./KeepInView";

// What an empty Updates or Discover list says, with the way out: Discover from
// Updates, or Clear when Discover's filters hid everything.
export function EmptyState({ title, toDiscover, onClear }: { title: string; toDiscover?: boolean; onClear?: () => void }) {
  const t = useT();
  return (
    <div className="deckyhub-empty" onFocus={keepInView} style={{ ...surfaceStyle, padding: "16px 14px", textAlign: "center" }}>
      {/* Decky's section title is a left-aligned flex row; center it too. */}
      <style>{".deckyhub-empty div { text-align: center; justify-content: center; }"}</style>
      <PanelSection title={title}>
        {toDiscover && (
          <PanelSectionRow>
            <Button style={compactButtonStyle} onClick={() => Navigation.Navigate("/deckyhub/discover")}>
              <FaCompass /> {t("nav.discover")}
            </Button>
          </PanelSectionRow>
        )}
        {onClear && (
          <PanelSectionRow>
            <Button style={compactButtonStyle} onClick={onClear}>
              <FaTimes /> {t("repos.clear")}
            </Button>
          </PanelSectionRow>
        )}
      </PanelSection>
    </div>
  );
}
