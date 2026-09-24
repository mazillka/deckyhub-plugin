import { DropdownItem, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "../api";
import { LOCALE_CHANGED, LOCALES, useT } from "../i18n";
import type { Settings } from "../types";
import { DEFAULT_COLUMNS_PER_ROW, sectionDividerStyle } from "../utils";

export function SettingsPage() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>({ overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: DEFAULT_COLUMNS_PER_ROW });

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  const update = (next: Partial<Settings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    void saveSettings(merged).then((saved) => {
      setSettings(saved);
      if ("language" in next) window.dispatchEvent(new Event(LOCALE_CHANGED));
    });
  };

  return (
    <>
      <PanelSection title={t("settings.downloadSettings")}>
        <PanelSectionRow>
          <div style={{ display: "grid", gap: 8 }}>
            <small>{t("settings.whereZipsSaved")}</small>
            <div style={{ borderLeft: "3px solid #1a9fff", paddingLeft: 10 }}>
              <div style={{ color: "#8fcef4", fontSize: "0.9em", marginBottom: 3 }}>{t("dl.installInDecky")}</div>
              <strong style={{ color: "#fff" }}>{t("dl.installPath")}</strong>
            </div>
          </div>
        </PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <ToggleField label={t("settings.overwriteExisting")} checked={settings.overwriteExisting} onChange={(checked) => update({ overwriteExisting: checked })} />
        </PanelSectionRow>
      </PanelSection>

      <div aria-hidden style={sectionDividerStyle} />

      <PanelSection title={t("settings.language")}>
        <PanelSectionRow>
          <DropdownItem
            label={t("settings.language")}
            rgOptions={[{ label: t("settings.autoDetect"), data: "auto" }, ...LOCALES.map((locale) => ({ label: locale.label, data: locale.code }))]}
            selectedOption={settings.language}
            onChange={({ data }) => update({ language: data })}
          />
        </PanelSectionRow>
      </PanelSection>

      <div aria-hidden style={sectionDividerStyle} />

      <PanelSection title={t("settings.displaySettings")}>
        <PanelSectionRow>
          <DropdownItem
            label={t("settings.itemsPerRow")}
            rgOptions={[1, 2, 3].map((count) => ({ label: String(count), data: count }))}
            selectedOption={settings.columnsPerRow}
            onChange={({ data }) => update({ columnsPerRow: data })}
          />
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}
