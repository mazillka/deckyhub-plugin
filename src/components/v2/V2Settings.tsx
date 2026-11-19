import { Focusable, Navigation } from "@decky/ui";
import type { ReactNode } from "react";
import { colors } from "../../styles";
import { ellipsis, surfaceStyle } from "../../utils";

// Experimental V2's Settings: the sections as a list on the left (like the plugin list), the focused one's controls
// in a pane on the right. Moving down the list shows each section at once; Right goes into it, Left comes back, B leaves.
export function V2Settings<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly { id: T; title: string; content: ReactNode }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  return (
    <Focusable
      flow-children="right"
      className="deckyhub-v2-settings"
      onCancelButton={() => Navigation.NavigateBack()}
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 5fr)", gap: 12, alignItems: "start" }}
    >
      {/* Stays beside the pane while the page scrolls (see the details pane of V2's library). */}
      <Focusable flow-children="down" style={{ display: "grid", gap: 6, position: "sticky", top: 8 }}>
        {tabs.map((tab) => (
          <Focusable
            key={tab.id}
            className="deckyhub-v2-section deckyhub-focus-ring"
            onFocus={() => {
              if (tab.id !== active) onSelect(tab.id);
            }}
            onActivate={() => onSelect(tab.id)}
            style={{
              ...surfaceStyle,
              padding: "10px 12px",
              fontWeight: 600,
              ...ellipsis,
              // The section the pane shows: a tint only, so it never reads as the focus ring.
              background: tab.id === current.id ? "rgba(255, 255, 255, 0.07)" : undefined,
              color: tab.id === current.id ? undefined : colors.muted,
            }}
          >
            {tab.title}
          </Focusable>
        ))}
      </Focusable>
      <div key={current.id} className="deckyhub-v2-settings-pane" style={{ minWidth: 0 }}>
        {current.content}
      </div>
    </Focusable>
  );
}
