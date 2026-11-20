import { usePopClass, useUiStyle } from "../uiStyle";
import { ExpDetailsLayout } from "./experimental/ExpDetailsLayout";
import { Focusable } from "@decky/ui";
import { WideModalRoot } from "./WideModal";
import type { ReactNode } from "react";
import type { TFunc } from "../i18n/en";
import { MotionStyle } from "../motion";
import type { UpdateChannel } from "../types";
import { displayVersion } from "../version";
import { plainNotes } from "./ReleaseInfo";
import {
  DetailsAbout,
  DetailsHeader,
  DetailsRow,
  ReleaseNotes,
  sectionTitleStyle,
  VersionPicker,
} from "./DetailsParts";
import type { VersionPickerProps } from "./DetailsParts";

// How much of the release notes the window shows (nearly always all of it); Y on the main button opens them in full.
const NOTES_PREVIEW = 6000;

type DetailsWindowProps = {
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
  // collapsible: the full scan report, which then sits in a row of its own under the actions.
  report?: ReactNode;
  // A plugin's Manage window: what to know and the actions first, the scan report, versions and release
  // notes behind rows you open, so the window fits a Deck's screen instead of running three screens long.
  collapsible?: boolean;
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
  hideVersionPicker?: boolean;
};

// What the bodies below share: the window's props, the version menus' props and the release notes shown.
type BodyProps = { window: DetailsWindowProps; picker: VersionPickerProps; notesPreview: string };

// The wide details window both a plugin's Manage window and DeckyHub's own update
// window use: a header (who, what state, how popular), About under it, then the selected
// release's notes on the left and on the right the main action, the version box and
// whatever else the caller adds, most important first.
export function DetailsWindow(props: DetailsWindowProps) {
  const { t, closeModal, icon, title, aside, meta, description, release, primary, scan, report, footer } = props;
  const popClass = usePopClass();
  const experimental = useUiStyle() === "experimental";
  const notes = plainNotes(release?.notes);
  const notesPreview =
    notes.length > NOTES_PREVIEW ? `${notes.slice(0, NOTES_PREVIEW).replace(/\s+\S*$/, "")}…` : notes;
  const picker: VersionPickerProps = {
    t,
    channel: props.channel,
    prereleaseOnly: props.prereleaseOnly,
    onChannelChange: props.onChannelChange,
    versionOptions: props.versionOptions,
    selectedTag: props.selectedTag,
    onVersionChange: props.onVersionChange,
    disabled: props.disabled,
    error: props.error,
    isEmpty: props.isEmpty,
  };
  return (
    <WideModalRoot closeModal={closeModal} bAllowFullSize>
      <MotionStyle />
      <div className={popClass}>
        {experimental ? (
          <ExpDetailsLayout
            {...{ t, icon, title, aside, meta, description, release, notesPreview, primary, footer }}
            scan={
              <>
                {scan}
                {report}
              </>
            }
            picker={!props.hideVersionPicker && <VersionPicker {...picker} />}
          />
        ) : (
          <Focusable flow-children="down" className="deckyhub-details" style={{ display: "grid", gap: 18 }}>
            <DetailsHeader icon={icon} title={title} aside={aside} meta={meta} />
            {description && <DetailsAbout t={t} description={description} />}
            {/* Is it safe? comes before which version and Install: the scan box sits above the actions. */}
            {scan}
            {props.collapsible ? (
              <CollapsibleBody window={props} picker={picker} notesPreview={notesPreview} />
            ) : (
              <FlatBody window={props} picker={picker} notesPreview={notesPreview} />
            )}
          </Focusable>
        )}
      </div>
    </WideModalRoot>
  );
}

// The Manage window: the actions first, then rows to open for the scan report, versions and notes.
function CollapsibleBody({ window: w, picker, notesPreview }: BodyProps) {
  const { t, release } = w;
  return (
    <>
      <Focusable flow-children="down" style={{ display: "grid", gap: 10 }}>
        {w.primary}
      </Focusable>
      <Focusable flow-children="down" style={{ display: "grid", gap: 8 }}>
        {w.report && (
          <DetailsRow title={t("scan.viewReport")} keepMounted>
            {w.report}
          </DetailsRow>
        )}
        {!w.hideVersionPicker && (
          <DetailsRow
            title={t("settings.version")}
            hint={w.versionOptions.find((option) => option.data === w.selectedTag)?.label}
          >
            <VersionPicker {...picker} bare />
          </DetailsRow>
        )}
        {release && (
          <DetailsRow
            title={t("details.whatsNew", { version: displayVersion(release.tag) })}
            hint={release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : undefined}
          >
            <ReleaseNotes t={t} title={w.title} release={release} notesPreview={notesPreview} />
          </DetailsRow>
        )}
      </Focusable>
      <Focusable flow-children="down" style={{ display: "grid", gap: 10 }}>
        {w.footer}
      </Focusable>
    </>
  );
}

// DeckyHub's own update window: everything open, in one column.
function FlatBody({ window: w, picker, notesPreview }: BodyProps) {
  const { t, release } = w;
  return (
    // One column, in the order you decide: version, actions, what's new, then links. Every control and
    // text section is a D-pad stop in this one flow, so Down walks to the end of the notes (a two-column
    // layout left them out of reach on a Deck). Each text section is its own stop because Steam only
    // scrolls to follow focus.
    <>
      <Focusable flow-children="down" style={{ display: "grid", gap: 10 }}>
        {!w.hideVersionPicker && <VersionPicker {...picker} />}
        {w.primary}
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
          <ReleaseNotes t={t} title={w.title} release={release} notesPreview={notesPreview} />
        </div>
      )}

      <Focusable flow-children="down" style={{ display: "grid", gap: 10 }}>
        {w.footer}
      </Focusable>
    </>
  );
}
