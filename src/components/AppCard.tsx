import { useCardActions, type AppCardProps } from "../hooks/useCardActions";
import type { App } from "../types";
import { cardDescriptionStyle, ellipsis, surfaceStyle } from "../utils";
import { displayVersion } from "../version";
import { ownerOf, titleOf } from "../author";
import { AppBadges } from "./AppBadges";
import { AppMonogram } from "./AppIdentity";
import { AppStats } from "./AppStats";
import { CardButtons, cardTitleStyle, fullRow, latestVersionText, StatusPills, type CardActions } from "./AppCardParts";
import { colors } from "../styles";

// Card chrome. The top border takes the status color (see statusColor()).
const cardStyle = {
  display: "grid",
  gridTemplateColumns: "40px minmax(0, 1fr)",
  // Fixed rows: name, category, badges, description, stats, error, what's new, then a
  // stretch row that pins the buttons to the bottom, so a row of cards lines up
  // (a longer description pushed one card's buttons lower; seen on a Deck).
  gridTemplateRows: "auto auto auto auto auto auto auto minmax(0, 1fr) auto",
  columnGap: 10,
  rowGap: 8,
  ...surfaceStyle,
  height: "100%",
  padding: 12,
  borderTop: "3px solid",
};
const categoryStyle = {
  color: colors.accent,
  fontSize: "max(12px, 0.78em)",
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
};

export function AppCard(props: AppCardProps) {
  const a = useCardActions(props);
  return props.layout === "row" ? <AppRow app={props.app} a={a} /> : <AppTile app={props.app} a={a} />;
}

// What the plugin is, or for an update what it brings, across both columns.
function RowDescription({ app, a }: { app: App; a: CardActions }) {
  const { t, latest, notes } = a;
  return !app.error && notes ? (
    <small
      className="deckyhub-card-notes deckyhub-row-description"
      style={{ ...cardDescriptionStyle, gridColumn: "2 / 4", gridRow: 3, color: "#d8e6f0" }}
    >
      <strong style={{ color: colors.warning }}>{t("details.whatsNew", { version: `v${latest}` })}:</strong> {notes}
    </small>
  ) : (
    <small
      className="deckyhub-row-description"
      style={{ ...cardDescriptionStyle, gridColumn: "2 / 4", gridRow: 3, color: colors.muted }}
    >
      {app.store
        ? t("release.inStore")
        : app.error || `${t("appcard.byAuthor", { author: ownerOf(app) })} · ${app.description ?? ""}`}
    </small>
  );
}

// One line of a list. The name is a direct child here too, so a row's buttons are found from its heading.
// Name and its release / stats on the left, badges beside them, and under both the
// description on up to two lines: one line beside the name showed ~35 characters on a
// Deck, too little to tell what a plugin does without opening it.
function AppRow({ app, a }: { app: App; a: CardActions }) {
  const { t } = a;
  return (
    <div
      className="deckyhub-app-row deckyhub-focus-ring"
      style={{
        ...surfaceStyle,
        display: "grid",
        gridTemplateColumns: "40px minmax(0, 1.5fr) minmax(0, 1.5fr) 230px",
        gridTemplateRows: "auto auto auto",
        alignItems: "center",
        columnGap: 12,
        rowGap: 2,
        padding: "8px 12px",
      }}
    >
      <AppMonogram app={app} style={{ gridRow: "1 / 4", width: 40, height: 40, fontSize: "0.85em" }} />
      <h3 style={{ ...cardTitleStyle, gridColumn: 2, gridRow: 1 }}>{titleOf(app, a.t)}</h3>
      {/* The release an Install / Update gives, then the stats. */}
      <div
        style={{
          gridColumn: 2,
          gridRow: 2,
          display: "flex",
          gap: 10,
          minWidth: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
          color: colors.subtle,
          fontSize: "max(12px, 0.8em)",
        }}
      >
        {/* A long version ("v2025.10.27-dddf365") gives way with "…"; the counts always show. */}
        <span style={{ ...ellipsis, color: colors.textSecondary }}>
          {t("settings.latestVersion", { version: latestVersionText(t, app) })}
        </span>
        <AppStats app={app} t={t} noUpdated />
      </div>
      {/* Status and badges. */}
      <div
        style={{
          gridColumn: 3,
          gridRow: "1 / 3",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          alignContent: "center",
          gap: "2px 10px",
        }}
      >
        <StatusPills app={app} a={a} />
        <AppBadges app={app} t={t} />
      </div>
      <RowDescription app={app} a={a} />
      <div style={{ gridColumn: 4, gridRow: "1 / 4" }}>
        <CardButtons a={a} row />
      </div>
    </div>
  );
}

// The card's stats line: installed and latest versions, and the stats.
function CardVersions({ app, a }: { app: App; a: CardActions }) {
  const { t } = a;
  return (
    <div
      style={{
        ...fullRow,
        gridRow: 5,
        display: "flex",
        flexWrap: "wrap",
        gap: "2px 14px",
        color: colors.subtle,
        fontSize: "max(12px, 0.8em)",
      }}
    >
      {app.installedVersion && (
        <span>{t("settings.installedVersion", { version: displayVersion(app.installedVersion) })}</span>
      )}
      {app.identityUnverified && <span style={{ color: colors.warning }}>{t("appcard.identityUnverified")}</span>}
      {app.identityTrusted && <span style={{ color: colors.muted }}>{t("appcard.identityTrusted")}</span>}
      {/* No release and no error yet: its GitHub check is still running. */}
      <span>{t("settings.latestVersion", { version: latestVersionText(t, app) })}</span>
      <AppStats app={app} t={t} />
    </div>
  );
}

// The store line or the error that stands in for a release.
function CardProblem({ app, a }: { app: App; a: CardActions }) {
  if (app.store)
    return (
      <small style={{ ...fullRow, gridRow: 6, color: colors.muted, overflowWrap: "anywhere" }}>
        {a.t("release.inStore")}
      </small>
    );
  if (!app.error) return null;
  return <small style={{ ...fullRow, gridRow: 6, color: colors.danger, overflowWrap: "anywhere" }}>{app.error}</small>;
}

// The default grid card. The name stays a direct child of the card: tests (and screen readers)
// find a card's buttons from its heading.
function AppTile({ app, a }: { app: App; a: CardActions }) {
  const { t, isUpdate, latest, notes } = a;
  return (
    <div className="deckyhub-focus-ring" style={{ ...cardStyle, borderTopColor: a.accent }}>
      <AppMonogram app={app} style={{ gridRow: "1 / 3", alignSelf: "center" }} />
      {/* A shared name keeps its whole "by author" on a second line instead of cutting it off. */}
      <h3 style={{ ...cardTitleStyle, gridColumn: 2, gridRow: 1, ...(app.sharesName && { whiteSpace: "normal" as const }) }}>
        {titleOf(app, a.t)}
      </h3>
      <small style={{ ...categoryStyle, gridColumn: 2, gridRow: 2 }}>
        {app.category} · {t("appcard.byAuthor", { author: ownerOf(app) })}
      </small>
      <div style={{ ...fullRow, gridRow: 3 }}>
        <StatusPills app={app} a={a} />
        <AppBadges app={app} t={t} />
      </div>
      <small style={{ ...cardDescriptionStyle, ...fullRow, gridRow: 4, display: "-webkit-box", color: colors.muted }}>
        {app.description || " "}
      </small>
      <CardVersions app={app} a={a} />
      <CardProblem app={app} a={a} />
      {/* What an update brings, so you can decide on the card; Y (Release Info) reads it all. */}
      {isUpdate && notes && (
        <small
          className="deckyhub-card-notes"
          style={{
            ...cardDescriptionStyle,
            ...fullRow,
            gridRow: 7,
            display: "-webkit-box",
            color: "#d8e6f0",
            borderLeft: "2px solid #f0c33c",
            paddingLeft: 8,
          }}
        >
          <strong style={{ color: colors.warning }}>{t("details.whatsNew", { version: `v${latest}` })}:</strong> {notes}
        </small>
      )}
      <CardButtons a={a} row={false} />
    </div>
  );
}
