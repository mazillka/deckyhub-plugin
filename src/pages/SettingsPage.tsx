import { Focusable, Navigation, Tabs } from "@decky/ui";
import { useEffect, useState, type ReactNode } from "react";
import { FaCog } from "react-icons/fa";
import { getSettings, saveSettings } from "../api";
import { PageHeader } from "../components/Card";
import { AboutSection } from "../components/AboutSection";
import { DisplaySection, DownloadsSection, GitHubAccessSection, LanguageSection, TroubleshootingSection } from "../components/SettingsSections";
import { ManageRepositoriesPage } from "./ManageRepositoriesPage";
import { useLayout } from "../components/LayoutToggle";
import { LOCALE_CHANGED, useT } from "../i18n";
import type { Settings } from "../types";
import { DEFAULT_COLUMNS_PER_ROW, githubCoreQuota, setGithubToken } from "../utils";

export function SettingsPage({ initialTab }: { initialTab?: SettingsTab }) {
  const t = useT();
  const [layout, setLayout] = useLayout();
  const [tab, setTab] = useState<SettingsTab>(() => {
    const opening = initialTab ?? nextTab;
    nextTab = "general";
    return opening;
  });
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

  // A tab's sections, one under another (Down moves through them).
  const stack = (...sections: ReactNode[]) => (
    <Focusable flow-children="down" className="deckyhub-settings-stack" style={{ display: "block", paddingTop: 8 }}>{sections}</Focusable>
  );

  return (
    <>
      <PageHeader icon={<FaCog />} title={t("nav.settings")} />
      {/* Steam's tabs (L1 / R1): each fits about one screen, instead of one long page.
          They reach down to Steam's bottom bar (into the page's bottom padding, which
          the negative margin gives back so the page itself doesn't scroll); their
          content scrolls inside. */}
      <div className="deckyhub-settings-tabs" style={{ height: "calc(100% - 16px)", marginBottom: -56 }}>
        <Tabs
          activeTab={tab}
          onShowTab={(id: string) => setTab(id as SettingsTab)}
          autoFocusContents
          tabs={([
            {
              id: "general",
              title: t("settings.tabGeneral"),
              content: stack(<LanguageSection key="language" settings={settings} update={update} />, <DisplaySection key="display" settings={settings} update={update} layout={layout} onLayout={setLayout} />),
            },
            {
              id: "github",
              // Just "GitHub" in every language: "Доступ до GitHub" overflowed Steam's tab bar.
              title: "GitHub",
              content: stack(<GitHubAccessSection key="github" quota={quota} tokenDraft={tokenDraft} onTokenDraft={setTokenDraft} savedToken={settings.githubToken} update={update} />),
            },
            {
              id: "downloads",
              title: t("settings.tabDownloads"),
              content: stack(<DownloadsSection key="downloads" settings={settings} update={update} />),
            },
            {
              id: "repositories",
              title: t("nav.repositories"),
              content: stack(<ManageRepositoriesPage key="repositories" embedded />),
            },
            {
              id: "about",
              title: t("settings.about"),
              content: stack(<AboutSection key="about" />, <TroubleshootingSection key="troubleshooting" />),
            },
            // Each tab's content says which tab it is, for tests on a Deck (Steam's own classes are minified).
          ] as const).map((tab) => ({ ...tab, content: <div className={`deckyhub-settings-${tab.id}`}>{tab.content}</div> }))}
        />
      </div>
    </>
  );
}

export type SettingsTab = "general" | "github" | "downloads" | "repositories" | "about";
// The tab Settings opens on next, for links into a particular one (the rate-limit
// banner's Open Settings goes to GitHub Access).
let nextTab: SettingsTab = "general";
export function openSettings(tab: SettingsTab = "general") {
  nextTab = tab;
  Navigation.Navigate("/deckyhub/settings");
}
