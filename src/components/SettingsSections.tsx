import { DialogButtonPrimary as Button, DropdownItem, Focusable, Navigation, PanelSection, PanelSectionRow, TextField, ToggleField } from "@decky/ui";
import { FaExternalLinkAlt, FaFolderOpen, FaInfoCircle, FaListUl, FaLock, FaSave } from "react-icons/fa";
import { LOCALES, useT } from "../i18n";
import type { MessageKey } from "../i18n/en";
import type { HideableButton, Settings } from "../types";
import { compactButtonStyle, sectionDividerStyle, type githubCoreQuota } from "../utils";
import { Card, IconNote } from "./Card";
import type { Layout } from "./LayoutToggle";

// The Settings page's sections. The page owns the settings and saves changes
// (update); each section shows its part and reports what changed.
type Update = (next: Partial<Settings>) => void;

// Each hideable Manage-window button, labelled with its own translation.
const HIDEABLE_BUTTONS: [HideableButton, MessageKey][] = [
  ["downloadZip", "settings.downloadUpdate"],
  ["install", "appcard.install"],
  ["update", "appcard.update"],
  ["releasePage", "appcard.releasePage"],
];

const openTokenPage = () => Navigation.NavigateToExternalWeb("https://github.com/settings/tokens");

// What a token is for, the requests left this hour, where to make one, and the
// token field itself (saved on its button, not per keystroke).
export function GitHubAccessSection({ quota, tokenDraft, onTokenDraft, savedToken, update }: { quota: Awaited<ReturnType<typeof githubCoreQuota>>; tokenDraft: string; onTokenDraft: (token: string) => void; savedToken: string; update: Update }) {
  const t = useT();
  // Same green/yellow/red as the app cards' status colors.
  const quotaColor = !quota || quota.remaining > quota.limit / 2 ? "#6bcb6b" : quota.remaining > quota.limit / 10 ? "#f0c33c" : "#ff6b6b";
  return (
    <Card>
      <PanelSection title={t("settings.githubAccess")}>
        <PanelSectionRow>
          <div style={{ display: "grid", gap: 8 }}>
            {/* Focusable (via onActivate) so the controller can move up onto
                this text: Steam only scrolls to follow focus. */}
            <Focusable onActivate={() => {}} style={{ display: "grid", gap: 8 }}>
              <IconNote icon={<FaInfoCircle />}>{t("settings.githubTokenIntro")}</IconNote>
              {quota && (
                <strong className="deckyhub-github-quota" style={{ borderLeft: `3px solid ${quotaColor}`, color: quotaColor, paddingLeft: 10 }}>
                  {t("settings.githubQuota", { remaining: quota.remaining, limit: quota.limit, minutes: Math.max(1, Math.ceil((quota.reset * 1000 - Date.now()) / 60_000)) })}
                </strong>
              )}
            </Focusable>
            {/* A button (A / tap) that opens the token page in Steam's browser. */}
            <Focusable className="deckyhub-token-link" onActivate={openTokenPage} onClick={openTokenPage} style={{ borderLeft: "3px solid #1a9fff", cursor: "pointer", paddingLeft: 10 }}>
              <div style={{ color: "#8fcef4", fontSize: "max(12px, 0.9em)", marginBottom: 3 }}>{t("settings.githubTokenHowTo")}</div>
              <strong style={{ alignItems: "center", color: "#fff", display: "inline-flex", gap: 6, textDecoration: "underline" }}>
                github.com/settings/tokens <FaExternalLinkAlt size="0.8em" />
              </strong>
            </Focusable>
            <IconNote icon={<FaLock />}>{t("settings.githubTokenNote")}</IconNote>
          </div>
        </PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <TextField label={t("settings.githubToken")} value={tokenDraft} bIsPassword bShowClearAction onChange={(event) => onTokenDraft(event.currentTarget.value)} />
        </PanelSectionRow>
        <PanelSectionRow>
          <Button style={compactButtonStyle} disabled={tokenDraft.trim() === savedToken} onClick={() => update({ githubToken: tokenDraft.trim() })}>
            <FaSave /> {t("settings.saveSettings")}
          </Button>
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}

export function RepositoriesSection() {
  const t = useT();
  return (
    <Card>
      <PanelSection title={t("nav.repositories")}>
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={() => Navigation.Navigate("/deckyhub/repositories")}>
            <FaListUl /> {t("nav.repositories")}
          </Button>
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}

// Where downloaded ZIPs go, and whether a new download replaces an old one.
export function DownloadsSection({ settings, update }: { settings: Settings; update: Update }) {
  const t = useT();
  return (
    <Card>
      <PanelSection title={t("settings.downloadSettings")}>
        <PanelSectionRow>
          <div style={{ display: "grid", gap: 8 }}>
            <IconNote icon={<FaFolderOpen />}>{t("settings.whereZipsSaved")}</IconNote>
            <div style={{ borderLeft: "3px solid #1a9fff", paddingLeft: 10 }}>
              <div style={{ color: "#8fcef4", fontSize: "max(12px, 0.9em)", marginBottom: 3 }}>{t("dl.installInDecky")}</div>
              <strong style={{ color: "#fff" }}>{t("dl.installPath")}</strong>
            </div>
          </div>
        </PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <ToggleField label={t("settings.overwriteExisting")} checked={settings.overwriteExisting} onChange={(checked) => update({ overwriteExisting: checked })} />
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}

export function LanguageSection({ settings, update }: { settings: Settings; update: Update }) {
  const t = useT();
  return (
    <Card>
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
    </Card>
  );
}

// Layout (shared with the Grid / List switches), density, items per row, haptics,
// and the Manage-window buttons to hide.
export function DisplaySection({ settings, update, layout, onLayout }: { settings: Settings; update: Update; layout: Layout; onLayout: (layout: Layout) => void }) {
  const t = useT();
  return (
    <Card>
      <PanelSection title={t("settings.displaySettings")}>
        <PanelSectionRow>
          <DropdownItem
            label={t("settings.layout")}
            rgOptions={[
              { label: t("discover.grid"), data: "grid" },
              { label: t("discover.list"), data: "list" },
            ]}
            selectedOption={layout}
            onChange={({ data }) => onLayout(data)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label={t("settings.density")}
            rgOptions={[
              { label: t("settings.densityDefault"), data: "default" },
              { label: t("settings.densityCompact"), data: "compact" },
            ]}
            selectedOption={settings.density}
            onChange={({ data }) => update({ density: data })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem label={t("settings.itemsPerRow")} rgOptions={[1, 2, 3, 4].map((count) => ({ label: String(count), data: count }))} selectedOption={settings.columnsPerRow} onChange={({ data }) => update({ columnsPerRow: data })} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField label={t("settings.haptics")} checked={settings.haptics} onChange={(checked) => update({ haptics: checked })} />
        </PanelSectionRow>
        {HIDEABLE_BUTTONS.map(([name, label]) => (
          <PanelSectionRow key={name}>
            <ToggleField
              label={t("settings.hideButton", { button: t(label) })}
              checked={settings.hiddenButtons.includes(name)}
              onChange={(checked) => update({ hiddenButtons: checked ? [...settings.hiddenButtons, name] : settings.hiddenButtons.filter((hidden) => hidden !== name) })}
            />
          </PanelSectionRow>
        ))}
      </PanelSection>
    </Card>
  );
}
