import { DialogButtonPrimary as Button, Focusable, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { FaSearch } from "react-icons/fa";
import { useT } from "../i18n";
import { compactButtonStyle } from "../utils";
import { Card } from "./Card";
import { LayoutToggle, type Layout } from "./LayoutToggle";

// No bottom margin, so the buttons line up with the search field beside them.
const rowButtonStyle = { ...compactButtonStyle, marginBottom: 0 };

// The Default style's search card: the field, the Search button and (Default only) the Grid / List toggle.
export function SearchBox({
  query,
  onQuery,
  searching,
  onSearch,
  error,
  layout,
  onLayout,
}: {
  query: string;
  onQuery: (query: string) => void;
  searching: boolean;
  onSearch: () => void;
  error: string | null;
  // Absent: the style lists results only, so no toggle.
  layout?: Layout;
  onLayout: (layout: Layout) => void;
}) {
  const t = useT();
  return (
    <Card>
      {/* The label is the section title rather than TextField's own, so the field and
        buttons share one centre line and the card is padded evenly top and bottom
        (Steam pads an untitled section's bottom only). */}
      <PanelSection title={t("repos.searchGithub")}>
        <PanelSectionRow>
          <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Enter on Steam's keyboard searches, so there's no trip over to the Search button. */}
              <TextField
                aria-label={t("repos.searchGithub")}
                placeholder={t("search.placeholder")}
                value={query}
                onChange={(event) => onQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !searching) onSearch();
                }}
              />
            </div>
            <div style={{ flex: "0 0 160px" }}>
              <Button style={rowButtonStyle} onClick={onSearch} disabled={searching}>
                <FaSearch /> {searching ? t("repos.searching") : t("filter.search")}
              </Button>
            </div>
            {layout && (
              <div style={{ flex: "0 0 120px" }}>
                <LayoutToggle layout={layout} onChange={onLayout} />
              </div>
            )}
          </Focusable>
        </PanelSectionRow>
        {error && <PanelSectionRow>{error}</PanelSectionRow>}
      </PanelSection>
    </Card>
  );
}
