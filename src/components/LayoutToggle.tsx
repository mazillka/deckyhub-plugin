import { DialogButtonPrimary as Button } from "@decky/ui";
import { useState } from "react";
import { FaList, FaTh } from "react-icons/fa";
import { useT } from "../i18n";
import { readLayout, saveLayout, type Layout } from "../layoutDefault";
import { compactButtonStyle } from "../utils";

export type { Layout };

// Discover, Updates and Search share one grid/list choice, remembered on this device.
// The list is the default: more plugins per screen, each on one line.
export function useLayout() {
  const [layout, setLayout] = useState<Layout>(() => readLayout(localStorage));
  const change = (next: Layout) => {
    setLayout(next);
    saveLayout(localStorage, next);
  };
  return [layout, change] as const;
}

// One button that switches to the other layout.
export function LayoutToggle({ layout, onChange }: { layout: Layout; onChange: (layout: Layout) => void }) {
  const t = useT();
  return (
    <Button
      style={{ ...compactButtonStyle, marginBottom: 0 }}
      onClick={() => onChange(layout === "grid" ? "list" : "grid")}
    >
      {layout === "grid" ? (
        <>
          <FaList /> {t("discover.list")}
        </>
      ) : (
        <>
          <FaTh /> {t("discover.grid")}
        </>
      )}
    </Button>
  );
}
