import { useT } from "../i18n";
import { colors, tint } from "../styles";
import type { UpdateChannel, View } from "../types";
import { compactNumber } from "../utils";
import { pillStyle } from "./AppBadges";
import { countBadgeStyle } from "./QuickAccessNav";

// Beside a page's title: Updates' count, Discover's total downloads, and a note when the
// registry's develop list is on (Settings > Repositories), so a plugin that's only being
// tested isn't a surprise.
export function ContentBadge({
  view,
  updateCount,
  totalDownloads,
  registryChannel,
}: {
  view: View;
  updateCount: number;
  totalDownloads: number;
  registryChannel: UpdateChannel;
}) {
  const t = useT();
  return (
    <>
      {view === "updates" && updateCount > 0 && (
        <span
          className="deckyhub-update-count"
          title={t("toast.updatesAvailable", { count: updateCount })}
          style={countBadgeStyle}
        >
          {updateCount}
        </span>
      )}
      {view === "discover" && totalDownloads > 0 && (
        <span
          className="deckyhub-total-downloads"
          title={t("view.totalDownloads", { count: totalDownloads.toLocaleString() })}
          style={{ color: colors.subtle, fontSize: "max(12px, 0.7em)", fontWeight: 400 }}
        >
          {t("view.totalDownloads", { count: compactNumber(totalDownloads) })}
        </span>
      )}
      {registryChannel === "prerelease" && (
        <span
          className="deckyhub-registry-channel"
          style={{
            ...pillStyle,
            marginLeft: 8,
            whiteSpace: "nowrap",
            ...tint(colors.prerelease),
            verticalAlign: "middle",
          }}
        >
          {t("view.prereleaseRegistry")}
        </span>
      )}
    </>
  );
}
