import { DialogButtonPrimary as Button, DropdownItem, Focusable, Navigation } from "@decky/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FaExternalLinkAlt, FaGithub, FaSync } from "react-icons/fa";
import type { TFunc } from "../i18n/en";
import type { UpdateChannel } from "../types";
import { modalButtonStyle, windowGap } from "../utils";
import { inChannel } from "../version";
import { keepInView } from "./KeepInView";

// Shared by both version pickers: the channel's releases and the selected one.
// A load keeps the current selection while it's still listed, except a forced
// "Check for Updates" (pinLatest), which jumps to the newest on purpose.
export function useReleasePicker<T extends { tag: string; prerelease: boolean }>(fetchReleases: (force: boolean) => Promise<{ items: T[]; error?: string }>, channel: UpdateChannel) {
  const [items, setItems] = useState<T[]>([]);
  const [selectedTag, setSelectedTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped per load() so a slower load for a channel switched away from can't
  // overwrite the newer one.
  const loadRun = useRef(0);

  const load = async (pinLatest = false) => {
    const run = ++loadRun.current;
    setLoading(true);
    const result = await fetchReleases(pinLatest);
    if (run !== loadRun.current) return;
    const filtered = result.items.filter((item) => inChannel(item, channel));
    setItems(filtered);
    setError(result.error ?? null);
    setSelectedTag((current) => (!pinLatest && filtered.some((item) => item.tag === current) ? current : filtered[0]?.tag ?? ""));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [channel]);

  return { items, selectedTag, setSelectedTag, loading, error, setError, load, selected: items.find((item) => item.tag === selectedTag) ?? null };
}

// The Release Page + Check for Updates row both version pickers end with.
const actionButtonStyle = { ...modalButtonStyle, flex: "1 1 auto", whiteSpace: "nowrap" as const };

export function ReleaseActions({ t, url, repoUrl, hideReleasePage, checking, disabled, onCheck, closeModal }: { t: TFunc; url?: string; repoUrl?: string; hideReleasePage: boolean; checking: boolean; disabled: boolean; onCheck: () => void; closeModal?: () => void }) {
  // Close first: Steam's browser otherwise opens underneath this modal.
  const open = (target: string) => {
    closeModal?.();
    Navigation.NavigateToExternalWeb(target);
  };
  return (
    // A button too narrow for its label moves to the next row rather than wrapping it.
    <Focusable flow-children="right" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {url && !hideReleasePage && (
        <Button style={actionButtonStyle} onClick={() => open(url)}>
          <FaExternalLinkAlt /> {t("appcard.releasePage")}
        </Button>
      )}
      {repoUrl && (
        <Button style={actionButtonStyle} onClick={() => open(repoUrl)}>
          <FaGithub /> {t("appcard.repository")}
        </Button>
      )}
      <Button style={actionButtonStyle} disabled={disabled} onClick={onCheck}>
        <FaSync /> {checking ? t("settings.checkingUpdate") : t("settings.checkUpdate")}
      </Button>
    </Focusable>
  );
}

// Shared by DeckyHubUpdateModal and AppDetailsModal: the title/subtitle
// header plus the channel+version dropdown box and its error/empty
// messages are identical between the two (one picks DeckyHub's own
// releases, the other a tracked app's) — only what surrounds this panel
// (the primary action buttons) actually differs between them.
export function VersionPickerPanel({
  t,
  icon,
  title,
  subtitle,
  description,
  details,
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
  icon: ReactNode;
  title: string;
  subtitle: string;
  // The plugin's description in full (cards clamp it to two lines).
  description?: string;
  // Extra lines under the description (category, repo, stats, badges).
  details?: ReactNode;
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
      <div onFocus={keepInView} style={{ display: "grid", gap: windowGap }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {icon}
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: "block", color: "#fff", fontSize: 18 }}>{title}</strong>
            <div style={{ color: "#b8c7d3", fontSize: 13 }}>{subtitle}</div>
          </div>
        </div>
        {description && <div className="deckyhub-details-description" style={{ color: "#b8c7d3", fontSize: 14, lineHeight: 1.4, overflowWrap: "anywhere" }}>{description}</div>}
        {details}

        <div style={{ display: "grid", gap: 8, padding: 12, background: "rgba(0, 0, 0, 0.2)", borderRadius: 8 }}>
          {/* Inline label + no separator: Steam's dropdown height is fixed, so
              this is what keeps each row short. */}
          <DropdownItem
            layout="inline"
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
          {versionOptions.length > 0 && (
            <DropdownItem layout="inline" bottomSeparator="none" label={t("settings.version")} rgOptions={versionOptions} selectedOption={selectedTag} disabled={disabled} onChange={({ data }) => onVersionChange(String(data))} />
          )}
        </div>
      </div>

      {error && <small style={{ color: "#ff6b6b" }}>{error}</small>}
      {isEmpty && <small style={{ color: "#ff6b6b" }}>{t("settings.noReleasesFound")}</small>}
    </>
  );
}
