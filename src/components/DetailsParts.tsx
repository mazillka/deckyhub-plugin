import { DialogButton, DropdownItem, Focusable } from "@decky/ui";
import { createContext, useCallback, useState, type ReactNode } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import type { UpdateChannel } from "../types";
import { surfaceStyle } from "../utils";
import { displayVersion } from "../version";
import { keepInView } from "./KeepInView";
import { showReleaseInfo, textSections } from "./ReleaseInfo";

export const sectionTitleStyle = {
  margin: 0,
  color: colors.dim,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

// The window's icon, title and meta line: one focus target, so the D-pad stops once on the header.
export function DetailsHeader({
  icon,
  title,
  aside,
  meta,
}: {
  icon: ReactNode;
  title: string;
  // Beside the title (a plugin's repository).
  aside?: string;
  // The line under the title: category, version, stats, badges.
  meta: ReactNode;
}) {
  return (
    <Focusable onActivate={() => {}} onFocus={keepInView} style={{ display: "flex", alignItems: "center", gap: 18 }}>
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
  );
}

// About sits under the header, above the version box, so a narrow window (a Deck's)
// says what the plugin is before asking which version to install. Each section is a D-pad stop.
export function DetailsAbout({ t, description }: { t: TFunc; description: string }) {
  return (
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
  );
}

export type VersionPickerProps = {
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
  // Inside a row that already has the title.
  bare?: boolean;
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
  bare,
}: VersionPickerProps) {
  return (
    <div
      onFocus={keepInView}
      style={{ display: "grid", gap: 4, padding: "8px 12px", background: "rgba(0, 0, 0, 0.2)", borderRadius: 10 }}
    >
      {!bare && <h3 style={sectionTitleStyle}>{t("settings.version")}</h3>}
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

// The selected release's notes; each text section is its own D-pad stop (Steam only scrolls to follow focus),
// and OK on one opens them in full.
export function ReleaseNotes({
  t,
  title,
  release,
  notesPreview,
}: {
  t: TFunc;
  title: string;
  release: { tag: string; publishedAt: string | null; notes?: string };
  notesPreview: string;
}) {
  return (
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
  );
}

// A row that opens and closes its content (the scan report, the version menus, the release notes) with A.
// Closed, it shows its title and a short hint, so the window stays one screen and nothing is hidden for good.
// keepMounted: the content loads while the row is closed (the scan report), and may call the
// context's expand() to open the row itself when it has something to show (flags, a pending scan).
export const ExpandRowContext = createContext<(() => void) | null>(null);
export function DetailsRow({
  title,
  hint,
  keepMounted = false,
  children,
}: {
  title: string;
  hint?: string;
  keepMounted?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const expand = useCallback(() => setOpen(true), []);
  return (
    <div className="deckyhub-details-row" style={{ display: "grid", gap: 10 }}>
      <div onFocus={keepInView} data-details-toggle="">
        <DialogButton
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "10px 14px" }}
        >
          <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{title}</span>
          {hint && <small style={{ color: colors.dim, whiteSpace: "nowrap" }}>{hint}</small>}
          {open ? <FaChevronDown /> : <FaChevronRight />}
        </DialogButton>
      </div>
      {(open || keepMounted) && (
        <ExpandRowContext.Provider value={expand}>
          <div style={open ? undefined : { display: "none" }}>{children}</div>
        </ExpandRowContext.Provider>
      )}
    </div>
  );
}
