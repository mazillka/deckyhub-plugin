import type { App } from "./types";

// The GitHub account a plugin comes from: the registry has no author field of its own.
export const ownerOf = (app: App) => app.repo.split("/")[0];

// What "More from this author" searches for: only the start of a repository's name (owner/name) can match it.
export const authorSearch = (app: App) => `${ownerOf(app)}/`;
