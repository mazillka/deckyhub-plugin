import {
  DialogButtonPrimary as Button,
  DropdownItem,
  Focusable,
  PanelSection,
  PanelSectionRow,
  TextField,
  ToggleField,
} from "@decky/ui";
import { openExternalWeb } from "../external";
import { FileSelectionType, openFilePicker, toaster } from "@decky/api";
import { useEffect, useState } from "react";
import {
  FaExternalLinkAlt,
  FaFileExport,
  FaFileImport,
  FaFolderOpen,
  FaInfoCircle,
  FaLock,
  FaSave,
} from "react-icons/fa";
import { exportLogs, getDeckyHubInfo, readTokenFile } from "../api";
import { LOCALES, useT } from "../i18n";
import type { MessageKey } from "../i18n/en";
import type { HideableButton, Settings } from "../types";
import { compactButtonStyle, sectionDividerStyle, type githubCoreQuota } from "../utils";
import { Card, IconNote } from "./Card";
import { GitHubSignIn } from "./GitHubSignIn";
import type { Layout } from "./LayoutToggle";
import { colors } from "../styles";

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
              <div style={{ color: colors.accent, fontSize: "max(12px, 0.9em)", marginBottom: 3 }}>
                {t("dl.installInDecky")}
              </div>
              <strong style={{ color: colors.text }}>{t("dl.installPath")}</strong>
            </div>
          </div>
        </PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <ToggleField
            label={t("settings.overwriteExisting")}
            checked={settings.overwriteExisting}
            onChange={(checked) => update({ overwriteExisting: checked })}
          />
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
            description={t("settings.languageHint")}
            rgOptions={[
              { label: t("settings.autoDetect"), data: "auto" },
              ...LOCALES.map((locale) => ({ label: locale.label, data: locale.code })),
            ]}
            selectedOption={settings.language}
            onChange={({ data }) => update({ language: data })}
          />
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}

// Layout (shared with the Grid / List switches), density, items per row, haptics,
// DeckyHub's Quick Access tab,
// and the Manage-window buttons to hide.
export function DisplaySection({
  settings,
  update,
  layout,
  onLayout,
  listOnly,
}: {
  settings: Settings;
  update: Update;
  layout: Layout;
  onLayout: (layout: Layout) => void;
  // The Experimental style is always a list: no layout or items-per-row choice.
  listOnly?: boolean;
}) {
  const t = useT();
  return (
    <Card>
      <PanelSection title={t("settings.displaySettings")}>
        {!listOnly && (
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
        )}
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
        {!listOnly && (
          <PanelSectionRow>
            <DropdownItem
              label={t("settings.itemsPerRow")}
              rgOptions={[1, 2, 3, 4].map((count) => ({ label: String(count), data: count }))}
              selectedOption={settings.columnsPerRow}
              onChange={({ data }) => update({ columnsPerRow: data })}
            />
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ToggleField
            label={t("settings.haptics")}
            checked={settings.haptics}
            onChange={(checked) => update({ haptics: checked })}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={t("settings.quickAccessTab")}
            description={t("settings.quickAccessTabHint")}
            checked={settings.quickAccessTab}
            onChange={(checked) => update({ quickAccessTab: checked })}
          />
        </PanelSectionRow>
        {HIDEABLE_BUTTONS.map(([name, label]) => (
          <PanelSectionRow key={name}>
            <ToggleField
              label={t("settings.hideButton", { button: t(label) })}
              checked={settings.hiddenButtons.includes(name)}
              onChange={(checked) =>
                update({
                  hiddenButtons: checked
                    ? [...settings.hiddenButtons, name]
                    : settings.hiddenButtons.filter((hidden) => hidden !== name),
                })
              }
            />
          </PanelSectionRow>
        ))}
      </PanelSection>
    </Card>
  );
}

// Export Logs, for bug reports.
export function TroubleshootingSection() {
  const t = useT();
  return (
    <Card>
      <PanelSection title={t("settings.troubleshooting")}>
        <PanelSectionRow>
          <Button
            style={compactButtonStyle}
            onClick={() =>
              void exportLogs().then(
                ({ path }) => toaster.toast({ title: "DeckyHub", body: t("repos.exportedTo", { path }) }),
                (error) => toaster.toast({ title: "DeckyHub", body: String(error) }),
              )
            }
          >
            <FaFileExport /> {t("settings.exportLogs")}
          </Button>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={{ color: colors.accent, fontSize: "max(12px, 0.85em)" }}>{t("settings.exportLogsNote")}</div>
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}
