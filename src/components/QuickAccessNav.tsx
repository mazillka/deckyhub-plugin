import { DialogButtonPrimary as Button, Navigation, PanelSection, PanelSectionRow } from "@decky/ui";
import { FaArrowCircleUp, FaCog, FaCompass, FaSearch } from "react-icons/fa";
import { useT } from "../i18n";
import { compactButtonStyle } from "../utils";
import { Card } from "./Card";
import { CleanupSection } from "./CleanupSection";
import { DeckyHubUpdate } from "./DeckyHubUpdate";

const NAV_LINKS = [["updates", FaArrowCircleUp], ["discover", FaCompass], ["search", FaSearch], ["settings", FaCog]] as const;

export const countBadgeStyle = { minWidth: "1.5em", padding: "0 6px", borderRadius: 999, background: "#f0c33c", color: "#1a1a1a", fontSize: "max(12px, 0.8em)", fontWeight: 700, lineHeight: "1.5em", textAlign: "center" as const };

// The Quick Access panel: DeckyHub's pages (Updates only while there's one, with
// its count; Discover with how many plugins it lists), its own update and Cleanup.
// Troubleshooting and About live in Settings, keeping this panel to quick actions.
export function QuickAccessNav({ updateCount, listedCount }: { updateCount: number; listedCount: number }) {
  const t = useT();
  return (
    <>
      {/* The only untitled card here: Steam pads a PanelSection's bottom but leaves
          its top to the title, so add the same space above the buttons (seen on a Deck). */}
      <Card>
        <div style={{ paddingTop: 26 }}>
          <PanelSection>
            {NAV_LINKS.filter(([page]) => page !== "updates" || updateCount > 0).map(([page, Icon]) => (
              <PanelSectionRow key={page}>
                <Button style={compactButtonStyle} onClick={() => Navigation.Navigate(`/deckyhub/${page}`)}>
                  <Icon /> {t(`nav.${page}`)}
                  {page === "updates" && updateCount > 0 && <span style={countBadgeStyle}>{updateCount}</span>}
                  {page === "discover" && listedCount > 0 && <span aria-hidden className="deckyhub-discover-count" style={{ ...countBadgeStyle, background: "rgba(255, 255, 255, 0.16)", color: "#fff" }}>{listedCount}</span>}
                </Button>
              </PanelSectionRow>
            ))}
          </PanelSection>
        </div>
      </Card>
      <DeckyHubUpdate />
      <CleanupSection />
    </>
  );
}
