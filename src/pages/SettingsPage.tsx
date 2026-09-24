import { DialogButtonPrimary as Button, DropdownItem, Focusable, PanelSection, PanelSectionRow, TextField, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "../api";
import { LOCALE_CHANGED, LOCALES, useT } from "../i18n";
import type { Settings } from "../types";
import { DEFAULT_COLUMNS_PER_ROW, compactButtonStyle, githubCoreQuota, sectionDividerStyle, setGithubToken } from "../utils";

export function SettingsPage() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>({ overwriteExisting: true, updateChannel: "stable", language: "auto", columnsPerRow: DEFAULT_COLUMNS_PER_ROW, githubToken: "" });
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
      if ("language" in next || "githubToken" in next) window.dispatchEvent(new Event(LOCALE_CHANGED));
    });
  };

  return (
    <>
      <PanelSection title={t("settings.githubAccess")}>
        <PanelSectionRow>
          {/* Focusable (via onActivate) so the controller can move up onto
              this text: Steam only scrolls to follow focus, and the token
              field below is otherwise the page's first focus stop. */}
          <Focusable onActivate={() => {}} style={{ display: "grid", gap: 8 }}>
            <small>{t("settings.githubTokenIntro")}</small>
            <div style={{ borderLeft: "3px solid #1a9fff", paddingLeft: 10 }}>
              <div style={{ color: "#8fcef4", fontSize: "0.9em", marginBottom: 3 }}>{t("settings.githubTokenHowTo")}</div>
              <strong style={{ color: "#fff" }}>github.com/settings/tokens</strong>
            </div>
            <small style={{ opacity: 0.75 }}>{t("settings.githubTokenNote")}</small>
          </Focusable>
        </PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <TextField label={t("settings.githubToken")} value={tokenDraft} bIsPassword bShowClearAction onChange={(event) => setTokenDraft(event.currentTarget.value)} />
        </PanelSectionRow>
        <PanelSectionRow>
          <Button style={compactButtonStyle} disabled={tokenDraft.trim() === settings.githubToken} onClick={() => update({ githubToken: tokenDraft.trim() })}>
            {t("settings.saveSettings")}
          </Button>
        </PanelSectionRow>
        {quota && (
          <PanelSectionRow>
            <small className="deckyhub-github-quota" style={{ opacity: 0.75 }}>
              {t("settings.githubQuota", { remaining: quota.remaining, limit: quota.limit, minutes: Math.max(1, Math.ceil((quota.reset * 1000 - Date.now()) / 60_000)) })}
            </small>
          </PanelSectionRow>
        )}
      </PanelSection>

      <div aria-hidden style={sectionDividerStyle} />

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
