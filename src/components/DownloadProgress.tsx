import { ConfirmModal, ProgressBar, showModal } from "@decky/ui";
import type { Download } from "../types";
import { readableBytes } from "../utils";

export function DownloadProgress({ download }: { download: Download }) {
  if (!["queued", "downloading"].includes(download.state)) return null;
  const progress = download.total ? Math.min(100, (100 * (download.received ?? 0)) / download.total) : 0;
  return (
    <div style={{ marginTop: 8 }}>
      <ProgressBar indeterminate={!download.total} nProgress={progress} />
      <small>{download.total ? `${Math.round(progress)}% · ${readableBytes(download.received)} of ${readableBytes(download.total)}` : "Preparing download…"}</small>
    </div>
  );
}

export function showDownloadComplete(title: string, path?: string) {
  showModal(
    <ConfirmModal
      strTitle={title}
      strDescription={
        <>
          <div>The ZIP was saved to:</div>
          <div>{path || "the selected download folder"}</div>
          <br />
          <div>Install it in Decky:</div>
          <div>Developer → Install Plugin from ZIP</div>
        </>
      }
      strOKButtonText="OK"
      bAlertDialog
    />
  );
}
