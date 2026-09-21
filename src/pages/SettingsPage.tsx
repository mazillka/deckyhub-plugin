import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, ConfirmModal, DropdownItem, PanelSection, PanelSectionRow, showModal, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import { clearDownloads, getSettings, listDownloads, saveSettings } from "../api";
import { LOCALE_CHANGED, LOCALES, useT } from "../i18n";
import type { Settings } from "../types";
import { compactButtonStyle, DEFAULT_COLUMNS_PER_ROW, sectionDividerStyle } from "../utils";

const CLEAR_LIST_LIMIT = 50;

export function SettingsPage() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>({ verifySha256: true, overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: DEFAULT_COLUMNS_PER_ROW });
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
        strDescription={
          <>
            {t("settings.clearDownloadsDescription")}
            {downloads.length > 0 && (
              <div style={{ margin: "8px 0 0", color: "#6bcb6b" }}>
                {downloads.slice(0, CLEAR_LIST_LIMIT).map((item, index) => (
                  <span key={item.name}>{index ? " · " : ""}{item.name}{item.directory ? "/" : ""}</span>
                ))}
                {downloads.length > CLEAR_LIST_LIMIT && <span> · +{downloads.length - CLEAR_LIST_LIMIT} more</span>}
              </div>
            )}
          </>
        }
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
            {downloads.length ? <small style={{ display: "block", maxHeight: 56, overflowY: "auto", lineHeight: 1.35 }}>{downloads.map((item, index) => <span key={item.name}>{index ? " · " : ""}<span style={{ color: "#6bcb6b" }}>{item.name}{item.directory ? "/" : ""}</span></span>)}</small> : <div><small>No downloaded items.</small></div>}
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
