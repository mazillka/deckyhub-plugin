import { Tabs } from "@decky/ui";
import { useState } from "react";
import { FaCog } from "react-icons/fa";
import { PageHeader } from "../components/Card";
import { V2Settings } from "../components/v2/V2Settings";
import { ExpSettings } from "../components/experimental/ExpSettings";
import { useUiStyle } from "../uiStyle";
import { useLayout } from "../components/LayoutToggle";
import { useT } from "../i18n";
import { settingsTabs, type SettingsTab } from "../components/settingsTabs";
import { useSettings } from "../hooks/useSettings";
import { takeNextTab } from "../settingsNav";

export function SettingsPage({ initialTab }: { initialTab?: SettingsTab }) {
  const t = useT();
  // Experimental swaps Steam's tab bar for a side menu (ExpSettings).
  const style = useUiStyle();
  const [layout, setLayout] = useLayout();
  const [tab, setTab] = useState<SettingsTab>(() => {
    const opening = takeNextTab();
    return initialTab ?? opening;
  });
  const tabs = settingsTabs(t, useSettings(), {
    value: layout,
    onChange: setLayout,
    listOnly: style !== "default",
  });

  // Experimental V2: a section list and a pane under V2's own tab bar (its frame), so no header or Steam tabs.
  if (style === "v2") return <V2Settings tabs={tabs} active={tab} onSelect={setTab} />;
  if (style === "experimental") return <ExpSettings tabs={tabs} active={tab} onSelect={setTab} />;

  return (
    <>
      <PageHeader icon={<FaCog />} title={t("nav.settings")} />
      {/* Steam's tabs (L1 / R1): each fits about one screen, instead of one long page.
          They reach down to Steam's bottom bar (into the page's bottom padding, which
          the negative margin gives back so the page itself doesn't scroll); their
          content scrolls inside. */}
      {/* overflow clip: Steam slides the old and new tab side by side when switching, and
          focusing into the sliding one scrolled this box sideways, tab bar and all. A box
          that only hides its overflow can still be scrolled that way (seen on a Deck). */}
      <div
        className="deckyhub-settings-tabs"
        style={{ height: "calc(100% - 16px)", marginBottom: -56, overflow: "clip" }}
      >
        <Tabs activeTab={tab} onShowTab={(id: string) => setTab(id as SettingsTab)} autoFocusContents tabs={tabs} />
      </div>
    </>
  );
}
