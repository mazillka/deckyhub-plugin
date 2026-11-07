import { DialogButtonPrimary as Button, Focusable, TextField } from "@decky/ui";
import { FaSearch, FaTimes } from "react-icons/fa";
import { useT } from "../../i18n";
import { keepInView } from "../KeepInView";
import { LayoutToggle, type Layout } from "../LayoutToggle";

// Experimental: Search's title and its field as one banner, the field large in the middle.
export function ExpSearchBar({
  query,
  onQuery,
  searching,
  onSearch,
  onClear,
  layout,
  onLayout,
  error,
}: {
  query: string;
  onQuery: (query: string) => void;
  searching: boolean;
  onSearch: () => void;
  onClear: () => void;
  layout: Layout;
  onLayout: (layout: Layout) => void;
  error?: string | null;
}) {
  const t = useT();
  return (
    <Focusable flow-children="down" onFocus={keepInView} className="dh-exp-hero dh-exp-search-hero">
      <h2 className="dh-exp-gradient-text">{t("view.searchTitle")}</h2>
      <p>{t("view.searchDescription")}</p>
      <Focusable flow-children="right" className="dh-exp-filter-row" style={{ marginTop: 14 }}>
        <div className="dh-exp-search dh-exp-search-big">
          <FaSearch aria-hidden />
          {/* Enter on Steam's keyboard searches, so there's no trip over to the Search button. */}
          <TextField
            aria-label={t("repos.searchGithub")}
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(event) => onQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !searching) onSearch();
            }}
          />
        </div>
        <div className="dh-exp-wide" style={{ flex: "0 0 170px" }}>
          <Button onClick={onSearch} disabled={searching}>
            <FaSearch /> {searching ? t("repos.searching") : t("filter.search")}
          </Button>
        </div>
        <div style={{ flex: "0 0 56px" }}>
          <Button aria-label={t("repos.clear")} onClick={onClear}>
            <FaTimes />
          </Button>
        </div>
        <div style={{ flex: "0 0 120px" }}>
          <LayoutToggle layout={layout} onChange={onLayout} />
        </div>
      </Focusable>
      {error && <small style={{ color: "#ff6b6b" }}>{error}</small>}
    </Focusable>
  );
}
