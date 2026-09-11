import { ConfirmModal, ProgressBar, showModal } from "@decky/ui";
import { useT } from "../i18n";
import type { MessageKey } from "../i18n/en";
import type { Download } from "../types";
import { readableBytes } from "../utils";

export function DownloadProgress({ download }: { download: Download }) {
  const t = useT();
  if (!["queued", "downloading"].includes(download.state)) return null;
  const progress = download.total ? Math.min(100, (100 * (download.received ?? 0)) / download.total) : 0;
  return (
    <div style={{ marginTop: 8 }}>
      <ProgressBar indeterminate={!download.total} nProgress={progress} />
      <small>{download.total ? `${Math.round(progress)}% · ${readableBytes(download.received)} of ${readableBytes(download.total)}` : t("dl.preparing")}</small>
    </div>
  );
}

export function showDownloadComplete(t: (key: MessageKey, vars?: Record<string, string | number>) => string, title: string, path?: string) {
  showModal(
    <ConfirmModal
      strTitle={title}
      strDescription={
        <>
          <div>{t("dl.savedTo")}</div>
          <div>{path || t("dl.selectedFolder")}</div>
          <br />
          <div>{t("dl.installInDecky")}</div>
          <div>{t("dl.installPath")}</div>
        </>
      }
      strOKButtonText={t("dl.ok")}
      bAlertDialog
    />
  );
}
