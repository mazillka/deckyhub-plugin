import { DropdownItem, Focusable, ModalRoot } from "@decky/ui";
import type { ReactNode } from "react";
import type { TFunc } from "../i18n/en";
import { MotionStyle } from "../motion";
import type { UpdateChannel } from "../types";
import { surfaceStyle } from "../utils";
import { displayVersion } from "../version";
import { plainNotes, showReleaseInfo } from "./ReleaseInfo";
import { keepInView } from "./KeepInView";

// How much of the release notes the window shows; Y on the main button opens them in full.
const NOTES_PREVIEW = 700;
export const sectionTitleStyle = { margin: 0, color: "#9fb0bf", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const };

// The wide details window both a plugin's Manage window and DeckyHub's own update
// window use: a header (who, what state, how popular), About and the selected
// release's notes on the left, and on the right the main action, the version box
// and whatever else the caller adds, most important first.
export function DetailsWindow({
  t,
  closeModal,
  icon,
  title,
  aside,
  meta,
  description,
  release,
  primary,
  channel,
  onChannelChange,
  versionOptions,
  selectedTag,
  onVersionChange,
  disabled,
  error,
  isEmpty,
  footer,
}: {
  t: TFunc;
  closeModal?: () => void;
  icon: ReactNode;
  title: string;
  // Beside the title (a plugin's repository).
  aside?: string;
  // The line under the title: category, version, stats, badges.
  meta: ReactNode;
  description?: string;
  release?: { tag: string; publishedAt: string | null; notes?: string } | null;
  // Install / Update and Download ZIP, under the version box.
  primary: ReactNode;
  channel: UpdateChannel;
  onChannelChange: (channel: UpdateChannel) => void;
  versionOptions: { data: string; label: string }[];
  selectedTag: string;
  onVersionChange: (tag: string) => void;
  disabled: boolean;
  error?: string | null;
  isEmpty: boolean;
  // Links, Uninstall, Close: under the version box.
  footer: ReactNode;
}) {
  const notes = plainNotes(release?.notes);
  const notesPreview = notes.length > NOTES_PREVIEW ? `${notes.slice(0, NOTES_PREVIEW).replace(/\s+\S*$/, "")}…` : notes;
  return (
    <ModalRoot closeModal={closeModal} bAllowFullSize>
      <MotionStyle />
      <div className="deckyhub-pop">
        <div className="deckyhub-details" style={{ display: "grid", gap: 18 }}>
          <div onFocus={keepInView} style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {icon}
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 12px" }}>
                <strong style={{ color: "#fff", fontSize: 26, lineHeight: 1.15 }}>{title}</strong>
                {aside && <span style={{ color: "#9fb0bf", fontSize: 14 }}>{aside}</span>}
              </div>
              <div className="deckyhub-details-meta" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", color: "#c3cfd9", fontSize: 14 }}>
                {meta}
              </div>
            </div>
          </div>

          {/* Actions come first, so in one column (a narrow window) they sit on top; in two,
              row-reverse puts them on the right. */}
          <div style={{ display: "flex", flexDirection: "row-reverse", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
            {/* Version first: pick the channel and release, then act on it. */}
            <div style={{ flex: "1 1 300px", display: "grid", gap: 10, minWidth: 0 }}>
              <div onFocus={keepInView} style={{ display: "grid", gap: 4, padding: "8px 12px", background: "rgba(0, 0, 0, 0.2)", borderRadius: 10 }}>
                <h3 style={sectionTitleStyle}>{t("settings.version")}</h3>
                {/* Channel and version side by side; the version gets more room for long tags. */}
                <Focusable flow-children="right" className="deckyhub-version-pickers" style={{ display: "grid", gridTemplateColumns: versionOptions.length > 0 ? "minmax(0, 2fr) minmax(0, 3fr)" : "minmax(0, 1fr)", gap: 12, alignItems: "end" }}>
                  <div style={{ minWidth: 0 }}>
                    <DropdownItem
                      layout="below"
                      bottomSeparator="none"
                      label={t("settings.updateChannel")}
                      rgOptions={[
                        { label: t("settings.stableReleases"), data: "stable" },
                        { label: t("settings.preReleases"), data: "prerelease" },
                      ]}
                      selectedOption={channel}
                      disabled={disabled}
                      onChange={({ data }) => onChannelChange(data as UpdateChannel)}
                    />
                  </div>
                  {versionOptions.length > 0 && (
                    <div style={{ minWidth: 0 }}>
                      <DropdownItem layout="below" bottomSeparator="none" label={t("settings.version")} rgOptions={versionOptions} selectedOption={selectedTag} disabled={disabled} onChange={({ data }) => onVersionChange(String(data))} />
                    </div>
                  )}
                </Focusable>
                {error && <small style={{ color: "#ff6b6b" }}>{error}</small>}
                {isEmpty && <small style={{ color: "#ff6b6b" }}>{t("settings.noReleasesFound")}</small>}
              </div>
              {primary}
              {footer}
            </div>
            <div onFocus={keepInView} style={{ flex: "999 1 360px", display: "grid", gap: 16, minWidth: 0 }}>
              {/* Each text section is a D-pad stop: Steam only scrolls to follow focus, so
                  without them the window couldn't scroll down to the notes (seen on a Deck). */}
              {description && (
                <Focusable className="deckyhub-details-section" onActivate={() => {}} onFocus={keepInView} style={{ display: "grid", gap: 6 }}>
                  <h3 style={sectionTitleStyle}>{t("details.about")}</h3>
                  <div className="deckyhub-details-description" style={{ color: "#e6eef4", fontSize: 16, lineHeight: 1.5, overflowWrap: "anywhere" }}>{description}</div>
                </Focusable>
              )}
              {release && (
                // A opens the notes in full; here they stop after a preview.
                <Focusable className="deckyhub-details-section" onActivate={() => showReleaseInfo(t, `${title} ${displayVersion(release.tag)}`, release.publishedAt, release.notes)} onFocus={keepInView} style={{ display: "grid", gap: 6 }}>
                  <h3 style={sectionTitleStyle}>
                    {t("details.whatsNew", { version: displayVersion(release.tag) })}
                    {release.publishedAt && <span style={{ marginLeft: 10, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>{new Date(release.publishedAt).toLocaleDateString()}</span>}
                  </h3>
                  <div className="deckyhub-details-notes" style={{ ...surfaceStyle, padding: "12px 14px", color: "#c3cfd9", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {notesPreview || t("appcard.noReleaseNotes")}
                  </div>
                </Focusable>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalRoot>
  );
}
