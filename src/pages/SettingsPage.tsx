import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, ConfirmModal, DropdownItem, PanelSection, PanelSectionRow, showModal, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import { clearDownloads, getSettings, listDownloads, saveSettings } from "../api";
import { LOCALE_CHANGED, LOCALES, useT } from "../i18n";
import type { Settings } from "../types";
import { compactButtonStyle, sectionDividerStyle } from "../utils";

export function SettingsPage() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>({ verifySha256: true, overwriteExisting: true, updateChannel: "stable", language: "auto" });
  const [downloads, setDownloads] = useState<{ name: string; directory: boolean }[]>([]);

  const refreshDownloads = () => void listDownloads().then(({ items }) => setDownloads(items));

  useEffect(() => {
    void getSettings().then(setSettings);
    refreshDownloads();
  }, []);

  const update = (next: Partial<Settings>) => {
    const merged = { ...settings, ...next };
    setSettings(merged);
    void saveSettings(merged).then((saved) => {
      setSettings(saved);
      if ("language" in next) window.dispatchEvent(new Event(LOCALE_CHANGED));
    });
  };

  const confirmClearDownloads = () =>
    showModal(
      <ConfirmModal
        strTitle={t("settings.clearDownloadsTitle")}
        strDescription={t("settings.clearDownloadsDescription")}
        strOKButtonText={t("settings.clearDownloads")}
        bDestructiveWarning
        onOK={() => void clearDownloads().then(({ removed }) => {
          setDownloads([]);
          toaster.toast({ title: "DeckyHub", body: t("settings.downloadsCleared", { count: removed }) });
        })}
      />
    );

  return (
    <>
      <PanelSection title={t("settings.deckyhubUpdate")}>
        <PanelSectionRow>
          <DropdownItem
            label={t("settings.updateChannel")}
            rgOptions={[
              { label: t("settings.stableReleases"), data: "stable" },
              { label: t("settings.preReleases"), data: "prerelease" },
            ]}
            selectedOption={settings.updateChannel}
            onChange={({ data }) => update({ updateChannel: data })}
          />
        </PanelSectionRow>
      </PanelSection>

      <div aria-hidden style={sectionDividerStyle} />

      <PanelSection title={t("settings.downloadSettings")}>
        <PanelSectionRow><small>{t("settings.whereZipsSaved")}</small></PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <ToggleField label={t("settings.verifySha256")} checked={settings.verifySha256} onChange={(checked) => update({ verifySha256: checked })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label={t("settings.overwriteExisting")} checked={settings.overwriteExisting} onChange={(checked) => update({ overwriteExisting: checked })} />
        </PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={confirmClearDownloads}>
            {t("settings.clearDownloads")}
          </Button>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={{ padding: "4px 0" }}>
            <strong>Downloaded items</strong>
            {downloads.length ? downloads.map((item) => <div key={item.name}><small>{item.name}{item.directory ? "/" : ""}</small></div>) : <div><small>No downloaded items.</small></div>}
          </div>
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
    </>
  );
}
