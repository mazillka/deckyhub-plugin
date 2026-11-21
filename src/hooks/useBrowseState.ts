import { useEffect, useRef, useState, type RefObject } from "react";
import { restoreBrowse, returned, saveBrowse } from "../browseState";
import type { SortOrder } from "../sorting";
import type { UiStyle, View } from "../types";

// A page's search, filters, sort and Discover's shelves-or-list choice. Back from Steam's
// browser the page is mounted again: it picks up where it was (saveBrowse / restoreBrowse).
export function useBrowseState(view: View, fullPage: View | undefined, uiStyle: UiStyle) {
  const [restored] = useState(() => (fullPage ? restoreBrowse(view) : undefined));
  useEffect(returned, []);
  const [query, setQuery] = useState(restored?.query ?? "");
  const [installedFilter, setInstalledFilter] = useState(restored?.installedFilter ?? "All");
  // "" means every category.
  const [categoryFilter, setCategoryFilter] = useState(restored?.categoryFilter ?? "");
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    (restored?.sortOrder as SortOrder) ?? (uiStyle === "v2" ? "downloads" : "az"),
  );
  // Breaks Sort's ties (many plugins share 0 stars or downloads); A to Z breaks any left.
  const [thenBy, setThenBy] = useState<SortOrder>((restored?.thenBy as SortOrder) ?? "az");
  // Discover opens on its shelves; a category chip or See all browses the whole list, a page at a time.
  const [browsing, setBrowsing] = useState(restored?.browsing ?? false);
  useEffect(() => {
    if (fullPage) saveBrowse(view, { browsing, query, installedFilter, categoryFilter, sortOrder, thenBy });
  }, [browsing, query, installedFilter, categoryFilter, sortOrder, thenBy]);
  // A category chip or a shelf's See all: browse that category, in that sort if the shelf has one.
  const openBrowse = (category: string, sort?: SortOrder) => {
    setCategoryFilter(category);
    if (sort) setSortOrder(sort);
    setBrowsing(true);
  };
  return {
    restored,
    openBrowse,
    query,
    setQuery,
    installedFilter,
    setInstalledFilter,
    categoryFilter,
    setCategoryFilter,
    sortOrder,
    setSortOrder,
    thenBy,
    setThenBy,
    browsing,
    setBrowsing,
  };
}

// The page scrolls inside its own box: keeps its position as it moves, puts it back once the list is up.
export function usePageScroll(
  pageRef: RefObject<HTMLDivElement | null>,
  view: View,
  fullPage: View | undefined,
  loading: boolean,
  restoredScroll: number | undefined,
) {
  useEffect(() => {
    let box: HTMLElement | null = fullPage && !loading ? pageRef.current : null;
    while (box && getComputedStyle(box).overflowY !== "auto") box = box.parentElement;
    if (!box) return;
    const scrollBox = box;
    if (restoredScroll) requestAnimationFrame(() => scrollBox.scrollTo({ top: restoredScroll }));
    const onScroll = () => saveBrowse(view, { scroll: scrollBox.scrollTop });
    scrollBox.addEventListener("scroll", onScroll);
    return () => scrollBox.removeEventListener("scroll", onScroll);
  }, [loading]);
}

// Opening a category, or going back, replaces what had focus: hands it to the Back
// button or the first chip, so the D-pad doesn't start from nowhere.
export function useBrowseFocus(pageRef: RefObject<HTMLDivElement | null>, browsing: boolean) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    requestAnimationFrame(() =>
      pageRef.current
        ?.querySelector<HTMLElement>(browsing ? ".deckyhub-back-button button" : ".deckyhub-category-chips button")
        ?.focus(),
    );
  }, [browsing]);
}
