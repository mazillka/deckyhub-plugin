import type { TFunc } from "../i18n/en";
import { storeActivityOf, storeCountOf, totalDownloads, validCount } from "../sorting";
import type { App } from "../types";
import { compactNumber, timeAgo } from "../utils";

// The registry's date for the release it shows, else the card's own release check.
export const releasedAt = (app: App) => Date.parse(app.stats?.updated || app.publishedAt || "");
export const isStale = (released: number) => Date.now() - released > 365 * 24 * 60 * 60 * 1000;

// Updated / downloads / stars, shared by the card and its Manage window. A list row
// leaves out Updated (noUpdated): beside the latest version it cut the counts short.
// `detailed` (the details window, where a tooltip can't be read with a controller) says where the downloads
// came from: GitHub and the Decky store.
export function AppStats({
  app,
  t,
  noUpdated,
  detailed,
}: {
  app: App;
  t: TFunc;
  noUpdated?: boolean;
  detailed?: boolean;
}) {
  const released = releasedAt(app);
  const { stars } = app.stats ?? {};
  const downloads = totalDownloads(app.stats);
  const githubCount = app.stats?.downloads;
  const github = validCount(githubCount) ? githubCount : undefined;
  const storeActivity = storeActivityOf(app.stats);
  const store = storeCountOf(app.stats);
  return (
    <>
      {!noUpdated && released > 0 && !isStale(released) && (
        <span title={new Date(released).toLocaleDateString()}>{t("appcard.updated", { when: timeAgo(released) })}</span>
      )}
      {downloads !== undefined && (
        <span
          title={[
            downloads !== undefined && t("appcard.downloads", { count: compactNumber(downloads) }),
            github !== undefined && t("appcard.githubDownloads", { count: github.toLocaleString() }),
            storeActivity !== undefined
              ? t("appcard.storeActivity", { count: storeActivity.toLocaleString() })
              : store !== undefined && t("appcard.storeDownloads", { count: store.toLocaleString() }),
          ]
            .filter(Boolean)
            .join("\n")}
        >
          ↓ {compactNumber(downloads)}
        </span>
      )}
      {detailed && store !== undefined && (
        <span>
          {t("appcard.downloadsBreakdown", {
            github: compactNumber(github ?? 0),
            store: compactNumber(store),
          })}
          {storeActivity !== undefined && (
            <>
              <br />
              {t("appcard.storeActivity", { count: compactNumber(storeActivity) })}
            </>
          )}
          {downloads !== undefined && (
            <>
              <br />
              {t("appcard.downloads", { count: compactNumber(downloads) })}
            </>
          )}
        </span>
      )}
      {stars != null && (
        <span title={t("appcard.stars", { count: stars.toLocaleString() })}>★ {compactNumber(stars)}</span>
      )}
    </>
  );
}
