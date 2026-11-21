import { DialogButtonPrimary as Button, Dropdown, Focusable, TextField } from "@decky/ui";
import type { ReactNode } from "react";
import { FaArrowUp, FaSync } from "react-icons/fa";
import type { TFunc } from "../../i18n/en";
import { SORT_ORDERS, type SortOrder } from "../../sorting";
import type { App, View } from "../../types";
import { Row } from "./V2Parts";

// One row: search, Discover's category and sort menus, Update all, Refresh.
export function V2Toolbar({
  t,
  view,
  query,
  onQuery,
  category,
  onCategory,
  categories,
  sortOrder,
  onSortOrder,
  updateAllCount,
  updatingAll,
  onUpdateAll,
  onRefresh,
}: {
  t: TFunc;
  view: View;
  query: string;
  onQuery: (query: string) => void;
  category: string;
  onCategory: (category: string) => void;
  categories: string[];
  sortOrder: SortOrder;
  onSortOrder: (order: SortOrder) => void;
  updateAllCount: number;
  updatingAll: boolean;
  onUpdateAll: () => void;
  onRefresh: () => void;
}) {
  return (
    <Focusable flow-children="right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TextField
          aria-label={t("filter.search")}
          placeholder={t("filter.search")}
          value={query}
          onChange={(event) => onQuery(event.currentTarget.value)}
        />
      </div>
      {view === "discover" && categories.length > 0 && (
        <div style={{ flex: "0 0 190px", minWidth: 0 }}>
          <Dropdown
            rgOptions={[
              { label: t("discover.allPlugins"), data: "" },
              ...categories.map((name) => ({ label: name, data: name })),
            ]}
            selectedOption={category}
            onChange={({ data }) => onCategory(String(data))}
          />
        </div>
      )}
      {view === "discover" && (
        <div style={{ flex: "0 0 200px", minWidth: 0 }}>
          <Dropdown
            rgOptions={SORT_ORDERS.map((order) => ({ label: t(`sort.${order}`), data: order }))}
            selectedOption={sortOrder}
            onChange={({ data }) => onSortOrder(data as SortOrder)}
          />
        </div>
      )}
      {view === "updates" && updateAllCount > 1 && (
        <div style={{ flex: "0 0 auto" }}>
          <Button disabled={updatingAll} onClick={onUpdateAll}>
            <FaArrowUp /> {t("content.updateAll", { count: updateAllCount })}
          </Button>
        </div>
      )}
      {/* As tall as the search field beside it. */}
      <div style={{ flex: "0 0 44px" }}>
        <Button aria-label={t("content.refresh")} onClick={onRefresh} style={{ padding: 0, minHeight: 40, height: 40 }}>
          <FaSync />
        </Button>
      </div>
    </Focusable>
  );
}

// The list on the left and the focused plugin's pane on the right.
export function V2List({
  t,
  shown,
  selectedId,
  onSelect,
  detail,
}: {
  t: TFunc;
  shown: App[];
  selectedId?: string;
  onSelect: (app: App, index: number) => void;
  detail: ReactNode;
}) {
  return (
    <Focusable
      flow-children="right"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 5fr) minmax(0, 6fr)",
        gap: 12,
        alignItems: "start",
        // The page's 96px bottom padding would end the pane's travel above the screen's bottom edge (it would slide under
        // the header): the list keeps that room itself, so the pane's range reaches the bottom like its height does.
        marginBottom: -88,
      }}
    >
      <Focusable flow-children="down" style={{ display: "grid", gap: 6, paddingBottom: 88 }}>
        {shown.map((app, index) => (
          <Row key={app.id} app={app} t={t} selected={app.id === selectedId} onSelect={() => onSelect(app, index)} />
        ))}
      </Focusable>
      {detail}
    </Focusable>
  );
}
