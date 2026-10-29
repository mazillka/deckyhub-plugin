import { type MessageKey } from "./i18n/en";
import { type App } from "./types";

export const readableBytes = (bytes = 0) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`);

export const statusKey = (app: App): MessageKey =>
  !app.installedVersion ? "filter.notInstalled" : app.updateAvailable ? "status.updateAvailable" : app.updateAvailable === false ? "status.upToDate" : "filter.installed";

export const statusColor = (app: App) => (app.error ? "#ff6b6b" : !app.installedVersion ? "#8b929a" : app.updateAvailable ? "#f0c33c" : app.updateAvailable === false ? "#6bcb6b" : undefined);

// "2 days ago", "3 months ago": how long ago a card's plugin was last released.
export function timeAgo(time: number) {
  const days = Math.round((time - Date.now()) / 86_400_000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return Math.abs(days) < 31 ? format.format(days, "day") : Math.abs(days) < 365 ? format.format(Math.round(days / 30), "month") : format.format(Math.round(days / 365), "year");
}

// Download and star counts on cards: "1.2K", in the reader's locale.
export const compactNumber = (value: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
