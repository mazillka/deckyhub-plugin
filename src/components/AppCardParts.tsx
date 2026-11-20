import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import { FaArrowUp, FaCog, FaPlus } from "react-icons/fa";
import type { TFunc } from "../i18n/en";
import type { useCardActions } from "../hooks/useCardActions";
import { colors, tint } from "../styles";
import type { App } from "../types";
import { compactButtonStyle, ellipsis, statusKey, visuallyHidden } from "../utils";
import { displayVersion } from "../version";
import { pillStyle } from "./AppBadges";

export type CardActions = ReturnType<typeof useCardActions>;

export const fullRow = { gridColumn: "1 / -1" };
export const cardTitleStyle = {
  margin: 0,
  overflow: "hidden",
  color: colors.text,
  fontSize: "1.05em",
  fontWeight: 700,
  lineHeight: 1.2,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

// The newest release's version; no release and no error yet means its GitHub check is still running.
export function latestVersionText(t: TFunc, app: App) {
  if (app.store || (!app.latestVersion && app.error)) return "—";
  return app.latestVersion ? displayVersion(app.latestVersion) : t("settings.checkingUpdate");
}

// The status pill, and the channel pill when a pre-release override is set (stable is the default).
export function StatusPills({ app, a }: { app: App; a: CardActions }) {
  const { t, deckyInstalling, accent } = a;
  return (
    <>
      <span style={{ ...pillStyle, ...tint(accent) }}>
        {deckyInstalling ? t("status.installing") : t(statusKey(app))}
      </span>
      {app.channel === "prerelease" && (
        <span style={{ ...pillStyle, ...tint(colors.prerelease) }}>
          {t("appcard.channel", { channel: t("appcard.channelPrerelease") })}
        </span>
      )}
    </>
  );
}

// Install/Update, with Manage as a gear beside it; Manage alone takes the full width.
export function CardButtons({ a, row }: { a: CardActions; row: boolean }) {
  const { t, install, quickAction, isUpdate, deckyInstalling, quickLabel, quickButtonProps, openManage } = a;
  const quick = Boolean(install && quickAction);
  return (
    <Focusable flow-children="right" style={{ display: "flex", gap: 8, ...(row ? {} : { ...fullRow, gridRow: 9 }) }}>
      {quick && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <Button
            style={{ ...compactButtonStyle, marginBottom: 0 }}
            {...(row && { "aria-label": deckyInstalling ? t("status.installing") : quickLabel })}
            {...quickButtonProps}
          >
            {/* A row's Latest line names the version, so its button can say just Update / Install
                ("Update to v0.9.…" got cut short); its accessible name stays complete. */}
            {isUpdate ? <FaArrowUp /> : <FaPlus />}{" "}
            <span style={ellipsis}>
              {deckyInstalling
                ? t("status.installing")
                : row
                  ? t(isUpdate ? "appcard.update" : "appcard.install")
                  : quickLabel}
            </span>
          </Button>
        </div>
      )}
      <div style={quick ? { flex: "0 0 44px" } : { flex: 1 }}>
        <Button style={{ ...compactButtonStyle, marginBottom: 0, ...(quick && { padding: 0 }) }} onClick={openManage}>
          {/* The label stays as hidden text, so the gear keeps its name for screen readers and tests. */}
          <FaCog /> <span style={quick ? visuallyHidden : undefined}>{t("appcard.manage")}</span>
        </Button>
      </div>
    </Focusable>
  );
}
