export type Layout = "grid" | "list";

const LAYOUT_KEY = "deckyhub-layout";
// Set once the list became the default for everyone: a "grid" chosen before that is dropped one time.
const LIST_DEFAULT_KEY = "deckyhub-layout-list-default";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readLayout(store: Store): Layout {
  try {
    if (store.getItem(LIST_DEFAULT_KEY) === null) {
      store.removeItem(LAYOUT_KEY);
      store.setItem(LIST_DEFAULT_KEY, "1");
    }
    return store.getItem(LAYOUT_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

export function saveLayout(store: Store, layout: Layout) {
  try {
    store.setItem(LAYOUT_KEY, layout);
  } catch {}
}
