import { DialogButtonPrimary as Button, Focusable, Navigation } from "@decky/ui";
import { FaCheck, FaDownload, FaPlus } from "react-icons/fa";
import { pillStyle } from "./AppBadges";
import { useT } from "../i18n";
import type { SearchRepo } from "../types";
import { compactButtonStyle, ellipsis, surfaceStyle } from "../utils";
import { FocusableGrid } from "./FocusableGrid";
import { keepInView } from "./KeepInView";
import type { Layout } from "./LayoutToggle";

const buttonStyle = { ...compactButtonStyle, marginBottom: 0 };

// Search's results as a two-column grid or a list of rows: the plugin's name and
// owner, then Install (Y: release notes, X: download the ZIP, Menu: the repository)
// and, until it's in DeckyHub, Add.
export function SearchResults({
  results,
  layout,
  isAdded,
  installing,
  canDownload,
  onInstall,
  onAdd,
  onReleaseInfo,
  onDownloadZip,
}: {
  results: SearchRepo[];
  layout: Layout;
  isAdded: (repo: string) => boolean;
  installing: boolean;
  canDownload: boolean;
  onInstall: (repo: string) => void;
  onAdd: (repo: string) => void;
  onReleaseInfo: (repo: string) => void;
  onDownloadZip: (repo: string) => void;
}) {
  const t = useT();
  // Install fills the row; Add (track without installing) is a small + beside it
  // until the repository is in DeckyHub, which the title's badge then says.
  const actions = (repo: SearchRepo) => {
    const added = isAdded(repo.full_name);
    return (
      <Focusable flow-children="right" style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Button
            style={buttonStyle}
            disabled={installing}
            onSecondaryButton={() => onReleaseInfo(repo.full_name)}
            onSecondaryActionDescription={t("appcard.releaseInfo")}
            onOptionsButton={canDownload ? () => onDownloadZip(repo.full_name) : undefined}
            onOptionsActionDescription={t("settings.downloadUpdate")}
            onMenuButton={() => Navigation.NavigateToExternalWeb(`https://github.com/${repo.full_name}`)}
            onMenuActionDescription={t("appcard.repository")}
            onClick={() => onInstall(repo.full_name)}
          >
            <FaDownload /> {t("appcard.install")}
          </Button>
        </div>
        {!added && (
          <div style={{ flex: "0 0 44px" }}>
            <Button style={{ ...buttonStyle, padding: 0 }} aria-label={t("repos.add")} onClick={() => onAdd(repo.full_name)}>
              <FaPlus />
            </Button>
          </div>
        )}
      </Focusable>
    );
  };
  // The plugin's name large, its owner small: "XXJSONDERULOXX/DECKY-LSFG-VK" in
  // capitals was hard to read on a Deck. The heading keeps the full name for screen readers.
  const title = (repo: SearchRepo) => {
    const [owner, name] = repo.full_name.split("/");
    return (
      <>
        <h3 aria-label={repo.full_name} style={{ margin: 0, color: "#fff", fontSize: "1.05em", ...ellipsis }}>{name}</h3>
        <small style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, color: "#8b9aa7" }}>
          <span style={ellipsis}>{t("search.byOwner", { owner })}</span>
          {isAdded(repo.full_name) && <span style={{ ...pillStyle, flexShrink: 0, color: "#6bcb6b", background: "#6bcb6b22", borderColor: "#6bcb6b66" }}><FaCheck size="0.8em" /> {t("search.inDeckyHub")}</span>}
        </small>
      </>
    );
  };

  if (!results.length) return null;
  return layout === "list" ? (
    <Focusable flow-children="down" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {results.map((repo) => (
        // The name is a direct child, so a row's buttons are found from its heading;
        // the description sits under it, like Discover's rows.
        <Focusable key={repo.full_name} flow-children="right" onFocus={keepInView} className="deckyhub-search-row deckyhub-focus-ring" style={{ ...surfaceStyle, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 70px 220px", gridTemplateRows: "auto auto auto", alignItems: "center", columnGap: 12, rowGap: 2, padding: "8px 12px" }}>
          {title(repo)}
          <small style={{ gridColumn: 1, gridRow: 3, color: "#b8c7d3", ...ellipsis }}>{repo.description || t("repos.noDescription")}</small>
          <small style={{ gridColumn: 2, gridRow: "1 / 4", color: "#8b9aa7" }}>★ {repo.stargazers_count ?? 0}</small>
          <div style={{ gridColumn: 3, gridRow: "1 / 4" }}>{actions(repo)}</div>
        </Focusable>
      ))}
    </Focusable>
  ) : (
    <FocusableGrid items={results} columns={2} keyFor={(repo) => repo.full_name}>
      {(repo) => (
        <div className="deckyhub-focus-ring" style={{ ...surfaceStyle, height: "100%", padding: "var(--dh-card-padding, 4px 14px)" }}>
          {/* The heading sits beside the buttons, so they're found from it. */}
          <div style={{ display: "grid", gap: 6, padding: "10px 0" }}>
            {title(repo)}
            <small style={{ color: "#b8c7d3" }}>
              {repo.description || t("repos.noDescription")} · ★ {repo.stargazers_count ?? 0}
            </small>
            {actions(repo)}
          </div>
        </div>
      )}
    </FocusableGrid>
  );
}
