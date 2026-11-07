import { DialogButtonPrimary as Button, Dropdown, Focusable, TextField } from "@decky/ui";
import type { ComponentProps } from "react";
import { FaSearch } from "react-icons/fa";
import { useT } from "../../i18n";
import { SORT_ORDERS } from "../../sorting";
import type { DiscoverFilters } from "../DiscoverFilters";

const STATUSES = [
  ["All", "filter.all"],
  ["Installed", "filter.installed"],
  ["Not Installed", "filter.notInstalled"],
] as const;

function Menu<T>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { label: string; data: T }[];
  selected: T;
  onChange: (value: T) => void;
}) {
  return (
    <label className="dh-exp-field">
      <span>{label}</span>
      <Dropdown
        {...({ "aria-label": label, style: { width: "100%" } } as object)}
        menuLabel={label}
        rgOptions={options}
        selectedOption={selected}
        onChange={({ data }) => onChange(data)}
      />
    </label>
  );
}

// Experimental: Discover's browsing filters always in view as one bar. Search with Sort
// and Then by beside it, then Status as a segmented switch (with counts) and Category.
export function ExpDiscoverFilters({
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
}: ComponentProps<typeof DiscoverFilters>) {
  const t = useT();
  const sorts = SORT_ORDERS.map((order) => ({ label: t(`sort.${order}`), data: order }));
  return (
    <Focusable flow-children="down" className="dh-exp-filters">
      <Focusable flow-children="right" className="dh-exp-filter-row">
        <div className="dh-exp-search">
          <FaSearch aria-hidden />
          <TextField
            {...({ "aria-label": t("filter.search") } as object)}
            placeholder={t("filter.search")}
            value={query}
            bShowClearAction
            onChange={(event) => onQuery(event.currentTarget.value)}
          />
        </div>
        <Menu label={t("filter.sort")} options={sorts} selected={sortOrder} onChange={onSortOrder} />
        <Menu label={t("filter.thenBy")} options={sorts} selected={thenBy} onChange={onThenBy} />
      </Focusable>
      <Focusable flow-children="right" className="dh-exp-filter-row">
        <Focusable flow-children="right" className="dh-exp-segmented" aria-label={t("filter.status")}>
          {STATUSES.map(([value, label]) => (
            <div key={value} className={installed === value ? "is-active" : undefined}>
              <Button onClick={() => onInstalled(value)}>
                {t(label)} <small>{countWith(value, category)}</small>
              </Button>
            </div>
          ))}
        </Focusable>
        <Menu
          label={t("filter.category")}
          options={[
            { label: `${t("filter.all")} (${countWith(installed, "")})`, data: "" },
            ...categories.map((name) => ({ label: `${name} (${countWith(installed, name)})`, data: name })),
          ]}
          selected={category}
          onChange={onCategory}
        />
      </Focusable>
    </Focusable>
  );
}
