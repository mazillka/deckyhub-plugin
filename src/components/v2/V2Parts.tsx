import { storeHomeNote } from "../AppCardParts";
import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import { FaArrowUp, FaCog, FaExclamationTriangle, FaPlus } from "react-icons/fa";
import type { TFunc } from "../../i18n/en";
import type { App } from "../../types";
import { colors } from "../../styles";
import { compactNumber, ellipsis, surfaceStyle } from "../../utils";
import { displayVersion } from "../../version";
import { AiBadge, findingsOf, ForkBadge, RustBadge, StoreBadge } from "../AppBadges";
import { AppMonogram } from "../AppIdentity";
import { scanSummary } from "../ScanBadges";
import { ownerOf, titleOf } from "../../author";
import { useCardActions, type AppCardProps } from "../../hooks/useCardActions";
import { keepInView } from "../KeepInView";

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

export function Row({ app, selected, onSelect, t }: { app: App; selected: boolean; onSelect: () => void; t: TFunc }) {
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
        <strong style={ellipsis}>{titleOf(app, t)}</strong>
        <small style={{ color: colors.muted, ...ellipsis }}>
          {t("appcard.byAuthor", { author: ownerOf(app) })} · {app.description || t("repos.noDescription")}
        </small>
      </div>
      {findings.length > 0 && <FaExclamationTriangle aria-label={t("risk.title")} color={colors.caution} />}
      {!app.store && <Dot color={DOT[scanOf(app)]} label={scanLabel(scanOf(app), t)} />}
    </Focusable>
  );
}

const storeArrow = (app: App) =>
  app.storeLatest && app.updateAvailable ? ` → ${displayVersion(app.storeLatest)}` : "";

// The plugin's name, version and counts.
function DetailHeader({ app }: { app: App }) {
  const version = app.installedVersion ?? app.latestVersion;
  return (
    <Focusable onActivate={() => {}} onFocus={keepInView} style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <AppMonogram app={app} style={{ width: 48, height: 48, borderRadius: 10, fontSize: 18 }} />
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontSize: "1.15em" }}>{app.name}</strong>
        <div style={{ color: colors.subtle, fontSize: "max(12px, 0.85em)" }}>
          {[
            version && displayVersion(version) + storeArrow(app),
            app.stats?.downloads !== undefined && `↓ ${compactNumber(app.stats.downloads)}`,
            app.stats?.stars != null && `★ ${compactNumber(app.stats.stars)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
    </Focusable>
  );
}

// Install / Update and Manage. The actions come first: on a Deck the pane is cut off below the facts.
function DetailActions({ t, a }: { t: TFunc; a: ReturnType<typeof useCardActions> }) {
  const { install, isUpdate, quickAction, quickLabel, deckyInstalling, quickButtonProps, openManage } = a;
  return (
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
  );
}

const factRow = { display: "flex", gap: 8, alignItems: "baseline" } as const;

// The scan state and what the checks found, as sentences.
function ScanFacts({ app, t }: { app: App; t: TFunc }) {
  if (app.store)
    return (
      <span style={factRow}>
        <Dot color={colors.caution} /> {t("release.inStore")}
      </span>
    );
  const scan = scanOf(app);
  return (
    <>
      <span style={factRow}>
        <Dot color={DOT[scan]} />
        <span>{scanLabel(scan, t)}</span>
      </span>
      {app.storeLatest && storeHomeNote(t, app) && (
        <span style={{ color: colors.caution }}>{storeHomeNote(t, app)}</span>
      )}
      {findingsOf(app)
        .findings.filter(notTheScanState)
        .map((finding) => (
          <span key={finding.label} style={factRow}>
            <FaExclamationTriangle color={finding.tone === "danger" ? colors.dangerSoft : colors.caution} />
            <span>
              <strong>{t(finding.label as Parameters<TFunc>[0])}</strong>
              {finding.hint && <> — {t(finding.hint as Parameters<TFunc>[0])}</>}
            </span>
          </span>
        ))}
      {app.identityUnverified && <span style={{ color: colors.warning }}>{t("appcard.identityUnverified")}</span>}
    </>
  );
}

// Everything the checks say about the focused plugin, as sentences with the dot its row shows,
// then its tags and the main actions: the same facts as the Manage window's checks card.
export function Detail({
  props,
  t,
  moreFromAuthor,
}: {
  props: AppCardProps;
  t: TFunc;
  moreFromAuthor?: { count: number; onShow: () => void };
}) {
  const { app } = props;
  const a = useCardActions(props);
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
      <DetailHeader app={app} />
      <DetailActions t={t} a={a} />
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
        <ScanFacts app={app} t={t} />
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
