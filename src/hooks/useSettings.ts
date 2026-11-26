import { useEffect, useRef, useState } from "react";
import { getSettings, saveSettings } from "../api";
import { setQuickAccessTab } from "../components/QuickAccessTab";
import { LOCALE_CHANGED } from "../i18n";
import type { Settings } from "../types";
import { DEFAULT_COLUMNS_PER_ROW, githubCoreQuota, setGithubToken } from "../utils";

const DEFAULTS: Settings = {
  overwriteExisting: true,
  backupBeforeChange: true,
  updateChannel: "stable",
  registryChannel: "stable",
  language: "auto",
  columnsPerRow: DEFAULT_COLUMNS_PER_ROW,
  githubToken: "",
  density: "default",
  haptics: true,
  navSound: true,
  quickAccessTab: true,
  uiStyle: "default",
  hiddenButtons: [],
};

// The settings the Settings page edits: loaded once, saved on every change, plus the GitHub token field
// and the rate-limit quota it unlocks.
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  // The token field saves on an explicit button, not per keystroke like the other settings — typing a
  // 40+ character token would otherwise fire a save on every keystroke. This tracks the field independently
  // of the committed `settings.githubToken` until that button is pressed.
  const [tokenDraft, setTokenDraft] = useState("");
  const [quota, setQuota] = useState<Awaited<ReturnType<typeof githubCoreQuota>>>(null);
  const refreshQuota = () => void githubCoreQuota().then(setQuota, () => setQuota(null));

  // The newest settings the page knows of, and which save is the newest: toggles pressed one after another
  // each merge into the previous one, and a slower earlier save must not put its older copy back.
  const latest = useRef(settings);
  const saves = useRef(0);

  useEffect(() => {
    void getSettings().then((loaded) => {
      latest.current = loaded;
      setSettings(loaded);
      // Keep anything typed before this load resolved instead of clobbering it.
      setTokenDraft((draft) => draft || loaded.githubToken);
      // Prime the token here too so the quota reflects it, rather than racing
      // I18nProvider's own priming of the same value.
      setGithubToken(loaded.githubToken);
      refreshQuota();
    });
  }, []);

  const update = (next: Partial<Settings>) => {
    const merged = { ...latest.current, ...next };
    latest.current = merged;
    setSettings(merged);
    const save = ++saves.current;
    void saveSettings(merged).then((saved) => {
      if (save === saves.current) {
        latest.current = saved;
        setSettings(saved);
      }
      if ("githubToken" in next) {
        setTokenDraft(saved.githubToken);
        setGithubToken(saved.githubToken);
        refreshQuota();
      }
      if ("quickAccessTab" in next) setQuickAccessTab(saved.quickAccessTab);
      // Every mounted I18nProvider (one per route) re-syncs both the locale
      // and the GitHub token off this event — see i18n/index.tsx.
      if ("language" in next || "githubToken" in next || "density" in next || "haptics" in next || "navSound" in next)
        window.dispatchEvent(new Event(LOCALE_CHANGED));
    });
  };

  return { settings, update, tokenDraft, setTokenDraft, quota };
}
