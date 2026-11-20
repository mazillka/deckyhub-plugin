import { Focusable, Navigation } from "@decky/ui";
import type { ReactNode } from "react";
import type { useSettings } from "../hooks/useSettings";
import type { TFunc } from "../i18n/en";
import { ManageRepositoriesPage } from "../pages/ManageRepositoriesPage";
import { AboutSection } from "./AboutSection";
import { BackupsSection } from "./BackupsSection";
import { GitHubAccessSection } from "./GitHubAccessSection";
import { LeftoversSection } from "./LeftoversSection";
import type { Layout } from "./LayoutToggle";
import { DisplaySection, DownloadsSection, LanguageSection, TroubleshootingSection } from "./SettingsSections";

export type SettingsTab = "general" | "github" | "downloads" | "repositories" | "troubleshoot" | "about";

// A tab's sections, one under another (Down moves through them).
// B leaves Settings in one press: Steam's tabs would spend the first B moving focus
// up to the tab bar (seen on a Deck).
const stack = (...sections: ReactNode[]) => (
  <Focusable
    flow-children="down"
    className="deckyhub-settings-stack"
    onCancelButton={() => Navigation.NavigateBack()}
    style={{ display: "block", paddingTop: 8 }}
  >
    {sections}
  </Focusable>
);

// The six tabs. Each tab's content says which tab it is, for tests on a Deck (Steam's own classes are minified).
export function settingsTabs(
  t: TFunc,
  s: ReturnType<typeof useSettings>,
  layout: { value: Layout; onChange: (layout: Layout) => void; listOnly: boolean },
) {
  const { settings, update } = s;
  return (
    [
      {
        id: "general",
        title: t("settings.tabGeneral"),
        content: stack(
          <LanguageSection key="language" settings={settings} update={update} />,
          <DisplaySection
            key="display"
            settings={settings}
            update={update}
            layout={layout.value}
            onLayout={layout.onChange}
            listOnly={layout.listOnly}
          />,
        ),
      },
      {
        id: "github",
        // Just "GitHub" in every language: "Доступ до GitHub" overflowed Steam's tab bar.
        title: "GitHub",
        content: stack(
          <GitHubAccessSection
            key="github"
            quota={s.quota}
            tokenDraft={s.tokenDraft}
            onTokenDraft={s.setTokenDraft}
            savedToken={settings.githubToken}
            update={update}
          />,
        ),
      },
      {
        id: "downloads",
        title: t("settings.tabDownloads"),
        content: <DownloadsSection settings={settings} update={update} />,
      },
      {
        id: "repositories",
        title: t("nav.repositories"),
        content: stack(<ManageRepositoriesPage key="repositories" embedded />),
      },
      {
        id: "troubleshoot",
        title: t("settings.tabTroubleshoot"),
        content: stack(
          <BackupsSection key="backups" settings={settings} update={update} />,
          <LeftoversSection key="leftovers" />,
          <TroubleshootingSection key="troubleshooting" />,
        ),
      },
      {
        id: "about",
        // Tab names are kept short: six have to fit Steam's tab bar in every language.
        title: t("settings.tabAbout"),
        content: stack(<AboutSection key="about" />),
      },
    ] as const
  ).map((tab) => ({ ...tab, content: <div className={`deckyhub-settings-${tab.id}`}>{tab.content}</div> }));
}
