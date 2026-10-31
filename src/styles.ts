export const DEFAULT_COLUMNS_PER_ROW = 3;

export const pageStyle = { boxSizing: "border-box" as const, height: "100%", overflowY: "auto" as const, padding: "64px 12px 96px", scrollPaddingBottom: 96, scrollPaddingTop: 64, width: "100%" };

// Sizes read CSS variables that fall back to the Default density; the Compact
// setting overrides them on the page root (see applyDensity).
// Centers an icon and its label on one line, whatever the button's width.
export const iconRow = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8 } as const;

// minWidth 0: Steam's DialogButton has a minimum width of its own, which pushed a
// narrow button (the Manage gear) over its neighbour in side-by-side rows on a Deck.
export const compactButtonStyle = { ...iconRow, width: "100%", minWidth: 0, minHeight: "var(--dh-button-height, 40px)", marginBottom: "var(--dh-button-gap, 8px)", padding: "var(--dh-button-padding, 6px 10px)" };

// One line, cut with … when it doesn't fit (a long version in a button, stats in a row).
export const ellipsis = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const };

export const modalButtonStyle = { ...compactButtonStyle, marginBottom: 0 };

export const sectionDividerStyle = { borderTop: "1px solid rgba(255, 255, 255, 0.14)", margin: "var(--dh-divider-margin, 16px) 0" };

// Text screen readers (and tests) still read, e.g. an icon-only button's label.
export const visuallyHidden = { position: "absolute" as const, width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" as const };

export const windowGap = "var(--dh-window-gap, 10px)";

export const gridGap = "var(--dh-grid-gap, 12px)";

// The tile every card and section is drawn on (see Card and AppCard).
// Same no-responsibility note the install confirm shows, kept in view on the Updates, Discover and Search pages.
export const disclaimerStyle = { marginBottom: "var(--dh-card-gap, 14px)", padding: "8px 12px", color: "#ffb3b3", fontSize: "max(12px, 0.85em)", background: "rgba(255, 107, 107, 0.08)", borderLeft: "3px solid #ff6b6b", borderRadius: 6 };

// A notice that explains rather than warns (what the badges mean): the same shape in blue.
export const infoNoticeStyle = { ...disclaimerStyle, color: "#d6f5ff", background: "rgba(29, 117, 204, 0.1)", borderLeft: "3px solid #1d75cc" };

export const surfaceStyle = {
  background: "linear-gradient(160deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02))",
  border: "1px solid rgba(255, 255, 255, 0.09)",
  borderRadius: 8,
  boxSizing: "border-box" as const,
};

export const COMPACT_SIZES: Record<string, string> = {
  "--dh-button-height": "28px",
  "--dh-button-padding": "2px 10px",
  "--dh-button-gap": "4px",
  "--dh-divider-margin": "8px",
  "--dh-window-gap": "6px",
  "--dh-grid-gap": "8px",
  "--dh-card-gap": "8px",
  "--dh-card-padding": "0 10px",
};

// Applies Display Settings' density to this window and, in Gaming Mode, to the
// main window the Quick Access popup was opened from (where modals render).
export function applyDensity(density: string) {
  let opener: Document | undefined;
  try {
    opener = window.opener?.document;
  } catch {
    // A cross-origin opener isn't ours to style.
  }
  for (const root of [document.documentElement, opener?.documentElement]) {
    if (!root) continue;
    for (const [name, value] of Object.entries(COMPACT_SIZES)) {
      if (density === "compact") root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    }
  }
}

// Reserves a fixed two-line height so cards in the same grid row stay aligned regardless of description length.
export const cardDescriptionStyle = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden",
  minHeight: "2.6em",
  lineHeight: "1.3em",
};
