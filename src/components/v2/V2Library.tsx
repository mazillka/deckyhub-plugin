import { DialogButtonPrimary as Button, Dropdown, Focusable, Spinner, TextField } from "@decky/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FaArrowUp, FaCog, FaExclamationTriangle, FaPlus, FaSync } from "react-icons/fa";
import type { TFunc } from "../../i18n/en";
import { useT } from "../../i18n";
import type { App, View } from "../../types";
import { colors } from "../../styles";
import { SORT_ORDERS, type SortOrder } from "../../sorting";
import { compactNumber, ellipsis, surfaceStyle } from "../../utils";
import { displayVersion } from "../../version";
import { AiBadge, findingsOf, ForkBadge, RustBadge, StoreBadge } from "../AppBadges";
import { AppMonogram } from "../AppIdentity";
import { scanSummary } from "../ScanBadges";
import { authorSearch as authorSearchOf, ownerOf } from "../../author";
import { useCardActions, type AppCardProps } from "../../hooks/useCardActions";
import { EmptyState } from "../EmptyState";
import { keepInView } from "../KeepInView";
import { LIST_BATCH } from "../AppList";
import { HeaderNotices } from "../ContentHeader";
import { Detail, Legend } from "./V2Parts";
import { V2List, V2Toolbar } from "./V2Toolbar";
import { setV2Counts } from "./v2Counts";

const LAZY_AHEAD = 5; // rows before the end of the loaded ones at which the next batch loads

// What stands in for the list while it loads, failed to load or has nothing to show (null: show the list).
function libraryNotice(o: {
  t: TFunc;
  loading: boolean;
  progress: string;
  loadError: string | null | undefined;
  empty: boolean;
  emptyTitle: string;
  toDiscover: boolean;
}): ReactNode {
  if (o.loading)
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: "30vh" }}>
        <Spinner style={{ width: "1.1em" }} /> {o.t("content.loading")}
        {o.progress}
      </div>
    );
  if (o.loadError) return <div style={{ color: colors.danger }}>{o.loadError}</div>;
  if (o.empty) return <EmptyState title={o.emptyTitle} toDiscover={o.toDiscover} />;
  return null;
}

// Experimental V2's page for Updates, Discover and Installed: a search field (and Discover's categories),
// the notices and legend, then the list on the left and the focused plugin's facts and actions on the right.
export function V2Library({
  view,
  apps,
  allApps,
  loading,
  loadError,
  checked,
  updateAllCount,
  updatingAll,
  onUpdateAll,
  query,
  onQuery,
  sortOrder,
  onSortOrder,
  onRefresh,
  category,
  onCategory,
  categories,
  cardProps,
  updateCount,
  installedCount,
  emptyTitle,
}: {
  view: View;
  apps: App[];
  allApps: App[];
  loading: boolean;
  loadError?: string | null;
  checked: number;
  updateAllCount: number;
  updatingAll: boolean;
  onUpdateAll: () => void;
  query: string;
  onQuery: (query: string) => void;
  sortOrder: SortOrder;
  onSortOrder: (order: SortOrder) => void;
  onRefresh: () => void;
  category: string;
  onCategory: (category: string) => void;
  categories: string[];
  cardProps: (app: App) => AppCardProps;
  updateCount: number;
  installedCount: number;
  emptyTitle: string;
}) {
  const t = useT();
  useEffect(() => setV2Counts({ updates: updateCount, installed: installedCount }), [updateCount, installedCount]);
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? apps.filter((app) =>
        `${app.name} ${app.repo} ${app.category} ${app.description ?? ""}`.toLowerCase().includes(needle),
      )
    : apps;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = shown.find((app) => app.id === selectedId) ?? shown[0];
  // Hundreds of rows at once would be slow on a Deck: a batch at a time, the next one loads as focus nears the end.
  const [limit, setLimit] = useState(LIST_BATCH);
  useEffect(() => setLimit(LIST_BATCH), [needle, category, view, sortOrder]);
  // More from this author: the search narrowed to "owner/", which only the start of a repository's name matches.
  const authorSearch = selected ? authorSearchOf(selected) : "";
  const authorCount = selected ? apps.filter((app) => ownerOf(app) === ownerOf(selected)).length : 0;
  // The page lives in Steam's window, not this script's document: look rows up through the page itself.
  const page = useRef<HTMLDivElement>(null);
  const showAuthor = () => {
    onQuery(authorSearch);
    // The pane's button goes with the old list: focus the first row of the new one (after Steam has handed focus back).
    window.setTimeout(() => page.current?.querySelectorAll<HTMLElement>(".deckyhub-v2-row")[0]?.focus(), 400);
  };
  const notice = libraryNotice({
    t,
    loading,
    progress: allApps.length > 0 ? ` ${checked}/${allApps.length}` : "",
    loadError,
    empty: !shown.length,
    emptyTitle,
    toDiscover: view === "updates" && !needle,
  });
  return (
    <div
      ref={page}
      className="deckyhub-v2-page"
      style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0, 1fr)" }}
    >
      <V2Toolbar
        {...{ t, view, query, onQuery, category, onCategory, categories, sortOrder, onSortOrder }}
        {...{ updateAllCount, updatingAll, onUpdateAll, onRefresh }}
      />
      {/* The two notices side by side, as in Experimental, then what the dots mean. */}
      <Focusable
        flow-children="right"
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10, alignItems: "start" }}
      >
        <HeaderNotices />
      </Focusable>
      <Legend t={t} />
      {notice ?? (
        <V2List
          t={t}
          shown={shown.slice(0, limit)}
          selectedId={selected?.id}
          onSelect={(app, index) => {
            setSelectedId(app.id);
            if (index >= limit - LAZY_AHEAD) setLimit(limit + LIST_BATCH);
          }}
          detail={
            selected && (
              <Detail
                key={selected.id}
                props={cardProps(selected)}
                t={t}
                moreFromAuthor={
                  authorCount > 1 && needle !== authorSearch.toLowerCase()
                    ? { count: authorCount, onShow: showAuthor }
                    : undefined
                }
              />
            )
          }
        />
      )}
    </div>
  );
}
