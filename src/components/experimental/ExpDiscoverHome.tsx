import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import type { ReactNode } from "react";
import { useT } from "../../i18n";
import type { SortOrder } from "../../sorting";
import type { App } from "../../types";
import { categoryHue } from "../AppBadges";
import type { CardLayout } from "../AppCard";
import { keepInView } from "../KeepInView";

// No Most popular shelf here: the same few big plugins topped it every time.
const SHELVES = [
  ["recent", "updated"],
  ["new", "added"],
] as const;
// Cards per shelf: they scroll sideways, so a shelf can hold more than a screen's width.
const SHELF_SIZE = 10;

// Experimental: Discover's home as a storefront. Categories as colored tiles in one sideways
// strip, then each shelf as a sideways row of cards ending in See all. Same browsing as DiscoverHome.
export function ExpDiscoverHome({
  total,
  categories,
  shelf,
  onBrowse,
  renderCard,
}: {
  total: number;
  categories: (readonly [string, number])[];
  shelf: (order: SortOrder, size: number) => App[];
  onBrowse: (category: string, sort?: SortOrder) => void;
  renderCard: (app: App, layout?: CardLayout) => ReactNode;
}) {
  const t = useT();
  return (
    <Focusable flow-children="down">
      {/* The category tiles keep deckyhub-category-chips, which Content focuses on the way back from browsing. */}
      <Focusable flow-children="right" className="dh-exp-strip deckyhub-category-chips">
        {[["", total] as const, ...categories].map(([category, count]) => (
          <div
            key={category}
            className="dh-exp-category"
            onFocus={keepInView}
            style={{ ["--hue" as string]: category ? categoryHue(category) : 200 }}
          >
            <Button onClick={() => onBrowse(category)}>
              <strong>{category || t("discover.allPlugins")}</strong>
              <small>{t("discover.pluginCount", { count })}</small>
            </Button>
          </div>
        ))}
      </Focusable>
      {SHELVES.map(([name, order]) => (
        <section key={name} className={`deckyhub-shelf-${name}`}>
          <h3 className="dh-exp-shelf-title">{t(`discover.${name}`)}</h3>
          <Focusable flow-children="down" style={{ display: "grid", gap: 8 }}>
            {shelf(order, SHELF_SIZE).map((app) => (
              <Focusable key={app.id} flow-children="down" onFocus={keepInView}>
                {renderCard(app, "row")}
              </Focusable>
            ))}
            <div className="dh-exp-see-all" onFocus={keepInView}>
              <Button onClick={() => onBrowse("", order)}>{t("discover.seeAll")} ›</Button>
            </div>
          </Focusable>
        </section>
      ))}
    </Focusable>
  );
}
