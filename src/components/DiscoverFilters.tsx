import { Dropdown, Focusable, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { useT } from "../i18n";
import { SORT_ORDERS, type SortOrder } from "../sorting";
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

// Discover's Search, Status, Category, Sort and Then by while browsing. Each Status
// and Category option says how many plugins it would list next to the other filters.
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
  return (
    <Card>
      <PanelSection>
        {/* Search on its own line: beside four menus on a Deck it, and they, got cut off. */}
        <PanelSectionRow>
          <div style={labelStyle}>
            <div style={{ marginBottom: 4 }}>{t("filter.search")}</div>
            <TextField {...({ "aria-label": t("filter.search") } as any)} value={query} bShowClearAction onChange={(event) => onQuery(event.currentTarget.value)} />
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable flow-children="right" style={{ display: "flex", gap: 12 }}>
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
      </PanelSection>
    </Card>
  );
}
