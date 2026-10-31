import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import { openExternalWeb } from "../external";
import { useEffect, useRef, useState } from "react";
import { FaExternalLinkAlt, FaGithub, FaSync } from "react-icons/fa";
import type { TFunc } from "../i18n/en";
import type { UpdateChannel } from "../types";
import { modalButtonStyle } from "../utils";
import { inChannel } from "../version";

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
const actionButtonStyle = { ...modalButtonStyle, width: "auto", flex: "1 1 auto", whiteSpace: "nowrap" as const };

export function ReleaseActions({ t, url, repoUrl, hideReleasePage, checking, disabled, onCheck, closeModal }: { t: TFunc; url?: string; repoUrl?: string; hideReleasePage: boolean; checking: boolean; disabled: boolean; onCheck: () => void; closeModal?: () => void }) {
  // Close first: Steam's browser otherwise opens underneath this modal.
  const open = (target: string) => {
    closeModal?.();
    openExternalWeb(target);
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
