import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import { FaArrowUp, FaCog, FaPlus } from "react-icons/fa";
import { cardDescriptionStyle, ellipsis, statusKey, visuallyHidden } from "../../utils";
import { displayVersion } from "../../version";
import { AppBadges, AppMonogram, AppStats, categoryHue } from "../AppBadges";
import { useCardActions, type AppCardProps } from "../AppCard";

// Experimental: a plugin as a tile with a colored cover (its category's hue), a version
// chip (installed → latest) and one gradient button. Same actions as the Default card
// (useCardActions): Install / Update with Y / X / Menu on it, and Manage.
export function ExpAppCard(props: AppCardProps) {
  const { app, layout } = props;
  const {
    t,
    install,
    isUpdate,
    quickAction,
    latest,
    quickLabel,
    notes,
    deckyInstalling,
    accent,
    quickButtonProps,
    openManage,
  } = useCardActions(props);
  const row = layout === "row";
  const status = (
    <span className="dh-exp-status" style={{ color: accent, borderColor: `${accent}88` }}>
      {deckyInstalling ? t("status.installing") : t(statusKey(app))}
    </span>
  );
  const version = (
    <span className="dh-exp-version">
      {app.installedVersion && (
        <>
          {displayVersion(app.installedVersion)} {isUpdate && "→"}{" "}
        </>
      )}
      {(!app.installedVersion || isUpdate) && (
        <b>{app.latestVersion ? displayVersion(app.latestVersion) : app.error ? "—" : t("settings.checkingUpdate")}</b>
      )}
    </span>
  );
  const buttons = (
    <Focusable flow-children="right" className="dh-exp-buttons">
      {install && quickAction && (
        <div className="dh-exp-primary" style={{ flex: 1, minWidth: 0 }}>
          <Button aria-label={deckyInstalling ? t("status.installing") : quickLabel} {...quickButtonProps}>
            {isUpdate ? <FaArrowUp /> : <FaPlus />}{" "}
            <span style={ellipsis}>
              {deckyInstalling ? t("status.installing") : t(isUpdate ? "appcard.update" : "appcard.install")}
            </span>
          </Button>
        </div>
      )}
      <div style={install && quickAction ? { flex: "0 0 48px" } : { flex: 1 }}>
        <Button onClick={openManage}>
          <FaCog /> <span style={install && quickAction ? visuallyHidden : undefined}>{t("appcard.manage")}</span>
        </Button>
      </div>
    </Focusable>
  );
  const text =
    !app.error && notes
      ? `${t("details.whatsNew", { version: `v${latest}` })}: ${notes}`
      : app.error || app.description || " ";
  const hue = categoryHue(app.category);
  if (row)
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
          {text}
        </small>
        <div style={{ gridColumn: 3, gridRow: "1 / 3", display: "grid", justifyItems: "end", gap: 6 }}>
          {status}
          {version}
        </div>
        <div style={{ gridColumn: 4, gridRow: "1 / 3" }}>{buttons}</div>
      </div>
    );
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
        {status}
      </div>
      {/* The name stays a direct child of the card: tests and screen readers find its buttons from it. */}
      <h3 style={{ padding: "26px 14px 0" }}>{app.name}</h3>
      <div className="dh-exp-body">
        <div className="dh-exp-meta">
          <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{app.category}</span>
          <AppStats app={app} t={t} />
        </div>
        <small style={{ ...cardDescriptionStyle, color: app.error ? "#ff6b6b" : "#c7d4e0", overflowWrap: "anywhere" }}>
          {text}
        </small>
        <div>{version}</div>
        <div>
          <AppBadges app={app} t={t} />
        </div>
        <div className="dh-exp-spacer" />
        {buttons}
      </div>
    </div>
  );
}
