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
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#d6f5ff" }}>
            <span style={{ alignItems: "center", background: "#1a9fff", borderRadius: "50%", color: "#fff", display: "inline-flex", fontSize: 18, fontWeight: 700, height: 28, justifyContent: "center", width: 28 }}>✓</span>
            <strong>{t("appcard.downloadComplete")}</strong>
          </div>
          <div>
            <div style={{ color: "#8fcef4", fontSize: "0.9em", marginBottom: 5 }}>{t("dl.savedTo")}</div>
            <div style={{ background: "rgba(26, 159, 255, 0.16)", border: "1px solid rgba(100, 200, 255, 0.5)", borderRadius: 4, color: "#fff", overflowWrap: "anywhere", padding: "8px 10px" }}>{path || t("dl.selectedFolder")}</div>
          </div>
          <div style={{ borderLeft: "3px solid #1a9fff", paddingLeft: 10 }}>
            <div style={{ color: "#8fcef4", fontSize: "0.9em", marginBottom: 3 }}>{t("dl.installInDecky")}</div>
            <strong style={{ color: "#fff" }}>{t("dl.installPath")}</strong>
          </div>
        </div>
      }
      strOKButtonText={t("dl.ok")}
      bAlertDialog
    />
  );
}
