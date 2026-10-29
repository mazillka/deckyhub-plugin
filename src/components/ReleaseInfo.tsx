import { ConfirmModal, showModal } from "@decky/ui";
import type { TFunc } from "../i18n/en";

// ponytail: markdown read as plain text (no headings' #, bold's **, link URLs; list
// dashes become bullets), minus images and HTML tags; render markdown if this reads badly.
// Repeats until nothing changes, so a nested tag like <scr<b>ipt> can't reassemble one.
export function plainNotes(notes = "") {
  for (let previous = ""; previous !== notes; ) {
    previous = notes;
    notes = notes.replace(/!\[[^\]]*\]\([^)]*\)|<[^>]*>/g, "");
  }
  return notes
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*|__/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Y on an Install/Update button shows what that release changes before installing it.
export const showReleaseInfo = (t: TFunc, title: string, publishedAt?: string | null, notes?: string) =>
  showModal(
    <ConfirmModal
      bAlertDialog
      strTitle={title}
      strDescription={
        <div style={{ whiteSpace: "pre-wrap" }}>
          {publishedAt && <p><small>{new Date(publishedAt).toLocaleDateString()}</small></p>}
          {plainNotes(notes) || t("appcard.noReleaseNotes")}
        </div>
      }
    />,
  );
