import type { CSSProperties } from "react";
import type { TFunc } from "../i18n/en";
import type { App } from "../types";
import { compactNumber, timeAgo } from "../utils";

export const pillStyle = { display: "inline-block", marginRight: 6, padding: "1px 8px", border: "1px solid", borderRadius: 999, fontSize: "max(12px, 0.78em)", fontWeight: 600 };
const monogramStyle = { display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 8, color: "#fff", fontWeight: 700, letterSpacing: "0.02em" };

// The registry's date for the release it shows, else the card's own release check.
const releasedAt = (app: App) => Date.parse(app.stats?.updated || app.publishedAt || "");
const isStale = (released: number) => Date.now() - released > 365 * 24 * 60 * 60 * 1000;

// The Runs as root badge, also shown in Discover's legend that explains it.
export const RootBadge = ({ t }: { t: TFunc }) => (
  <span title={t("appcard.runsAsRootHint")} style={{ ...pillStyle, color: "#ffb35c", background: "#ffb35c22", borderColor: "#ffb35c66" }}>{t("appcard.runsAsRoot")}</span>
);

// Runs as root / No release in a year, shared by the card and its Manage window.
export function AppBadges({ app, t }: { app: App; t: TFunc }) {
  const released = releasedAt(app);
  return (
    <>
      {app.stats?.root && <RootBadge t={t} />}
      {isStale(released) && <span title={new Date(released).toLocaleDateString()} style={{ ...pillStyle, color: "#ff8a8a", background: "#ff8a8a22", borderColor: "#ff8a8a66" }}>{t("appcard.noReleaseInYear")}</span>}
    </>
  );
}

// Updated / downloads / stars, shared by the card and its Manage window.
export function AppStats({ app, t }: { app: App; t: TFunc }) {
  const released = releasedAt(app);
  const { downloads, stars } = app.stats ?? {};
  return (
    <>
      {released > 0 && !isStale(released) && <span title={new Date(released).toLocaleDateString()}>{t("appcard.updated", { when: timeAgo(released) })}</span>}
      {downloads !== undefined && <span title={t("appcard.downloads", { count: downloads.toLocaleString() })}>↓ {compactNumber(downloads)}</span>}
      {stars != null && <span title={t("appcard.stars", { count: stars.toLocaleString() })}>★ {compactNumber(stars)}</span>}
    </>
  );
}

// Up to two initials, e.g. "Decky LSFG-VK" -> "DL".
const monogram = (name: string) => name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join("");
// A stable hue per category, so every card in a category shares its color.
const categoryHue = (category: string) => [...category].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 7);

// The app's initials on its category's color, on its card and in its Manage window.
export function AppMonogram({ app, style }: { app: App; style?: CSSProperties }) {
  return <div aria-hidden style={{ ...monogramStyle, flexShrink: 0, background: `hsl(${categoryHue(app.category)} 45% 32%)`, ...style }}>{monogram(app.name)}</div>;
}
