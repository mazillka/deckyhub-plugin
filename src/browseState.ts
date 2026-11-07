import type { View } from "./types";

// Steam's browser re-mounts DeckyHub's page when it closes, which reset Discover to its
// shelves. The page saves its state here as it changes; openExternalWeb() marks a round
// trip, and the next mount of that page picks the state up again. Leaving DeckyHub any
// other way still opens a page fresh.
export type BrowseState = {
  browsing: boolean;
  query: string;
  installedFilter: string;
  categoryFilter: string;
  sortOrder: string;
  thenBy: string;
  // Cards built so far (the list builds a batch at a time) and the page's scroll position.
  count: number;
  scroll: number;
};

const saved: Partial<Record<View, BrowseState>> = {};
let returningUntil = 0;

export const saveBrowse = (view: View, patch: Partial<BrowseState>) => {
  saved[view] = {
    browsing: false,
    query: "",
    installedFilter: "All",
    categoryFilter: "",
    sortOrder: "az",
    thenBy: "az",
    count: 0,
    scroll: 0,
    ...saved[view],
    ...patch,
  };
};

// Called when a page opens in Steam's browser.
export const expectReturn = () => {
  returningUntil = Date.now() + 10 * 60_000;
};
export const returned = () => {
  returningUntil = 0;
};

export const restoreBrowse = (view: View): BrowseState | undefined =>
  Date.now() < returningUntil ? saved[view] : undefined;
