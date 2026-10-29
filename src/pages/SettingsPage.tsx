import { Focusable } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaCog } from "react-icons/fa";
import { getSettings, saveSettings } from "../api";
import { PageHeader } from "../components/Card";
import { DisplaySection, DownloadsSection, GitHubAccessSection, LanguageSection, RepositoriesSection } from "../components/SettingsSections";
import { useLayout } from "../components/LayoutToggle";
import { LOCALE_CHANGED, useT } from "../i18n";
import type { Settings } from "../types";
import { DEFAULT_COLUMNS_PER_ROW, githubCoreQuota, setGithubToken } from "../utils";

export function SettingsPage() {
  const t = useT();
  const [layout, setLayout] = useLayout();
  const [settings, setSettings] = useState<Settings>({ overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: DEFAULT_COLUMNS_PER_ROW, githubToken: "", density: "default", haptics: true, hiddenButtons: [] });
  // The token field saves on an explicit button (below), not per keystroke
  // like the other settings — typing a 40+ character token would otherwise
  // fire a save on every keystroke. This tracks the field independently of
  // the committed `settings.githubToken` until that button is pressed.
  const [tokenDraft, setTokenDraft] = useState("");
  const [quota, setQuota] = useState<Awaited<ReturnType<typeof githubCoreQuota>>>(null);
  const refreshQuota = () => void githubCoreQuota().then(setQuota, () => setQuota(null));

  useEffect(() => {
    void getSettings().then((loaded) => {
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
    const merged = { ...settings, ...next };
    setSettings(merged);
    void saveSettings(merged).then((saved) => {
      setSettings(saved);
      if ("githubToken" in next) {
        setTokenDraft(saved.githubToken);
        setGithubToken(saved.githubToken);
        refreshQuota();
      }
      // Every mounted I18nProvider (one per route) re-syncs both the locale
      // and the GitHub token off this event — see i18n/index.tsx.
      if ("language" in next || "githubToken" in next || "density" in next || "haptics" in next) window.dispatchEvent(new Event(LOCALE_CHANGED));
    });
  };

  return (
    <>
      <PageHeader icon={<FaCog />} title={t("nav.settings")} />
      {/* Two columns, so the whole page fits about one Deck screen; Left / Right move between them. */}
      <Focusable flow-children="right" className="deckyhub-settings-columns" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "var(--dh-card-gap, 14px)", alignItems: "start" }}>
        <Focusable flow-children="down" style={{ display: "block", minWidth: 0 }}>
          <GitHubAccessSection quota={quota} tokenDraft={tokenDraft} onTokenDraft={setTokenDraft} savedToken={settings.githubToken} update={update} />
          <RepositoriesSection />
          <DownloadsSection settings={settings} update={update} />
        </Focusable>
        <Focusable flow-children="down" style={{ display: "block", minWidth: 0 }}>
          <LanguageSection settings={settings} update={update} />
          <DisplaySection settings={settings} update={update} layout={layout} onLayout={setLayout} />
        </Focusable>
      </Focusable>
    </>
  );
}
