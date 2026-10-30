import { ConfirmModal, showModal } from "@decky/ui";
import { useEffect, useRef, type ReactNode } from "react";
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
        <FromTop>
          {publishedAt && <p><small>{new Date(publishedAt).toLocaleDateString()}</small></p>}
          {plainNotes(notes) || t("appcard.noReleaseNotes")}
        </FromTop>
      }
    />,
  );

// The window focuses its OK button, and Steam scrolls long notes down to it; scroll
// them back so they read from the top (seen on a Deck).
function FromTop({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const toTop = () => {
      for (let el = ref.current?.parentElement; el; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = 0;
      }
    };
    const timers = [0, 100, 300].map((delay) => window.setTimeout(toTop, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);
  return <div ref={ref} style={{ whiteSpace: "pre-wrap" }}>{children}</div>;
}
