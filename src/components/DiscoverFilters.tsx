import { DialogButtonPrimary as Button, Dropdown, Focusable, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { useState } from "react";
import { FaFilter } from "react-icons/fa";
import { useT } from "../i18n";
import { SORT_ORDERS, type SortOrder } from "../sorting";
import { compactButtonStyle } from "../utils";
import { Card } from "./Card";

const labelStyle = { fontSize: "max(12px, 0.85em)" };

// One labelled menu of the filter row. Own label instead of the control's, which
// Steam renders uppercase and padded, out of line with its neighbours.
function Menu<T>({ label, options, selected, onChange }: { label: string; options: { label: string; data: T }[]; selected: T; onChange: (value: T) => void }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0 }}>
      <div style={labelStyle}>
        <div style={{ marginBottom: 4 }}>{label}</div>
        <Dropdown {...({ "aria-label": label, style: { width: "100%" } } as any)} menuLabel={label} rgOptions={options} selectedOption={selected} onChange={({ data }) => onChange(data)} />
      </div>
    </div>
  );
}

// Discover's Search while browsing, with Status, Category, Sort and Then by behind
// a Filters button (it counts the ones narrowing the list), so the first plugins
// show above the fold. Each Status and Category option says how many it would list.
export function DiscoverFilters({
  query,
  onQuery,
  installed,
  onInstalled,
  category,
  onCategory,
  categories,
  countWith,
  sortOrder,
  onSortOrder,
  thenBy,
  onThenBy,
}: {
  query: string;
  onQuery: (query: string) => void;
  installed: string;
  onInstalled: (installed: string) => void;
  category: string;
  onCategory: (category: string) => void;
  categories: string[];
  countWith: (installed: string, category: string) => number;
  sortOrder: SortOrder;
  onSortOrder: (order: SortOrder) => void;
  thenBy: SortOrder;
  onThenBy: (order: SortOrder) => void;
}) {
  const t = useT();
  const withCount = (label: string, count: number) => `${label} (${count})`;
  const sorts = SORT_ORDERS.map((order) => ({ label: t(`sort.${order}`), data: order }));
  const [open, setOpen] = useState(false);
  const active = Number(installed !== "All") + Number(category !== "");
  return (
    <Card>
      <PanelSection>
        <PanelSectionRow>
          <Focusable flow-children="right" style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
            <div style={{ ...labelStyle, flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 4 }}>{t("filter.search")}</div>
              <TextField {...({ "aria-label": t("filter.search") } as any)} value={query} bShowClearAction onChange={(event) => onQuery(event.currentTarget.value)} />
            </div>
            <div style={{ flex: "0 0 180px" }}>
              <Button style={{ ...compactButtonStyle, marginBottom: 0 }} {...({ "aria-expanded": open } as object)} onClick={() => setOpen(!open)}>
                <FaFilter /> {active ? t("filter.filtersActive", { count: active }) : t("filter.filters")}
              </Button>
            </div>
          </Focusable>
        </PanelSectionRow>
        {open && (
        <PanelSectionRow>
          <Focusable flow-children="right" style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <Menu
              label={t("filter.status")}
              options={[
                { label: withCount(t("filter.all"), countWith("All", category)), data: "All" },
                { label: withCount(t("filter.installed"), countWith("Installed", category)), data: "Installed" },
                { label: withCount(t("filter.notInstalled"), countWith("Not Installed", category)), data: "Not Installed" },
              ]}
              selected={installed}
              onChange={onInstalled}
            />
            <Menu
              label={t("filter.category")}
              options={[{ label: withCount(t("filter.all"), countWith(installed, "")), data: "" }, ...categories.map((name) => ({ label: withCount(name, countWith(installed, name)), data: name }))]}
              selected={category}
              onChange={onCategory}
            />
            <Menu label={t("filter.sort")} options={sorts} selected={sortOrder} onChange={onSortOrder} />
            <Menu label={t("filter.thenBy")} options={sorts} selected={thenBy} onChange={onThenBy} />
          </Focusable>
        </PanelSectionRow>
        )}
      </PanelSection>
    </Card>
  );
}
