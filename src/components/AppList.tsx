import { Focusable } from "@decky/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { App } from "../types";
import { FocusableGrid } from "./FocusableGrid";
import { keepInView } from "./KeepInView";
import type { Layout } from "./LayoutToggle";

// Plugins built at first, and again each time the end of the list comes near.
const BATCH = 30;

// Discover's and Updates' plugins as a grid of cards or a list of rows, built a batch
// at a time: 300+ cards at once made opening the list slow. Scrolling, or moving the
// D-pad (which scrolls the focused card into view), near the end adds the next batch.
export function AppList({ apps, layout, columns, renderCard }: { apps: App[]; layout: Layout; columns: number; renderCard: (app: App, layout?: "row") => ReactNode }) {
  const [count, setCount] = useState(BATCH);
  const end = useRef<HTMLDivElement>(null);
  // A new filter or category starts from the first batch again.
  useEffect(() => setCount(BATCH), [apps.length]);
  useEffect(() => {
    if (count >= apps.length || !end.current) return;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setCount((current) => current + BATCH), { rootMargin: "800px" });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [count, apps.length]);
  const shown = apps.slice(0, count);
  return (
    <>
      {layout === "list" ? (
        <Focusable flow-children="down" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {shown.map((app) => (
            <Focusable key={app.id} flow-children="right" onFocus={keepInView}>
              {renderCard(app, "row")}
            </Focusable>
          ))}
        </Focusable>
      ) : (
        <FocusableGrid items={shown} columns={columns} keyFor={(app) => app.id}>
          {(app) => renderCard(app)}
        </FocusableGrid>
      )}
      {count < apps.length && <div ref={end} aria-hidden className="deckyhub-list-end" style={{ height: 1 }} />}
    </>
  );
}
