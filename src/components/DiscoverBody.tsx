import { Focusable } from "@decky/ui";
import type { ReactNode, RefObject } from "react";
import { useT } from "../i18n";
import type { SortOrder } from "../sorting";
import type { App, View } from "../types";
import { AppList } from "./AppList";
import type { CardLayout } from "./AppCard";
import { DiscoverHome } from "./DiscoverHome";
import { EmptyState } from "./EmptyState";
import { ExpDiscoverHome } from "./experimental/ExpDiscoverHome";
import type { Layout } from "./LayoutToggle";
import { saveBrowse } from "../browseState";

// What a page lists under its header: Discover's shelves, or the list (with Discover's
// filters above it while browsing), and the empty state when nothing matches.
export function DiscoverBody({
  swapRef,
  view,
  experimental,
  home,
  browsing,
  onStopBrowsing,
  total,
  categoryCounts,
  shelf,
  onBrowse,
  layout,
  columns,
  renderCard,
  renderGrid,
  filters,
  shown,
  restoredCount,
  emptyTitle,
  onClear,
}: {
  swapRef: RefObject<HTMLDivElement | null>;
  view: View;
  experimental: boolean;
  home: boolean;
  browsing: boolean;
  onStopBrowsing: () => void;
  total: number;
  categoryCounts: (readonly [string, number])[];
  shelf: (order: SortOrder, size?: number) => App[];
  onBrowse: (category: string, sort?: SortOrder) => void;
  layout: Layout;
  columns: number;
  renderCard: (app: App, layout?: CardLayout) => ReactNode;
  renderGrid: (items: App[]) => ReactNode;
  filters: ReactNode;
  shown: App[];
  restoredCount?: number;
  emptyTitle: string;
  onClear?: () => void;
}) {
  const t = useT();
  return (
    <>
      <div ref={swapRef}>
        {home && experimental ? (
          <ExpDiscoverHome
            total={total}
            categories={categoryCounts}
            shelf={shelf}
            onBrowse={onBrowse}
            renderCard={renderCard}
          />
        ) : home ? (
          <DiscoverHome
            total={total}
            categories={categoryCounts}
            shelf={shelf}
            onBrowse={onBrowse}
            renderGrid={(items) =>
              layout === "list" ? (
                <AppList apps={items} layout="list" columns={1} renderCard={renderCard} />
              ) : (
                renderGrid(items)
              )
            }
          />
        ) : (
          // B goes back to the shelves while browsing; elsewhere it leaves the page as usual.
          <Focusable
            flow-children="down"
            onCancelButton={browsing ? onStopBrowsing : undefined}
            onCancelActionDescription={browsing ? t("nav.discover") : undefined}
          >
            {filters}
            <AppList
              apps={shown}
              layout={layout}
              columns={columns}
              renderCard={renderCard}
              initialCount={restoredCount}
              onCount={(count) => saveBrowse(view, { count })}
            />
          </Focusable>
        )}
      </div>
      {!home && !shown.length && <EmptyState title={emptyTitle} toDiscover={view === "updates"} onClear={onClear} />}
    </>
  );
}
