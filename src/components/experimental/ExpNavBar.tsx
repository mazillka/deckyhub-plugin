import { DialogButtonPrimary as Button, Focusable, GamepadButton } from "@decky/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FaArrowCircleUp, FaCog, FaCompass, FaPlug, FaSearch } from "react-icons/fa";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n/en";

const TABS = [["updates", FaArrowCircleUp, "nav.updates"], ["discover", FaCompass, "nav.discover"], ["installed", FaPlug, "filter.installed"], ["search", FaSearch, "nav.search"], ["settings", FaCog, "nav.settings"]] as const satisfies readonly (readonly [string, unknown, MessageKey])[];

// Settings' sections listen for L2 / R2 through this event, wherever focus is on the page.
export const SECTION_STEP = "deckyhub-section-step";

// Experimental: every page's tabs across the top, L1 at the left end and R1 at the right,
// the buttons that move to the tab on that side.
function ExpNavBar({ active, onSelect }: { active: string; onSelect: (page: string) => void }) {
  const t = useT();
  return (
    <Focusable flow-children="right" className="dh-exp-nav">
      <span aria-hidden className="dh-exp-nav-hint">L1</span>
      {TABS.map(([page, Icon, label]) => (
        <div key={page} className={page === active ? "is-active" : undefined}>
          <Button aria-label={t(label)} onClick={() => onSelect(page)}>
            <Icon /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t(label)}</span>
          </Button>
        </div>
      ))}
      <span aria-hidden className="dh-exp-nav-hint">R1</span>
    </Focusable>
  );
}

// Experimental: the pages under one tab bar that stays put. Switching swaps only what's under
// it, without a new route (each route change rebuilt the whole page and flickered on a Deck),
// so B still leaves DeckyHub in one press. L1 / R1 anywhere on the page move one tab, wrapping.
export function ExpPageFrame({ initial, render }: { initial: string; render: (page: string) => ReactNode }) {
  const [active, setActive] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  // Set by L1 / R1: focus may have been in the page that's gone, so it moves to the new tab.
  const focusTab = useRef(false);
  const select = (page: string, byBumper = false) => {
    if (page === active) return;
    focusTab.current = byBumper;
    setActive(page);
  };
  const step = (by: number) => select(TABS[(TABS.findIndex(([page]) => page === active) + by + TABS.length) % TABS.length][0], true);
  useEffect(() => {
    // The page scrolls in its own box (pageStyle): start the new tab at its top.
    let box = ref.current?.parentElement ?? null;
    while (box && getComputedStyle(box).overflowY !== "auto") box = box.parentElement;
    box?.scrollTo({ top: 0 });
    if (focusTab.current) ref.current?.querySelector<HTMLElement>(".dh-exp-nav .is-active button")?.focus();
    focusTab.current = false;
  }, [active]);
  return (
    <Focusable
      flow-children="down"
      style={{ display: "block" }}
      onButtonDown={(event: { detail: { button: number } }) => {
        const button = event.detail.button;
        if (button === GamepadButton.BUMPER_LEFT || button === GamepadButton.BUMPER_RIGHT) step(button === GamepadButton.BUMPER_LEFT ? -1 : 1);
        else if (button === GamepadButton.TRIGGER_LEFT || button === GamepadButton.TRIGGER_RIGHT)
          window.dispatchEvent(new CustomEvent(SECTION_STEP, { detail: button === GamepadButton.TRIGGER_LEFT ? -1 : 1 }));
      }}
    >
      <div ref={ref}>
        <ExpNavBar active={active} onSelect={(page) => select(page)} />
        <div key={active}>{render(active)}</div>
      </div>
    </Focusable>
  );
}
