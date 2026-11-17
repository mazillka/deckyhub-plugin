import { DialogButtonPrimary as Button, Dropdown, Focusable, Spinner, TextField } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaArrowUp, FaCog, FaExclamationTriangle, FaPlus, FaSync } from "react-icons/fa";
import type { TFunc } from "../../i18n/en";
import { useT } from "../../i18n";
import type { App, View } from "../../types";
import { colors } from "../../styles";
import { SORT_ORDERS, type SortOrder } from "../../sorting";
import { compactNumber, ellipsis, surfaceStyle } from "../../utils";
import { displayVersion } from "../../version";
import { AiBadge, AppMonogram, findingsOf, ForkBadge, RustBadge, scanSummary, StoreBadge } from "../AppBadges";
import { useCardActions, type AppCardProps } from "../AppCard";
import { HeaderNotices } from "../ContentHeader";
import { EmptyState } from "../EmptyState";
import { keepInView } from "../KeepInView";
import { setV2Counts } from "./v2Counts";

// Rows shown before More.
const PAGE = 30;

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
const Dot = ({ color }: { color: string }) => (
  <span
    aria-hidden
    style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }}
  />
);

// What the dots and the triangle mean, in the words the badges already use.
function Legend({ t }: { t: TFunc }) {
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
        <small style={{ color: colors.muted, ...ellipsis }}>{app.description || t("repos.noDescription")}</small>
      </div>
      {findings.length > 0 && <FaExclamationTriangle aria-label={t("risk.title")} color={colors.caution} />}
      {!app.store && <Dot color={DOT[scanOf(app)]} />}
    </Focusable>
  );
}

// Everything the checks say about the focused plugin, as sentences with the dot its row shows,
// then its tags and the main actions: the same facts as the Manage window's checks card.
function Detail({ props, t }: { props: AppCardProps; t: TFunc }) {
  const { app } = props;
  const { install, isUpdate, quickAction, quickLabel, deckyInstalling, quickButtonProps, openManage } =
    useCardActions(props);
  const findings = findingsOf(app).findings.filter(notTheScanState);
  const scan = scanOf(app);
  const version = app.installedVersion ?? app.latestVersion;
  return (
    <Focusable
      flow-children="down"
      style={{ ...surfaceStyle, display: "grid", gap: 10, padding: 14, alignContent: "start" }}
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
      <Focusable onActivate={() => {}} onFocus={keepInView} style={{ overflowWrap: "anywhere" }}>
        {app.description || t("repos.noDescription")}
      </Focusable>
      <Focusable
        onActivate={() => {}}
        onFocus={keepInView}
        className="deckyhub-v2-facts"
        style={{ display: "grid", gap: 6, fontSize: "max(13px, 0.9em)" }}
      >
        {app.store ? (
          <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <Dot color={colors.caution} /> {t("release.inStore")}
          </span>
        ) : (
          <>
            <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <Dot color={DOT[scan]} />
              <span>{scan === "none" ? t("scan.notScanned") : t(`appcard.scan.${scan}`)}</span>
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
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {app.stats?.fork && <ForkBadge t={t} repo={app.stats.fork} />}
          {app.stats?.ai?.length ? <AiBadge t={t} files={app.stats.ai} /> : null}
          {app.stats?.rust && <RustBadge t={t} />}
          {app.stats?.store && <StoreBadge t={t} downloads={app.stats.store.downloads} />}
        </span>
      </Focusable>
    </Focusable>
  );
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
  // Hundreds of rows at once would be slow on a Deck: a batch at a time, More for the next.
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [needle, category, view]);
  return (
    <div className="deckyhub-v2-page" style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* One row: search, Discover's category and sort menus, Refresh. */}
      <Focusable flow-children="right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField
            aria-label={t("filter.search")}
            placeholder={t("filter.search")}
            value={query}
            bShowClearAction
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
        <div style={{ flex: "0 0 56px" }}>
          <Button aria-label={t("content.refresh")} onClick={onRefresh} style={{ padding: 0, minHeight: 52 }}>
            <FaSync />
          </Button>
        </div>
      </Focusable>
      {/* The disclaimer and the badge notice side by side, one line each. One group for the D-pad (Down leaves it),
          with the legend of the dots inside the badge notice. */}
      <Focusable
        flow-children="right"
        style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}
      >
        <HeaderNotices extra={<Legend t={t} />} />
      </Focusable>
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: "30vh" }}>
          <Spinner style={{ width: "1.1em" }} /> {t("content.loading")}
          {allApps.length > 0 && ` ${checked}/${allApps.length}`}
        </div>
      ) : loadError ? (
        <div style={{ color: colors.danger }}>{loadError}</div>
      ) : !shown.length ? (
        <EmptyState title={emptyTitle} toDiscover={view === "updates" && !needle} />
      ) : (
        <Focusable
          flow-children="right"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 5fr) minmax(0, 6fr)",
            gap: 12,
            alignItems: "start",
          }}
        >
          <Focusable flow-children="down" style={{ display: "grid", gap: 6 }}>
            {shown.slice(0, limit).map((app) => (
              <Row
                key={app.id}
                app={app}
                t={t}
                selected={app.id === selected?.id}
                onSelect={() => setSelectedId(app.id)}
              />
            ))}
            {shown.length > limit && (
              <Button onClick={() => setLimit(limit + PAGE)}>
                {t("notice.more")} ({shown.length - limit})
              </Button>
            )}
          </Focusable>
          {selected && <Detail key={selected.id} props={cardProps(selected)} t={t} />}
        </Focusable>
      )}
    </div>
  );
}
