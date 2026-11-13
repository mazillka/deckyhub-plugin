import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import type { ComponentProps } from "react";
import { FaCheck, FaDownload, FaPlus, FaStar } from "react-icons/fa";
import { openExternalWeb } from "../../external";
import { useT } from "../../i18n";
import type { SearchRepo } from "../../types";
import { cardDescriptionStyle, visuallyHidden } from "../../utils";
import { keepInView } from "../KeepInView";
import type { SearchResults } from "../SearchResults";

// Experimental: Search's results as rows, with the same actions: Install (Y / X / Menu on it) and Add.
export function ExpSearchResults({
  results,
  isAdded,
  installing,
  canDownload,
  onInstall,
  onAdd,
  onReleaseInfo,
  onDownloadZip,
}: ComponentProps<typeof SearchResults>) {
  const t = useT();
  if (!results.length) return null;
  const tile = (repo: SearchRepo) => {
    const [owner, name] = repo.full_name.split("/");
    const added = isAdded(repo.full_name);
    const buttons = (
      <Focusable flow-children="right" className="dh-exp-buttons">
        <div className="dh-exp-primary" style={{ flex: 1, minWidth: 0 }}>
          <Button
            disabled={installing}
            onSecondaryButton={() => onReleaseInfo(repo.full_name)}
            onSecondaryActionDescription={t("appcard.releaseInfo")}
            onOptionsButton={canDownload ? () => onDownloadZip(repo.full_name) : undefined}
            onOptionsActionDescription={t("settings.downloadUpdate")}
            onMenuButton={() => openExternalWeb(`https://github.com/${repo.full_name}`)}
            onMenuActionDescription={t("appcard.repository")}
            onClick={() => onInstall(repo.full_name)}
          >
            <FaDownload /> {t("appcard.install")}
          </Button>
        </div>
        {!added && (
          <div style={{ flex: "0 0 48px" }}>
            <Button aria-label={t("repos.add")} onClick={() => onAdd(repo.full_name)}>
              <FaPlus />
              <span style={visuallyHidden}>{t("repos.add")}</span>
            </Button>
          </div>
        )}
      </Focusable>
    );
    const info = (
      <>
        <h3 aria-label={repo.full_name}>{name}</h3>
        <div className="dh-exp-meta">
          <span>{t("search.byOwner", { owner })}</span>
          <span>
            <FaStar size="0.8em" /> {repo.stargazers_count ?? 0}
          </span>
          {added && (
            <span style={{ color: "#6bcb6b" }}>
              <FaCheck size="0.8em" /> {t("search.inDeckyHub")}
            </span>
          )}
        </div>
        <small style={{ ...cardDescriptionStyle, color: "#c7d4e0", overflowWrap: "anywhere" }}>
          {repo.description || t("repos.noDescription")}
        </small>
      </>
    );
    return (
      <div
        className="dh-exp-row deckyhub-search-row deckyhub-focus-ring"
        style={{ gridTemplateColumns: "minmax(0, 1fr) 240px" }}
      >
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>{info}</div>
        {buttons}
      </div>
    );
  };
  return (
    <Focusable flow-children="down" style={{ display: "grid", gap: 8 }}>
      {results.map((repo) => (
        <Focusable key={repo.full_name} flow-children="right" onFocus={keepInView}>
          {tile(repo)}
        </Focusable>
      ))}
    </Focusable>
  );
}
