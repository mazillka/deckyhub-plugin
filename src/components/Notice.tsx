import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import { useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { compactButtonStyle, disclaimerStyle, ellipsis } from "../utils";

const toggleStyle = { ...compactButtonStyle, minHeight: 32, marginBottom: 0, padding: "2px 12px", fontSize: "max(12px, 0.85em)" };

// A warning cut to one line, with More to read it all (and whatever `more` adds).
// Pages open with it so their plugins show above the fold; installs still show
// the full disclaimer in their own confirmation.
export function Notice({ text, more, className }: { text: string; more?: ReactNode; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Focusable flow-children="right" className={className} style={{ ...disclaimerStyle, display: "flex", alignItems: open ? "flex-start" : "center", gap: 12, padding: "6px 8px 6px 12px" }}>
      <div style={open ? { flex: 1, minWidth: 0, display: "grid", gap: 6 } : { flex: 1, ...ellipsis }}>
        {text}
        {open && more}
      </div>
      <div style={{ flex: "0 0 auto" }}>
        <Button style={toggleStyle} {...({ "aria-expanded": open } as object)} onClick={() => setOpen(!open)}>
          {open ? t("notice.less") : t("notice.more")}
        </Button>
      </div>
    </Focusable>
  );
}
