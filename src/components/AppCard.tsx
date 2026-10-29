import { DialogButtonPrimary as Button, ConfirmModal, Focusable, Navigation, showModal } from "@decky/ui";
import { useState, type CSSProperties } from "react";
import { FaArrowUp, FaCog, FaPlus } from "react-icons/fa";
import { useT } from "../i18n";
import type { App, Asset, HideableButton, RepoPreference, UpdateChannel } from "../types";
import { compactButtonStyle, compactNumber, cardDescriptionStyle, timeAgo, installAction, PLUGIN_INSTALL_TYPE, statusKey, statusColor, surfaceStyle, visuallyHidden } from "../utils";
import { displayVersion } from "../version";
import type { TFunc } from "../i18n/en";
import { AppDetailsModal, startPluginInstall } from "./AppDetailsModal";

// ponytail: raw markdown minus images and HTML tags; render markdown if plain text reads badly.
// Repeats until nothing changes, so a nested tag like <scr<b>ipt> can't reassemble one.
function plainNotes(notes = "") {
  for (let previous = ""; previous !== notes; ) {
    previous = notes;
    notes = notes.replace(/!\[[^\]]*\]\([^)]*\)|<[^>]*>/g, "");
  }
  return notes.replace(/\n{3,}/g, "\n\n").trim();
}

// Y on an Install/Update button shows what that release changes before installing it.
export const showReleaseInfo = (t: TFunc, title: string, publishedAt?: string | null, notes?: string) =>
  showModal(
    <ConfirmModal
      bAlertDialog
      strTitle={title}
      strDescription={
        <div style={{ whiteSpace: "pre-wrap" }}>
          {publishedAt && <p><small>{new Date(publishedAt).toLocaleDateString()}</small></p>}
          {plainNotes(notes) || t("appcard.noReleaseNotes")}
        </div>
      }
    />,
  );

// The registry's date for the release it shows, else the card's own release check.
const releasedAt = (app: App) => Date.parse(app.stats?.updated || app.publishedAt || "");
const isStale = (released: number) => Date.now() - released > 365 * 24 * 60 * 60 * 1000;

// The Runs as root badge, also shown in Discover's legend that explains it.
export const RootBadge = ({ t }: { t: TFunc }) => (
  <span title={t("appcard.runsAsRootHint")} style={{ ...pillStyle, color: "#ffb35c", background: "#ffb35c22", borderColor: "#ffb35c66" }}>{t("appcard.runsAsRoot")}</span>
);

// Runs as root / No release in a year, shared by the card and its Manage window.
export function AppBadges({ app, t }: { app: App; t: TFunc }) {
  const released = releasedAt(app);
  return (
    <>
      {app.stats?.root && <RootBadge t={t} />}
      {isStale(released) && <span title={new Date(released).toLocaleDateString()} style={{ ...pillStyle, color: "#ff8a8a", background: "#ff8a8a22", borderColor: "#ff8a8a66" }}>{t("appcard.noReleaseInYear")}</span>}
    </>
  );
}

// Updated / downloads / stars, shared by the card and its Manage window.
export function AppStats({ app, t }: { app: App; t: TFunc }) {
  const released = releasedAt(app);
  const { downloads, stars } = app.stats ?? {};
  return (
    <>
      {released > 0 && !isStale(released) && <span title={new Date(released).toLocaleDateString()}>{t("appcard.updated", { when: timeAgo(released) })}</span>}
      {downloads !== undefined && <span title={t("appcard.downloads", { count: downloads.toLocaleString() })}>↓ {compactNumber(downloads)}</span>}
      {stars != null && <span title={t("appcard.stars", { count: stars.toLocaleString() })}>★ {compactNumber(stars)}</span>}
    </>
  );
}

// Card chrome. The top border takes the status color (see statusColor()).
const cardStyle = {
  display: "grid",
  gridTemplateColumns: "40px minmax(0, 1fr)",
  gridTemplateRows: "auto auto",
  alignContent: "start",
  columnGap: 10,
  rowGap: 8,
  ...surfaceStyle,
  height: "100%",
  padding: 12,
  borderTop: "3px solid",
};
const fullRow = { gridColumn: "1 / -1" };
const monogramStyle = { display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 8, color: "#fff", fontWeight: 700, letterSpacing: "0.02em" };
const cardTitleStyle = { margin: 0, overflow: "hidden", color: "#fff", fontSize: "1.05em", fontWeight: 700, lineHeight: 1.2, textOverflow: "ellipsis", whiteSpace: "nowrap" as const };
const categoryStyle = { color: "#8fcef4", fontSize: "0.78em", letterSpacing: "0.04em", textTransform: "uppercase" as const };
const pillStyle = { display: "inline-block", marginRight: 6, padding: "1px 8px", border: "1px solid", borderRadius: 999, fontSize: "0.78em", fontWeight: 600 };

// Up to two initials, e.g. "Decky LSFG-VK" -> "DL".
const monogram = (name: string) => name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join("");
// A stable hue per category, so every card in a category shares its color.
const categoryHue = (category: string) => [...category].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 7);

// The app's initials on its category's color, on its card and in its Manage window.
export function AppMonogram({ app, style }: { app: App; style?: CSSProperties }) {
  return <div aria-hidden style={{ ...monogramStyle, flexShrink: 0, background: `hsl(${categoryHue(app.category)} 45% 32%)`, ...style }}>{monogram(app.name)}</div>;
}

export function AppCard({
  app,
  preference,
  downloadDisabled,
  hiddenButtons,
  onDownload,
  onChannelChange,
  onUninstalled,
  layout = "card",
}: {
  app: App;
  preference: RepoPreference;
  downloadDisabled?: boolean;
  hiddenButtons: HideableButton[];
  onDownload: (asset: Asset) => Promise<void>;
  onChannelChange: (repo: string, channel: UpdateChannel) => void;
  onUninstalled: () => void;
  // "row": one line of Discover's list view.
  layout?: "card" | "row";
}) {
  const t = useT();
  // Quick install/update to the latest release of a Decky plugin;
  // Manage still offers other versions/channels.
  const install = app.latestVersion ? installAction(app, { tag: app.latestVersion, assets: app.assets }) : null;
  // Only offer Update when the card's own status says one is available.
  const isUpdate = install?.type === PLUGIN_INSTALL_TYPE.UPDATE && app.updateAvailable === true;
  const quickAction = install && (isUpdate || install.type === PLUGIN_INSTALL_TYPE.INSTALL) && !hiddenButtons.includes(isUpdate ? "update" : "install");
  // Installs hand over to Decky's own dialog, so leave the Updates/Discover page.
  const leavePage = () => Navigation.NavigateBack();
  // Blocks a second tap from starting a second install while the first is handed over.
  const [installing, setInstalling] = useState(false);
  const latest = app.latestVersion ? displayVersion(app.latestVersion).replace(/^v/, "") : "";
  const quickLabel = t(isUpdate ? "settings.updateTo" : "appcard.installVersion", { version: latest });
  const accent = statusColor(app) ?? "#8fcef4";
  const statusPill = <span style={{ ...pillStyle, color: accent, background: `${accent}22`, borderColor: `${accent}66` }}>{t(statusKey(app))}</span>;
  const row = layout === "row";
  // Install/Update, with Manage as a gear beside it; Manage alone takes the full width.
  const actions = (
      <Focusable flow-children="right" style={{ display: "flex", gap: 8, ...(row ? {} : { ...fullRow, marginTop: "auto" }) }}>
      {install && quickAction && (
          <div style={{ flex: 1, minWidth: 0 }}>
          <Button
            style={{ ...compactButtonStyle, marginBottom: 0 }}
            disabled={installing}
            onSecondaryButton={() => showReleaseInfo(t, `${app.name} v${latest}`, app.publishedAt, app.releaseNotes)}
            onSecondaryActionDescription={t("appcard.releaseInfo")}
            // X downloads the same release's ZIP instead of installing it.
            onOptionsButton={hiddenButtons.includes("downloadZip") || downloadDisabled || !app.assets[0] ? undefined : () => void onDownload(app.assets[0])}
            onOptionsActionDescription={t("settings.downloadUpdate")}
            // Menu opens the plugin's GitHub page, to read about it before installing.
            onMenuButton={() => Navigation.NavigateToExternalWeb(`https://github.com/${app.repo}`)}
            onMenuActionDescription={t("appcard.repository")}
            onClick={() => {
              setInstalling(true);
              void startPluginInstall(t, app.name, app.repo, app.assets[0], app.latestVersion!, install, quickLabel, leavePage).finally(() => setInstalling(false));
            }}
          >
            {isUpdate ? <FaArrowUp /> : <FaPlus />} {quickLabel}
          </Button>
          </div>
      )}
        <div style={install && quickAction ? { flex: "0 0 44px" } : { flex: 1 }}>
        <Button
          style={{ ...compactButtonStyle, marginBottom: 0, ...(install && quickAction && { padding: 0 }) }}
          onClick={() =>
            showModal(
              <AppDetailsModal
                t={t}
                app={app}
                preference={preference}
                downloadDisabled={downloadDisabled}
                hiddenButtons={hiddenButtons}
                onDownload={onDownload}
                onChannelChange={(channel) => onChannelChange(app.repo, channel)}
                onUninstalled={onUninstalled}
              />
            )
          }
        >
          {/* The label stays as hidden text, so the gear keeps its name for screen readers and tests. */}
          <FaCog /> <span style={install && quickAction ? visuallyHidden : undefined}>{t("appcard.manage")}</span>
        </Button>
        </div>
      </Focusable>
  );
  if (row)
    return (
      // The name is a direct child here too, so a row's buttons are found from its heading.
      <div className="deckyhub-app-row" style={{ ...surfaceStyle, display: "grid", gridTemplateColumns: "36px minmax(0, 1.3fr) minmax(0, 2fr) minmax(0, 1.4fr) 230px", alignItems: "center", columnGap: 12, padding: "6px 12px" }}>
        <AppMonogram app={app} style={{ width: 36, height: 36, fontSize: "0.85em" }} />
        <h3 style={cardTitleStyle}>{app.name}</h3>
        <small style={{ color: "#b8c7d3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{app.error || app.description}</small>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 10px", color: "#8b9aa7", fontSize: "0.8em" }}>
          {statusPill}
          <AppBadges app={app} t={t} />
          <AppStats app={app} t={t} />
        </div>
        {actions}
      </div>
    );
  return (
    // The name stays a direct child of the card: tests (and screen readers)
    // find a card's buttons from its heading.
    <div style={{ ...cardStyle, borderTopColor: accent }}>
      <AppMonogram app={app} style={{ gridRow: "1 / 3", alignSelf: "center" }} />
      <h3 style={cardTitleStyle}>{app.name}</h3>
      <small style={categoryStyle}>{app.category}</small>
      <div style={fullRow}>
        {statusPill}
        {/* Stable is the default, so only a pre-release override earns a pill. */}
        {app.channel === "prerelease" && (
          <span style={{ ...pillStyle, color: "#ffa94d", background: "#ffa94d22", borderColor: "#ffa94d66" }}>{t("appcard.channel", { channel: t("appcard.channelPrerelease") })}</span>
        )}
        <AppBadges app={app} t={t} />
      </div>
      <small style={{ ...cardDescriptionStyle, ...fullRow, display: "-webkit-box", color: "#b8c7d3" }}>{app.description || " "}</small>
      <div style={{ ...fullRow, display: "flex", flexWrap: "wrap", gap: "2px 14px", color: "#8b9aa7", fontSize: "0.8em" }}>
        {app.installedVersion && <span>{t("settings.installedVersion", { version: displayVersion(app.installedVersion) })}</span>}
        {/* No release and no error yet: its GitHub check is still running. */}
        <span>{t("settings.latestVersion", { version: app.latestVersion ? displayVersion(app.latestVersion) : app.error ? "—" : t("settings.checkingUpdate") })}</span>
        <AppStats app={app} t={t} />
      </div>
      {app.error && <small style={{ ...fullRow, color: "#ff6b6b", overflowWrap: "anywhere" }}>{app.error}</small>}
      {actions}
    </div>
  );
}
