import type { App } from "./types";

export function lookupForApp<T>(app: Pick<App, "store">, lookup: () => Promise<T>, empty: T): Promise<T> {
  return app.store ? Promise.resolve(empty) : lookup();
}

export function clearStoreReleaseData(app: App): App {
  return {
    ...app,
    assets: [],
    latestVersion: undefined,
    latestPrerelease: undefined,
    releaseNotes: undefined,
    releaseUrl: undefined,
    publishedAt: undefined,
    updateAvailable: null,
    installedAssets: undefined,
    installedAudit: undefined,
    installedRisk: undefined,
    scan: undefined,
    virusTotal: undefined,
    metaDefender: undefined,
    prereleaseOnly: undefined,
    channel: undefined,
    error: undefined,
  };
}
