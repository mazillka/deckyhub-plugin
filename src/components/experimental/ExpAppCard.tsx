import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import { FaArrowUp, FaCog, FaPlus } from "react-icons/fa";
import { cardDescriptionStyle, ellipsis, statusKey, visuallyHidden } from "../../utils";
import { displayVersion } from "../../version";
import { AppBadges, AppMonogram, AppStats, categoryHue } from "../AppBadges";
import { latestVersionText, type CardActions } from "../AppCardParts";
import { ownerOf } from "../../author";
import { useCardActions, type AppCardProps } from "../../hooks/useCardActions";
import type { App } from "../../types";

function Status({ app, a }: { app: App; a: CardActions }) {
  return (
    <span className="dh-exp-status" style={{ color: a.accent, borderColor: `${a.accent}88` }}>
      {a.deckyInstalling ? a.t("status.installing") : a.t(statusKey(app))}
    </span>
  );
}

// The version chip: installed → latest.
function Version({ app, a }: { app: App; a: CardActions }) {
  return (
    <span className="dh-exp-version">
      {app.installedVersion && (
        <>
          {displayVersion(app.installedVersion)} {a.isUpdate && "→"}{" "}
        </>
      )}
      {(!app.installedVersion || a.isUpdate) && <b>{latestVersionText(a.t, app)}</b>}
    </span>
  );
}

function Buttons({ a }: { a: CardActions }) {
  const { t, install, quickAction, isUpdate, deckyInstalling, quickLabel, quickButtonProps, openManage } = a;
  const quick = Boolean(install && quickAction);
  return (
    <Focusable flow-children="right" className="dh-exp-buttons">
      {quick && (
        <div className="dh-exp-primary" style={{ flex: 1, minWidth: 0 }}>
          <Button aria-label={deckyInstalling ? t("status.installing") : quickLabel} {...quickButtonProps}>
            {isUpdate ? <FaArrowUp /> : <FaPlus />}{" "}
            <span style={ellipsis}>
              {deckyInstalling ? t("status.installing") : t(isUpdate ? "appcard.update" : "appcard.install")}
            </span>
          </Button>
        </div>
      )}
      <div style={quick ? { flex: "0 0 48px" } : { flex: 1 }}>
        <Button onClick={openManage}>
          <FaCog /> <span style={quick ? visuallyHidden : undefined}>{t("appcard.manage")}</span>
        </Button>
      </div>
    </Focusable>
  );
}

// What an update brings, or what the plugin is.
function textOf(app: App, a: CardActions) {
  const { t, latest, notes } = a;
  if (!app.error && notes) return `${t("details.whatsNew", { version: `v${latest}` })}: ${notes}`;
  if (app.store) return t("release.inStore");
  return app.error || `${t("appcard.byAuthor", { author: ownerOf(app) })} · ${app.description ?? ""}`;
}

function Row({ app, a }: { app: App; a: CardActions }) {
  return (
    <div className="dh-exp-row deckyhub-focus-ring">
      <AppMonogram app={app} style={{ width: 48, height: 48, borderRadius: 14 }} />
      <h3 style={{ gridColumn: 2, gridRow: 1 }}>{app.name}</h3>
      <small
        style={{
          ...cardDescriptionStyle,
          gridColumn: 2,
          gridRow: 2,
          minHeight: 0,
          color: app.error ? "#ff6b6b" : "var(--exp-muted)",
        }}
      >
        {textOf(app, a)}
      </small>
      <div style={{ gridColumn: 3, gridRow: "1 / 3", display: "grid", justifyItems: "end", gap: 6 }}>
        <Status app={app} a={a} />
        <Version app={app} a={a} />
      </div>
      <div style={{ gridColumn: 4, gridRow: "1 / 3" }}>
        <Buttons a={a} />
      </div>
    </div>
  );
}

function Tile({ app, a }: { app: App; a: CardActions }) {
  const hue = categoryHue(app.category);
  return (
    <div className="dh-exp-card deckyhub-focus-ring">
      <div
        className="dh-exp-cover"
        style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 38%), hsl(${(hue + 50) % 360} 55% 22%))` }}
      >
        <AppMonogram
          app={app}
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            marginBottom: -30,
            border: "3px solid #121826",
            boxShadow: "0 6px 16px rgba(0,0,0,.35)",
          }}
        />
        <Status app={app} a={a} />
      </div>
      {/* The name stays a direct child of the card: tests and screen readers find its buttons from it. */}
      <h3 style={{ padding: "26px 14px 0" }}>{app.name}</h3>
      <div className="dh-exp-body">
        <div className="dh-exp-meta">
          <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{app.category}</span>
          <AppStats app={app} t={a.t} />
        </div>
        <small style={{ ...cardDescriptionStyle, color: app.error ? "#ff6b6b" : "#c7d4e0", overflowWrap: "anywhere" }}>
          {textOf(app, a)}
        </small>
        <div>
          <Version app={app} a={a} />
        </div>
        <div>
          <AppBadges app={app} t={a.t} />
        </div>
        <div className="dh-exp-spacer" />
        <Buttons a={a} />
      </div>
    </div>
  );
}

// Experimental: a plugin as a tile with a colored cover (its category's hue), a version
// chip (installed → latest) and one gradient button. Same actions as the Default card
// (useCardActions): Install / Update with Y / X / Menu on it, and Manage.
export function ExpAppCard(props: AppCardProps) {
  const a = useCardActions(props);
  return props.layout === "row" ? <Row app={props.app} a={a} /> : <Tile app={props.app} a={a} />;
}
