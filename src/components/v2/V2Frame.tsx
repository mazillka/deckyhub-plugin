import { DialogButton, Focusable, GamepadButton } from "@decky/ui";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useT } from "../../i18n";
import type { MessageKey } from "../../i18n/en";
import { colors } from "../../styles";
import { keepInView } from "../KeepInView";
import { SELECT_PAGE, type SelectPageRequest } from "../experimental/ExpNavBar";
import { useV2Counts } from "./v2Counts";

export const V2_TABS = ["discover", "updates", "installed", "search", "settings"] as const;
const LABELS: Record<(typeof V2_TABS)[number], MessageKey> = {
  discover: "nav.discover",
  updates: "nav.updates",
  installed: "filter.installed",
  search: "nav.search",
  settings: "nav.settings",
};

// The open tab, and moving between tabs: L1 / R1 step one, wrapping, and a button inside a page
// (Updates' Discover) asks for a tab through an event.
function useV2Tabs(initial: string, ref: RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState(initial);
  const focusTab = useRef(false);
  const select = (page: string, byBumper = false) => {
    if (page === active) return;
    focusTab.current = byBumper;
    setActive(page);
  };
  useEffect(() => {
    const onSelect = (event: Event) => {
      const request = (event as CustomEvent<SelectPageRequest>).detail;
      request.handled = true;
      select(request.page, true);
    };
    window.addEventListener(SELECT_PAGE, onSelect);
    return () => window.removeEventListener(SELECT_PAGE, onSelect);
  });
  const step = (by: number) =>
    select(V2_TABS[(V2_TABS.indexOf(active as (typeof V2_TABS)[number]) + by + V2_TABS.length) % V2_TABS.length], true);
  useEffect(() => {
    if (focusTab.current) ref.current?.querySelector<HTMLElement>(".deckyhub-v2-tab.is-active")?.focus();
    focusTab.current = false;
  }, [active]);
  return { active, select, step };
}

// The tab pills, the info button and the L1 / R1 hint.
function V2TabBar({ active, select }: { active: string; select: (page: string) => void }) {
  const t = useT();
  const counts = useV2Counts();
  const count = (page: string) => (page === "updates" ? counts.updates : page === "installed" ? counts.installed : 0);
  return (
    <Focusable
      flow-children="right"
      onFocus={keepInView}
      className="deckyhub-v2-tabs"
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0 10px" }}
    >
      {V2_TABS.map((page) => (
        <DialogButton
          key={page}
          className={page === active ? "deckyhub-v2-tab is-active" : "deckyhub-v2-tab"}
          onClick={() => select(page)}
          style={{
            width: "auto",
            minWidth: 0,
            height: 36,
            padding: "0 16px",
            borderRadius: 999,
            // White on Steam's bright blue is 2.8:1: this blue holds 4.5:1.
            background: page === active ? "#0a6cb0" : undefined,
            color: page === active ? "#fff" : undefined,
          }}
        >
          {t(LABELS[page])}
          {count(page) > 0 && ` ${count(page)}`}
        </DialogButton>
      ))}
      <span aria-hidden style={{ flex: 1 }} />
      <small style={{ color: colors.subtle }}>L1 / R1</small>
    </Focusable>
  );
}

// Experimental V2: the pages under one tab bar, switched in place (no route change, so B still leaves
// DeckyHub in one press). L1 / R1 move one tab, wrapping.
export function V2Frame({ initial, render }: { initial: string; render: (page: string) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { active, select, step } = useV2Tabs(initial, ref);
  return (
    <Focusable
      flow-children="down"
      onButtonDown={(event: { detail: { button: number } }) => {
        const button = event.detail.button;
        if (button === GamepadButton.BUMPER_LEFT) step(-1);
        else if (button === GamepadButton.BUMPER_RIGHT) step(1);
      }}
    >
      <div ref={ref}>
        <V2TabBar active={active} select={select} />
        <div key={active}>{render(active)}</div>
      </div>
    </Focusable>
  );
}
