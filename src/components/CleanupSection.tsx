import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, ConfirmModal, PanelSection, PanelSectionRow, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import { clearDownloads, listDownloads } from "../api";
import { useT } from "../i18n";
import { compactButtonStyle } from "../utils";

const CLEAR_LIST_LIMIT = 50;

export function CleanupSection() {
  const t = useT();
  const [downloads, setDownloads] = useState<{ name: string; directory: boolean }[]>([]);

  useEffect(() => {
    void listDownloads().then(({ items }) => setDownloads(items));
  }, []);

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
    <PanelSection title={t("settings.cleanup")}>
      <PanelSectionRow>
        <Button style={compactButtonStyle} onClick={confirmClearDownloads}>
          {t("settings.clearDownloads")}
        </Button>
      </PanelSectionRow>
    </PanelSection>
  );
}
