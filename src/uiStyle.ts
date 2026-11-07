import { useSyncExternalStore } from "react";
import { getSettings, saveSettings } from "./api";
import type { UiStyle } from "./types";

// Quick Access' UI Style, shared by the panel and every route (one JS context runs them all).
// I18nProvider primes it from the saved settings; changeUiStyle() switches and saves it.
let current: UiStyle = "default";
const listeners = new Set<() => void>();

export function setUiStyle(style: unknown) {
  const next: UiStyle = style === "experimental" ? "experimental" : "default";
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const useUiStyle = () => useSyncExternalStore(subscribe, () => current);

// A window's root (windows open outside the page, so they carry the style's class themselves).
export const usePopClass = () => (useUiStyle() === "experimental" ? "deckyhub-pop deckyhub-exp" : "deckyhub-pop");

// Switches at once, then saves on top of the latest settings, so nothing else is overwritten.
export async function changeUiStyle(style: UiStyle) {
  setUiStyle(style);
  await saveSettings({ ...(await getSettings()), uiStyle: style });
}
