import { useSyncExternalStore } from "react";

// The Updates and Installed counts the tab bar shows. The page under it loads the apps, so it
// reports them here; the bar (a sibling above it) only reads.
type Counts = { updates: number; installed: number };
let counts: Counts = { updates: 0, installed: 0 };
const listeners = new Set<() => void>();

export function setV2Counts(next: Counts) {
  if (next.updates === counts.updates && next.installed === counts.installed) return;
  counts = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const useV2Counts = () => useSyncExternalStore(subscribe, () => counts);
