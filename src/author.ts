import type { App } from "./types";
import type { TFunc } from "./i18n/en";

// The GitHub account a plugin comes from: the registry has no author field of its own.
export const ownerOf = (app: App) => app.repo.split("/")[0];

// Flags the plugins whose name another one in the list also has.
export function markSharedNames(apps: App[]): App[] {
  const counts = new Map<string, number>();
  for (const app of apps) counts.set(app.name.toLowerCase(), (counts.get(app.name.toLowerCase()) ?? 0) + 1);
  return apps.map((app) => ((counts.get(app.name.toLowerCase()) ?? 0) > 1 ? { ...app, sharesName: true } : app));
}

// The title a card shows: "SteamGridDB by K1tsune12" when another plugin has the same name.
export const titleOf = (app: App, t: TFunc) =>
  app.sharesName ? `${app.name} ${t("appcard.byAuthor", { author: ownerOf(app) })}` : app.name;

// What "More from this author" searches for: only the start of a repository's name (owner/name) can match it.
export const authorSearch = (app: App) => `${ownerOf(app)}/`;
