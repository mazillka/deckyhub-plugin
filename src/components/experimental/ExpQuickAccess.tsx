import { DialogButtonPrimary as Button, Focusable, Navigation, NavEntryPositionPreferences } from "@decky/ui";
import { FaArrowCircleUp, FaCog, FaCompass, FaPlug, FaSearch } from "react-icons/fa";
import { useT } from "../../i18n";
import type { App } from "../../types";
import { displayVersion } from "../../version";
import { CleanupSection } from "../CleanupSection";
import { DeckyHubIcon } from "../DeckyHubIcon";
import { DeckyHubUpdate } from "../DeckyHubUpdate";
import { FocusableGrid } from "../FocusableGrid";

const go = (page: string) => Navigation.Navigate(`/deckyhub/${page}`);

// Experimental: the Quick Access panel as a dashboard. A banner with the update count and
// the first few plugins it covers, then the pages as tiles, DeckyHub's own update and Cleanup.
export function ExpQuickAccess({
  updates,
  listedCount,
  installedCount,
}: {
  updates: App[];
  listedCount: number;
  installedCount: number;
}) {
  const t = useT();
  const tiles = [
    {
      page: "discover",
      Icon: FaCompass,
      label: t("nav.discover"),
      note: listedCount > 0 ? t("discover.pluginCount", { count: listedCount }) : "",
    },
    { page: "installed", Icon: FaPlug, label: t("filter.installed"), note: String(installedCount) },
    { page: "search", Icon: FaSearch, label: t("nav.search"), note: "" },
    { page: "settings", Icon: FaCog, label: t("nav.settings"), note: "" },
  ];
  return (
    // Right from the tab strip starts at the banner's Updates button, not the tile level with it.
    <Focusable flow-children="down" navEntryPreferPosition={NavEntryPositionPreferences.FIRST}>
      <Focusable flow-children="down" className="dh-exp-qam-hero">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            aria-hidden
            style={{
              display: "flex",
              padding: 10,
              borderRadius: 14,
              background: "linear-gradient(135deg, var(--exp-accent), var(--exp-accent-2))",
              color: "#0b1020",
            }}
          >
            <DeckyHubIcon />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="dh-exp-big dh-exp-gradient-text">{updates.length}</div>
            <div style={{ color: "var(--exp-muted)", fontSize: "max(12px, 0.85em)" }}>
              {updates.length ? t("toast.updatesAvailable", { count: updates.length }) : t("view.updatesEmpty")}
            </div>
          </div>
        </div>
        {updates.length > 0 && (
          <>
            <ul>
              {updates.slice(0, 3).map((app) => (
                <li key={app.id}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.name}</span>
                  <span>{app.latestVersion ? displayVersion(app.latestVersion) : ""}</span>
                </li>
              ))}
            </ul>
            <div className="dh-exp-wide">
              <Button onClick={() => go("updates")}>
                <FaArrowCircleUp /> {t("nav.updates")}
              </Button>
            </div>
          </>
        )}
      </Focusable>
      <FocusableGrid items={tiles} columns={2} keyFor={(tile) => tile.page}>
        {({ page, Icon, label, note }) => (
          <div className="dh-exp-tile">
            <Button onClick={() => go(page)}>
              <Icon />
              <strong>{label}</strong>
              {note && <small>{note}</small>}
            </Button>
          </div>
        )}
      </FocusableGrid>
      <DeckyHubUpdate />
      <CleanupSection />
    </Focusable>
  );
}
