import { useEffect, useRef } from "react";
import { useT } from "../i18n";
import type { View } from "../types";
import { ContentFrame } from "../components/ContentPages";
import { QuickAccessPanel } from "../components/QuickAccessPanel";
import { useSwapAnimation } from "../components/Card";
import { useLayout } from "../components/LayoutToggle";
import { useApps } from "../hooks/useApps";
import { useAppActions } from "../hooks/useAppActions";
import { useBrowseFocus, useBrowseState, usePageScroll } from "../hooks/useBrowseState";
import { useCards } from "../hooks/useCards";
import { useDiscoverView } from "../hooks/useDiscoverView";
import { offerPendingInstalls } from "../components/PendingInstalls";
import { useUiStyle } from "../uiStyle";
import { viewInfo } from "../discover";

// Updates, Installed and Discover as a full page, or DeckyHub's Quick Access tab (no fullPage).
// Owns the page's state and handlers (the hooks); the sections it shows are components.
export function Content({ fullPage }: { fullPage?: View }) {
  const t = useT();
  const view: View = fullPage ?? "updates";
  const data = useApps(view);
  // Quick Access' UI Style: Experimental swaps in its own header, cards and panel.
  const uiStyle = useUiStyle();
  const experimental = uiStyle === "experimental";
  // Opening DeckyHub's Quick Access tab offers the plugins picked in the Desktop Mode installer.
  useEffect(() => {
    if (!fullPage) void offerPendingInstalls(t);
  }, [fullPage]);
  const browse = useBrowseState(view, fullPage, uiStyle);
  const [chosenLayout, setLayout] = useLayout();
  // The Experimental style has no grid: its cards are always rows.
  const layout = experimental ? "list" : chosenLayout;
  const pageRef = useRef<HTMLDivElement>(null);
  // Slides the shelves, category, page, layout, filter or sort in when it changes.
  const { browsing, categoryFilter, installedFilter, sortOrder, thenBy } = browse;
  const swapRef = useSwapAnimation([browsing, layout, categoryFilter, installedFilter, sortOrder, thenBy]);
  usePageScroll(pageRef, view, fullPage, data.loading, browse.restored?.scroll);
  useBrowseFocus(pageRef, browsing);
  const actions = useAppActions(t, data.apps, data.setApps, data.setRepoPreferences);
  const discover = useDiscoverView(view, data.apps, browse, data.hiddenButtons);
  const cards = useCards({
    view,
    fullPage,
    experimental,
    layout,
    apps: data.apps,
    repoPreferences: data.repoPreferences,
    hiddenButtons: data.hiddenButtons,
    columns: data.columnsPerRow,
    browse,
    actions,
    reload: () => void data.load(),
  });

  if (!fullPage)
    return (
      <QuickAccessPanel
        apps={data.apps}
        experimental={experimental}
        listedCount={data.listedCount}
        installedCount={data.installedCount}
      />
    );
  const ctx = {
    view,
    experimental,
    info: viewInfo(t, view),
    data,
    browse,
    discover,
    actions,
    cards,
    layout,
    setLayout,
    swapRef,
  };
  return <ContentFrame ctx={ctx} v2={uiStyle === "v2"} pageRef={pageRef} />;
}
