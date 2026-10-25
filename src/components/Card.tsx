import { Focusable } from "@decky/ui";
import type { CSSProperties, ReactNode } from "react";
import { surfaceStyle } from "../utils";
import { keepInView } from "./KeepInView";

// One section of a page, drawn as a tile. Like KeepInView, it scrolls itself
// into view when the D-pad moves focus into it.
export function Card({ children, accent, style }: { children: ReactNode; accent?: string; style?: CSSProperties }) {
  return (
    <div onFocus={keepInView} style={{ ...surfaceStyle, marginBottom: "var(--dh-card-gap, 14px)", padding: "var(--dh-card-padding, 4px 14px)", ...(accent && { borderLeft: `3px solid ${accent}` }), ...style }}>
      {children}
    </div>
  );
}

export const iconTileStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 44,
  height: 44,
  borderRadius: 10,
  color: "#fff",
  fontSize: 20,
  background: "linear-gradient(140deg, #1a9fff, #2156a8)",
  boxShadow: "0 4px 14px rgba(26, 159, 255, 0.25)",
};

// A page's title row: icon tile, title and description, then any actions.
// Without actions it's a focus stop of its own, so the D-pad can reach it.
export function PageHeader({ icon, title, badge, description, actions }: { icon: ReactNode; title: string; badge?: ReactNode; description?: string; actions?: ReactNode }) {
  return (
    <Focusable flow-children="right" onActivate={actions ? undefined : () => {}} onFocus={keepInView} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: "var(--dh-card-gap, 14px)" }}>
      <div aria-hidden style={iconTileStyle}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, color: "#fff", fontSize: "1.6em", fontWeight: 700, lineHeight: 1.15 }}>{title}</h2>
          {badge}
        </div>
        {description && <div style={{ marginTop: 3, color: "#b8c7d3", fontSize: "0.9em" }}>{description}</div>}
      </div>
      {actions}
    </Focusable>
  );
}
