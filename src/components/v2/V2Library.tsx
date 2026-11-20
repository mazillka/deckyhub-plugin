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
import { setV2Counts } from "./v2Counts";

const LAZY_AHEAD = 5; // rows before the end of the loaded ones at which the next batch loads

// The pane's height: the screen less Steam's 64px header and the 8px gaps above (its sticky top) and below it.
const PANE_HEIGHT = "calc(100vh - 80px)";

// The scan's own state is the dot (and a line in the pane): listing "Not fully scanned" as a finding too would put a
// triangle on every plugin still waiting for VirusTotal or MetaDefender.
const notTheScanState = (finding: { label: string }) => finding.label !== "appcard.scan.partial";

type Scan = "clean" | "partial" | "infected" | "none";

// The scan badge's verdict, as the dot beside a plugin: the same four states and words as its
// badge (appcard.scan.*, scan.notScanned), never a score of its own.
const scanOf = (app: App): Scan =>
  app.scan && !app.scan.unverifiedMatch ? scanSummary(app.scan, app.virusTotal, app.metaDefender).kind : "none";
const DOT: Record<Scan, string> = {
  clean: colors.success,
  partial: colors.caution,
  infected: colors.dangerSoft,
  none: colors.muted,
};
// A dot with a label is the scan state itself (the row's); without one it only decorates a line that says it in words.
const Dot = ({ color, label }: { color: string; label?: string }) => (
  <span
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }}
  />
);

const scanLabel = (scan: Scan, t: TFunc) => (scan === "none" ? t("scan.notScanned") : t(`appcard.scan.${scan}`));

// What the dots and the triangle mean, in the words the badges already use.
export function Legend({ t }: { t: TFunc }) {
  const items: [Scan, string][] = [
    ["clean", t("appcard.scan.clean")],
    ["partial", t("appcard.scan.partial")],
    ["infected", t("appcard.scan.infected")],
    ["none", t("scan.notScanned").split(".")[0]],
  ];
  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: "max(12px, 0.8em)", color: colors.subtle }}
    >
      {items.map(([kind, label]) => (
        <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Dot color={DOT[kind]} /> {label}
        </span>
      ))}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <FaExclamationTriangle color={colors.caution} /> {t("risk.title")}
      </span>
    </div>
  );
}

function Row({ app, selected, onSelect, t }: { app: App; selected: boolean; onSelect: () => void; t: TFunc }) {
  const findings = findingsOf(app).findings.filter(notTheScanState);
  return (
    <Focusable
      className="deckyhub-v2-row deckyhub-focus-ring"
      onFocus={onSelect}
      onActivate={onSelect}
      style={{
        ...surfaceStyle,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        // The plugin the pane shows: a tint only, so it never reads as the focus ring (that is the control's own).
        background: selected ? "rgba(255, 255, 255, 0.07)" : undefined,
      }}
    >
      <AppMonogram app={app} style={{ width: 34, height: 34, borderRadius: 8, fontSize: 13 }} />
      <div style={{ flex: 1, minWidth: 0, display: "grid" }}>
        <strong style={ellipsis}>{app.name}</strong>
        <small style={{ color: colors.muted, ...ellipsis }}>
          {t("appcard.byAuthor", { author: ownerOf(app) })} · {app.description || t("repos.noDescription")}
        </small>
      </div>
      {findings.length > 0 && <FaExclamationTriangle aria-label={t("risk.title")} color={colors.caution} />}
      {!app.store && <Dot color={DOT[scanOf(app)]} label={scanLabel(scanOf(app), t)} />}
    </Focusable>
  );
}

// Everything the checks say about the focused plugin, as sentences with the dot its row shows,
// then its tags and the main actions: the same facts as the Manage window's checks card.
function Detail({
  props,
  t,
  moreFromAuthor,
}: {
  props: AppCardProps;
  t: TFunc;
  moreFromAuthor?: { count: number; onShow: () => void };
}) {
  const { app } = props;
  const { install, isUpdate, quickAction, quickLabel, deckyInstalling, quickButtonProps, openManage } =
    useCardActions(props);
  const findings = findingsOf(app).findings.filter(notTheScanState);
  const scan = scanOf(app);
  const version = app.installedVersion ?? app.latestVersion;
  return (
    <Focusable
      flow-children="down"
      style={{
        ...surfaceStyle,
        display: "grid",
        gap: 10,
        padding: 14,
        // The last block (the facts) stretches to the pane's full height: Steam moves Right to a control level with the
        // focused row, so a short pane left the rows below its end with nothing to reach.
        gridTemplateRows: `${"auto ".repeat(moreFromAuthor ? 4 : 3)}1fr`,
        minHeight: PANE_HEIGHT,
        // Stays beside the list while it scrolls, instead of staying at the top with the first rows.
        position: "sticky",
        top: 8,
        maxHeight: PANE_HEIGHT,
        overflowY: "auto",
      }}
    >
      <Focusable onActivate={() => {}} onFocus={keepInView} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <AppMonogram app={app} style={{ width: 48, height: 48, borderRadius: 10, fontSize: 18 }} />
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: "1.15em" }}>{app.name}</strong>
          <div style={{ color: colors.subtle, fontSize: "max(12px, 0.85em)" }}>
            {[
              version && displayVersion(version),
              app.stats?.downloads !== undefined && `↓ ${compactNumber(app.stats.downloads)}`,
              app.stats?.stars != null && `★ ${compactNumber(app.stats.stars)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </Focusable>
      {/* The actions first: on a Deck the pane is cut off below the facts. */}
      <Focusable flow-children="right" style={{ display: "flex", gap: 8 }}>
        {install && quickAction && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <Button aria-label={quickLabel} {...quickButtonProps}>
              {isUpdate ? <FaArrowUp /> : <FaPlus />}{" "}
              <span style={ellipsis}>{deckyInstalling ? t("status.installing") : quickLabel}</span>
            </Button>
          </div>
        )}
        <div style={{ flex: install && quickAction ? "0 0 140px" : 1 }}>
          <Button onClick={openManage}>
            <FaCog /> {t("appcard.manage")}
          </Button>
        </div>
      </Focusable>
      {moreFromAuthor && (
        <Button onClick={moreFromAuthor.onShow}>
          {t("details.moreFromAuthor", { author: ownerOf(app), count: moreFromAuthor.count })}
        </Button>
      )}
      <Focusable onActivate={() => {}} onFocus={keepInView} style={{ overflowWrap: "anywhere" }}>
        {app.description || t("repos.noDescription")}
      </Focusable>
      <Focusable
        onActivate={() => {}}
        onFocus={keepInView}
        className="deckyhub-v2-facts"
        // alignContent: the facts block is stretched to the pane's height; without it the grid's rows stretch too.
        style={{ display: "grid", gap: 6, alignContent: "start", fontSize: "max(13px, 0.9em)" }}
      >
        {app.store ? (
          <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <Dot color={colors.caution} /> {t("release.inStore")}
          </span>
        ) : (
          <>
            <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <Dot color={DOT[scan]} />
              <span>{scanLabel(scan, t)}</span>
            </span>
            {findings.map((finding) => (
              <span key={finding.label} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <FaExclamationTriangle color={finding.tone === "danger" ? colors.dangerSoft : colors.caution} />
                <span>
                  <strong>{t(finding.label as Parameters<TFunc>[0])}</strong>
                  {finding.hint && <> — {t(finding.hint as Parameters<TFunc>[0])}</>}
                </span>
              </span>
            ))}
            {app.identityUnverified && <span style={{ color: colors.warning }}>{t("appcard.identityUnverified")}</span>}
          </>
        )}
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 6 }}>
          {app.stats?.fork && <ForkBadge t={t} repo={app.stats.fork} />}
          {app.stats?.ai?.length ? <AiBadge t={t} files={app.stats.ai} /> : null}
          {app.stats?.rust && <RustBadge t={t} />}
          {app.stats?.store && <StoreBadge t={t} downloads={app.stats.store.downloads} />}
        </span>
      </Focusable>
    </Focusable>
  );
}

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
      {/* One row: search, Discover's category and sort menus, Refresh. */}
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
          <Button
            aria-label={t("content.refresh")}
            onClick={onRefresh}
            style={{ padding: 0, minHeight: 40, height: 40 }}
          >
            <FaSync />
          </Button>
        </div>
      </Focusable>
      {/* The disclaimer and what the badges mean are in the info window (the button beside the tabs). */}
      {notice ?? (
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
            {shown.slice(0, limit).map((app, index) => (
              <Row
                key={app.id}
                app={app}
                t={t}
                selected={app.id === selected?.id}
                onSelect={() => {
                  setSelectedId(app.id);
                  if (index >= limit - LAZY_AHEAD) setLimit(limit + LIST_BATCH);
                }}
              />
            ))}
          </Focusable>
          {selected && (
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
          )}
        </Focusable>
      )}
    </div>
  );
}
