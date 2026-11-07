import { usePopClass, useUiStyle } from "../uiStyle";
import { ExpDetailsLayout } from "./experimental/ExpDetailsLayout";
import { DropdownItem, Focusable } from "@decky/ui";
import { WideModalRoot } from "./WideModal";
import type { ReactNode } from "react";
import type { TFunc } from "../i18n/en";
import { MotionStyle } from "../motion";
import type { UpdateChannel } from "../types";
import { surfaceStyle } from "../utils";
import { displayVersion } from "../version";
import { plainNotes, showReleaseInfo, textSections } from "./ReleaseInfo";
import { keepInView } from "./KeepInView";
import { colors } from "../styles";

// How much of the release notes the window shows (nearly always all of it); Y on the main button opens them in full.
const NOTES_PREVIEW = 6000;
export const sectionTitleStyle = {
  margin: 0,
  color: colors.dim,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

// The wide details window both a plugin's Manage window and DeckyHub's own update
// window use: a header (who, what state, how popular), About under it, then the selected
// release's notes on the left and on the right the main action, the version box and
// whatever else the caller adds, most important first.
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
  scan,
  channel,
  prereleaseOnly,
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
  // The selected ZIP's virus scan report, under About and above the actions.
  scan?: ReactNode;
  channel: UpdateChannel;
  // No stable release: the channel menu offers only Pre-release.
  prereleaseOnly?: boolean;
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
  const popClass = usePopClass();
  const experimental = useUiStyle() === "experimental";
  const notes = plainNotes(release?.notes);
  const notesPreview =
    notes.length > NOTES_PREVIEW ? `${notes.slice(0, NOTES_PREVIEW).replace(/\s+\S*$/, "")}…` : notes;
  if (experimental)
    return (
      <WideModalRoot closeModal={closeModal} bAllowFullSize>
        <MotionStyle />
        <div className={popClass}>
          <ExpDetailsLayout
            {...{ t, icon, title, aside, meta, description, release, notesPreview, primary, scan, footer }}
            picker={
              <VersionPicker
                {...{
                  t,
                  channel,
                  prereleaseOnly,
                  onChannelChange,
                  versionOptions,
                  selectedTag,
                  onVersionChange,
                  disabled,
                  error,
                  isEmpty,
                }}
              />
            }
          />
        </div>
      </WideModalRoot>
    );
  return (
    <WideModalRoot closeModal={closeModal} bAllowFullSize>
      <MotionStyle />
      <div className={popClass}>
        <Focusable flow-children="down" className="deckyhub-details" style={{ display: "grid", gap: 18 }}>
          <Focusable
            onActivate={() => {}}
            onFocus={keepInView}
            style={{ display: "flex", alignItems: "center", gap: 18 }}
          >
            {icon}
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 12px" }}>
                <strong style={{ color: colors.text, fontSize: 26, lineHeight: 1.15 }}>{title}</strong>
                {aside && <span style={{ color: colors.dim, fontSize: 14 }}>{aside}</span>}
              </div>
              <div
                className="deckyhub-details-meta"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "6px 14px",
                  color: colors.textSecondary,
                  fontSize: 14,
                }}
              >
                {meta}
              </div>
            </div>
          </Focusable>

          {/* About sits under the header, above the version box, so a narrow window (a Deck's)
              says what the plugin is before asking which version to install. It's on screen
              can also be reached again with the D-pad after scrolling down. */}
          {description && (
            <div className="deckyhub-details-about" style={{ display: "grid", gap: 6 }}>
              <h3 style={sectionTitleStyle}>{t("details.about")}</h3>
              <Focusable
                flow-children="down"
                className="deckyhub-details-description"
                style={{
                  color: "#e6eef4",
                  fontSize: 16,
                  lineHeight: 1.5,
                  overflowWrap: "anywhere",
                  whiteSpace: "pre-wrap",
                }}
              >
                {textSections(description).map((section, index) => (
                  <Focusable key={index} onActivate={() => {}} onFocus={keepInView}>
                    {section}
                  </Focusable>
                ))}
              </Focusable>
            </div>
          )}

          {/* Is it safe? comes before which version and Install: the scan box sits above the actions. */}
          {scan}

          {/* One column, in the order you decide: version, actions, what's new, then links. Every control and
              text section is a D-pad stop in this one flow, so Down walks to the end of the notes (a two-column
              layout left them out of reach on a Deck). Each text section is its own stop because Steam only
              scrolls to follow focus. */}
          <Focusable flow-children="down" style={{ display: "grid", gap: 10 }}>
            <VersionPicker
              {...{
                t,
                channel,
                prereleaseOnly,
                onChannelChange,
                versionOptions,
                selectedTag,
                onVersionChange,
                disabled,
                error,
                isEmpty,
              }}
            />
            {primary}
          </Focusable>

          {release && (
            <div className="deckyhub-details-section">
              <h3 style={sectionTitleStyle}>
                {t("details.whatsNew", { version: displayVersion(release.tag) })}
                {release.publishedAt && (
                  <span style={{ marginLeft: 10, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
                    {new Date(release.publishedAt).toLocaleDateString()}
                  </span>
                )}
              </h3>
              <Focusable
                flow-children="down"
                className="deckyhub-details-notes"
                style={{
                  ...surfaceStyle,
                  padding: "12px 14px",
                  color: colors.textSecondary,
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {textSections(notesPreview || t("appcard.noReleaseNotes")).map((section, index) => (
                  <Focusable
                    key={index}
                    onActivate={() =>
                      showReleaseInfo(t, `${title} ${displayVersion(release.tag)}`, release.publishedAt, release.notes)
                    }
                    onFocus={keepInView}
                  >
                    {section}
                  </Focusable>
                ))}
              </Focusable>
            </div>
          )}

          <Focusable flow-children="down" style={{ display: "grid", gap: 10 }}>
            {footer}
          </Focusable>
        </Focusable>
      </div>
    </WideModalRoot>
  );
}

type VersionPickerProps = {
  t: TFunc;
  channel: UpdateChannel;
  prereleaseOnly?: boolean;
  onChannelChange: (channel: UpdateChannel) => void;
  versionOptions: { data: string; label: string }[];
  selectedTag: string;
  onVersionChange: (tag: string) => void;
  disabled: boolean;
  error?: string | null;
  isEmpty: boolean;
};

// The channel and version menus, with what went wrong loading releases; both UI styles' windows use it.
export function VersionPicker({
  t,
  channel,
  prereleaseOnly,
  onChannelChange,
  versionOptions,
  selectedTag,
  onVersionChange,
  disabled,
  error,
  isEmpty,
}: VersionPickerProps) {
  return (
    <div
      onFocus={keepInView}
      style={{ display: "grid", gap: 4, padding: "8px 12px", background: "rgba(0, 0, 0, 0.2)", borderRadius: 10 }}
    >
      <h3 style={sectionTitleStyle}>{t("settings.version")}</h3>
      {/* Channel and version side by side; the version gets more room for long tags. */}
      <Focusable
        flow-children="right"
        className="deckyhub-version-pickers"
        style={{
          display: "grid",
          gridTemplateColumns: versionOptions.length > 0 ? "minmax(0, 2fr) minmax(0, 3fr)" : "minmax(0, 1fr)",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <DropdownItem
            layout="below"
            bottomSeparator="none"
            label={t("settings.updateChannel")}
            rgOptions={[
              ...(prereleaseOnly ? [] : [{ label: t("settings.stableReleases"), data: "stable" }]),
              { label: t("settings.preReleases"), data: "prerelease" },
            ]}
            selectedOption={channel}
            disabled={disabled}
            onChange={({ data }) => onChannelChange(data as UpdateChannel)}
          />
        </div>
        {versionOptions.length > 0 && (
          <div style={{ minWidth: 0 }}>
            <DropdownItem
              layout="below"
              bottomSeparator="none"
              label={t("settings.version")}
              rgOptions={versionOptions}
              selectedOption={selectedTag}
              disabled={disabled}
              onChange={({ data }) => onVersionChange(String(data))}
            />
          </div>
        )}
      </Focusable>
      {error && <small style={{ color: colors.danger }}>{error}</small>}
      {isEmpty && <small style={{ color: colors.danger }}>{t("settings.noReleasesFound")}</small>}
    </div>
  );
}
