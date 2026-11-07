import { DialogButtonPrimary as Button, Focusable, Navigation } from "@decky/ui";
import { useEffect, useRef, type ReactNode } from "react";
import { SECTION_STEP } from "./ExpNavBar";
import { useT } from "../../i18n";
import { useSwapAnimation } from "../Card";

// Experimental: Settings as a side menu and a pane, instead of Steam's tab bar. Moving
// down the menu shows each section at once; Right goes into it, L2 / R2 switch sections from
// anywhere (L1 / R1 switch pages, see ExpPageFrame), B leaves Settings.
export function ExpSettings<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly { id: T; title: string; content: ReactNode }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  const t = useT();
  const swapRef = useSwapAnimation([active]);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  const index = tabs.indexOf(current);
  const railRef = useRef<HTMLDivElement>(null);
  // L2 / R2, from ExpPageFrame.
  useEffect(() => {
    const onStep = (event: Event) => {
      const next = (index + (event as CustomEvent<number>).detail + tabs.length) % tabs.length;
      onSelect(tabs[next].id);
      // The section focus was in is gone: put focus on the new one's menu entry (by position:
      // focusing the old entry would select it again).
      requestAnimationFrame(() => railRef.current?.querySelectorAll<HTMLElement>("button")[next]?.focus());
    };
    window.addEventListener(SECTION_STEP, onStep);
    return () => window.removeEventListener(SECTION_STEP, onStep);
  }, [index]);
  return (
    <Focusable flow-children="right" className="dh-exp-settings" onCancelButton={() => Navigation.NavigateBack()}>
      <div ref={railRef} className="dh-exp-rail-box">
        <Focusable flow-children="down" className="dh-exp-rail">
          <h2 className="dh-exp-gradient-text">{t("nav.settings")}</h2>
          {/* L2 for the section above, R2 for the one below. */}
          <div aria-hidden className="dh-exp-rail-hints">
            <span className="dh-exp-nav-hint">L2</span>
            <span className="dh-exp-nav-hint">R2</span>
          </div>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={tab.id === current.id ? "is-active" : undefined}
              onFocus={() => tab.id !== active && onSelect(tab.id)}
            >
              <Button onClick={() => onSelect(tab.id)}>{tab.title}</Button>
            </div>
          ))}
        </Focusable>
      </div>
      <div ref={swapRef} className="dh-exp-pane">
        {current.content}
      </div>
    </Focusable>
  );
}
