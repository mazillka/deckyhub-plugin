import { tr } from "./translate";
import { isAuditWarning, type App } from "./types";
import type { TFunc } from "./i18n/en";
import { toaster } from "@decky/api";

// What flagged the installed version (installedRisk), for its card badge and the toast.
export const installedRiskReasons = (t: TFunc, risk: NonNullable<App["installedRisk"]>) =>
  [
    ...(risk.threat ? [t("appcard.scan.infected")] : []),
    ...risk.warnings.filter(isAuditWarning).map((key) => t(`appcard.warning.${key}`)),
  ].join(", ");

const UPDATE_NOTICE_KEY = "deckyhub-update-notice";

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

// A toast when a virus scan finds a threat in a version that's already installed, or the
// audit blocks it; milder audit warnings stay on the card. Once per plugin, version and
// finding, so a new finding on the same version still shows.
export function notifyInstalledRisks(apps: App[]) {
  const flagged = apps.filter((app) => {
    const risk = app.installedRisk;
    const reasons = risk && (risk.threat || risk.warnings.includes("blocked")) && installedRiskReasons(tr, risk);
    return reasons && seenOnce(`deckyhub-risk-notice:${app.repo.toLowerCase()}`, `${app.installedVersion}|${reasons}`);
  });
  if (!flagged.length) return;
  toaster.toast({
    title: tr("toast.installedFlagged", { count: flagged.length }),
    body: flagged
      .map((app) => `${app.name} ${app.installedVersion}: ${installedRiskReasons(tr, app.installedRisk!)}`)
      .join("; "),
    critical: true,
  });
}

export function notifyUpdates(apps: App[]) {
  const updates = apps.filter((app) => app.updateAvailable && app.latestVersion);
  setUpdateCount(updates.length);
  const notice = updates
    .map((app) => `${app.repo}:${app.latestVersion}`)
    .sort()
    .join("|");
  if (!notice || !seenOnce(UPDATE_NOTICE_KEY, notice)) return;
  toaster.toast({
    title: tr("toast.updatesAvailable", { count: updates.length }),
    body: updates.map((app) => `${app.name} (${app.latestVersion})`).join(", "),
  });
}

// How many plugins have an update, for the dot on DeckyHub's Quick Access icon.
let updateCount = 0;
const updateCountListeners = new Set<() => void>();
function setUpdateCount(count: number) {
  updateCount = count;
  updateCountListeners.forEach((listener) => listener());
}
export const subscribeUpdateCount = (listener: () => void) => {
  updateCountListeners.add(listener);
  return () => void updateCountListeners.delete(listener);
};
export const getUpdateCount = () => updateCount;
