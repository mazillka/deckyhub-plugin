import { DialogButtonPrimary as Button } from "@decky/ui";
import { useState } from "react";
import { FaList, FaTh } from "react-icons/fa";
import { useT } from "../i18n";
import { compactButtonStyle } from "../utils";

export type Layout = "grid" | "list";

// Discover, Updates and Search share one grid/list choice, remembered on this device.
const LAYOUT_KEY = "deckyhub-layout";

export function useLayout() {
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const change = (next: Layout) => {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {}
  };
  return [layout, change] as const;
}

// One button that switches to the other layout.
export function LayoutToggle({ layout, onChange }: { layout: Layout; onChange: (layout: Layout) => void }) {
  const t = useT();
  return (
    <Button style={{ ...compactButtonStyle, marginBottom: 0 }} onClick={() => onChange(layout === "grid" ? "list" : "grid")}>
      {layout === "grid" ? <><FaList /> {t("discover.list")}</> : <><FaTh /> {t("discover.grid")}</>}
    </Button>
  );
}
