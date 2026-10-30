import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import type { ReactNode } from "react";
import { useT } from "../i18n";
import type { SortOrder } from "../sorting";
import type { App } from "../types";
import { ellipsis } from "../styles";
import { compactButtonStyle } from "../utils";
import { FocusableGrid } from "./FocusableGrid";
import { keepInView } from "./KeepInView";

// Discover's home shelves, each the top of the list in one order, with See all for the rest.
export const SHELVES = [["popular", "downloads"], ["recent", "updated"], ["new", "added"]] as const;

// One line each, all the same height: a long name gets "…", never the count (seen on a Deck).
const chipStyle = { ...compactButtonStyle, marginBottom: 0, padding: "4px 8px", borderRadius: 999, display: "flex", justifyContent: "center", gap: "0.3em", whiteSpace: "nowrap" as const };
// Category chips per row. Rows are explicit, like FocusableGrid's: Steam's D-pad can't move down a wrapped row.
const CHIPS_PER_ROW = 5;

// Category chips with counts (biggest first), then the shelves.
export function DiscoverHome({ total, categories, shelf, onBrowse, renderGrid }: { total: number; categories: (readonly [string, number])[]; shelf: (order: SortOrder) => App[]; onBrowse: (category: string, sort?: SortOrder) => void; renderGrid: (apps: App[]) => ReactNode }) {
  const t = useT();
  return (
    <>
      <div className="deckyhub-category-chips">
        <FocusableGrid items={[["", total] as const, ...categories]} columns={CHIPS_PER_ROW} keyFor={([category]) => category}>
          {([category, count]) => (
            <Button style={chipStyle} onClick={() => onBrowse(category)}>
              <span style={ellipsis}>{category || t("discover.allPlugins")}</span> <span style={{ opacity: 0.7, flexShrink: 0 }}>{count}</span>
            </Button>
          )}
        </FocusableGrid>
      </div>
      {SHELVES.map(([name, order]) => (
        <section key={name} className={`deckyhub-shelf-${name}`}>
          <Focusable flow-children="right" onFocus={keepInView} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h3 style={{ margin: 0, flex: 1, color: "#fff", fontSize: "1.2em" }}>{t(`discover.${name}`)}</h3>
            <div style={{ flex: "0 0 150px" }}>
              <Button style={{ ...compactButtonStyle, marginBottom: 0 }} onClick={() => onBrowse("", order)}>
                {t("discover.seeAll")} ›
              </Button>
            </div>
          </Focusable>
          {renderGrid(shelf(order))}
        </section>
      ))}
    </>
  );
}
