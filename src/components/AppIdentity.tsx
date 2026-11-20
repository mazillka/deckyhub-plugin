import type { CSSProperties } from "react";
import { colors } from "../styles";
import type { App } from "../types";

const monogramStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  borderRadius: 8,
  color: colors.text,
  fontWeight: 700,
  letterSpacing: "0.02em",
};

// Up to two initials, e.g. "Decky LSFG-VK" -> "DL".
const monogram = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
// A stable hue per category, so every card in a category shares its color.
export const categoryHue = (category: string) =>
  [...category].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 7);

// The app's initials on its category's color, on its card and in its Manage window.
export function AppMonogram({ app, style }: { app: App; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={{ ...monogramStyle, flexShrink: 0, background: `hsl(${categoryHue(app.category)} 45% 32%)`, ...style }}
    >
      {monogram(app.name)}
    </div>
  );
}
