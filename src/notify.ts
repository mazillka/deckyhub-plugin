import { tr } from "./translate";
import { type App } from "./types";
import { toaster } from "@decky/api";

export const UPDATE_NOTICE_KEY = "deckyhub-update-notice";

// True the first time `value` is seen under `key`, so a toast shows once per
// update. Without storage it's always true: the toast just repeats next time.
export function seenOnce(key: string, value: string) {
  try {
    if (localStorage.getItem(key) === value) return false;
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable.
  }
  return true;
}

export function notifyUpdates(apps: App[]) {
  const updates = apps.filter((app) => app.updateAvailable && app.latestVersion);
  setUpdateCount(updates.length);
  const notice = updates.map((app) => `${app.repo}:${app.latestVersion}`).sort().join("|");
  if (!notice || !seenOnce(UPDATE_NOTICE_KEY, notice)) return;
  toaster.toast({ title: tr("toast.updatesAvailable", { count: updates.length }), body: updates.map((app) => `${app.name} (${app.latestVersion})`).join(", ") });
}

// How many plugins have an update, for the dot on DeckyHub's Quick Access icon.
let updateCount = 0;
const updateCountListeners = new Set<() => void>();
export function setUpdateCount(count: number) {
  updateCount = count;
  updateCountListeners.forEach((listener) => listener());
}
export const subscribeUpdateCount = (listener: () => void) => {
  updateCountListeners.add(listener);
  return () => void updateCountListeners.delete(listener);
};
export const getUpdateCount = () => updateCount;
