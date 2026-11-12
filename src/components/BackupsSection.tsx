import { toaster } from "@decky/api";
import {
  DialogButtonPrimary as Button,
  Focusable,
  PanelSection,
  PanelSectionRow,
  ToggleField,
  showModal,
} from "@decky/ui";
import { useEffect, useState } from "react";
import { FaHistory, FaTrash } from "react-icons/fa";
import { deleteSettingsBackup, listSettingsBackups, restoreSettingsBackup, type SettingsBackup } from "../api";
import { readableBytes } from "../format";
import { useT } from "../i18n";
import { colors } from "../styles";
import type { Settings } from "../types";
import { compactButtonStyle, sectionDividerStyle } from "../utils";
import { Card } from "./Card";
import { WideConfirmModal } from "./WideModal";

// Only the newest ones are listed; the rest are still kept (backups.py keeps 5 per plugin).
const SHOWN = 12;

// Backups of other plugins' settings: the switch for making one before an update or removal, and the
// list to restore from (backups.py).
export function BackupsSection({
  settings,
  update,
}: {
  settings: Settings;
  update: (next: Partial<Settings>) => void;
}) {
  const t = useT();
  const [backups, setBackups] = useState<SettingsBackup[]>([]);
  const refresh = () =>
    void listSettingsBackups().then(
      ({ backups: found }) => setBackups(found),
      () => undefined,
    );
  useEffect(refresh, []);

  const restore = (backup: SettingsBackup) =>
    showModal(
      <WideConfirmModal
        strTitle={t("settings.restoreTitle", { name: backup.plugin })}
        strDescription={t("settings.restoreDescription", { date: new Date(backup.created).toLocaleString() })}
        strOKButtonText={t("settings.restore")}
        bDestructiveWarning
        onOK={() =>
          void restoreSettingsBackup(backup.plugin, backup.file).then(
            (result) => {
              toaster.toast({
                title: "DeckyHub",
                body: result.error ?? t("settings.restored", { name: backup.plugin }),
              });
              refresh();
            },
            (error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }),
          )
        }
      />,
    );

  const remove = (backup: SettingsBackup) =>
    void deleteSettingsBackup(backup.plugin, backup.file).then(refresh, (error: unknown) =>
      toaster.toast({ title: "DeckyHub", body: String(error) }),
    );

  return (
    <Card>
      <PanelSection title={t("settings.backups")}>
        <PanelSectionRow>
          <ToggleField
            label={t("settings.backupBefore")}
            description={t("settings.backupBeforeNote")}
            checked={settings.backupBeforeChange}
            onChange={(checked) => update({ backupBeforeChange: checked })}
          />
        </PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        {backups.length === 0 && (
          <PanelSectionRow>
            <span style={{ color: colors.muted }}>{t("settings.backupsEmpty")}</span>
          </PanelSectionRow>
        )}
        {backups.slice(0, SHOWN).map((backup) => (
          <PanelSectionRow key={`${backup.plugin}/${backup.file}`}>
            <div style={{ display: "grid", gap: 6, width: "100%" }}>
              <div>
                <strong>{backup.plugin}</strong>
                <div style={{ color: colors.muted, fontSize: "0.85em" }}>
                  {new Date(backup.created).toLocaleString()} · {readableBytes(backup.size)}
                </div>
              </div>
              <Focusable flow-children="right" style={{ display: "flex", gap: 8 }}>
                <Button style={{ ...compactButtonStyle, marginBottom: 0 }} onClick={() => restore(backup)}>
                  <FaHistory /> {t("settings.restore")}
                </Button>
                <Button
                  style={{ ...compactButtonStyle, marginBottom: 0, color: colors.danger }}
                  onClick={() => remove(backup)}
                >
                  <FaTrash /> {t("repos.removeConfirm")}
                </Button>
              </Focusable>
            </div>
          </PanelSectionRow>
        ))}
      </PanelSection>
    </Card>
  );
}
