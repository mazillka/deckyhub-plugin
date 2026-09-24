import { DropdownItem } from "@decky/ui";
import type { TFunc } from "../i18n/en";
import type { UpdateChannel } from "../types";

// Shared by DeckyHubUpdateModal and AppDetailsModal: the title/subtitle
// header plus the channel+version dropdown box and its error/empty
// messages are identical between the two (one picks DeckyHub's own
// releases, the other a tracked app's) — only what surrounds this panel
// (the primary action buttons) actually differs between them.
export function VersionPickerPanel({
  t,
  title,
  subtitle,
  channel,
  onChannelChange,
  versionOptions,
  selectedTag,
  onVersionChange,
  disabled,
  error,
  isEmpty,
}: {
  t: TFunc;
  title: string;
  subtitle: string;
  channel: UpdateChannel;
  onChannelChange: (channel: UpdateChannel) => void;
  versionOptions: { data: string; label: string }[];
  selectedTag: string;
  onVersionChange: (tag: string) => void;
  disabled: boolean;
  error?: string | null;
  isEmpty: boolean;
}) {
  return (
    <>
      <strong style={{ fontSize: 16 }}>{title}</strong>
      <div style={{ fontSize: 13, opacity: 0.75 }}>{subtitle}</div>

      <div style={{ display: "grid", gap: 8, padding: 12, background: "rgba(0, 0, 0, 0.2)", borderRadius: 8 }}>
        <DropdownItem
          label={t("settings.updateChannel")}
          rgOptions={[
            { label: t("settings.stableReleases"), data: "stable" },
            { label: t("settings.preReleases"), data: "prerelease" },
          ]}
          selectedOption={channel}
          disabled={disabled}
          onChange={({ data }) => onChannelChange(data as UpdateChannel)}
        />
        {versionOptions.length > 0 && (
          <DropdownItem label={t("settings.version")} rgOptions={versionOptions} selectedOption={selectedTag} disabled={disabled} onChange={({ data }) => onVersionChange(String(data))} />
        )}
      </div>

      {error && <small style={{ color: "#ff6b6b" }}>{error}</small>}
      {isEmpty && <small style={{ color: "#ff6b6b" }}>{t("settings.noReleasesFound")}</small>}
    </>
  );
}
