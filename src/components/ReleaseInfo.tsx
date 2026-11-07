import { Focusable, showModal } from "@decky/ui";
import { WideConfirmModal } from "./WideModal";
import { useEffect, useRef, type ReactNode } from "react";
import type { TFunc } from "../i18n/en";
import { plainNotes, textSections } from "../notes";
import { keepInView } from "./KeepInView";

export { plainNotes, textSections };

// Y on an Install/Update button shows what that release changes before installing it.
export const showReleaseInfo = (t: TFunc, title: string, publishedAt?: string | null, notes?: string) =>
  showModal(
    <WideConfirmModal
      bAlertDialog
      strTitle={title}
      strDescription={
        <FromTop>
          {publishedAt && <p><small>{new Date(publishedAt).toLocaleDateString()}</small></p>}
          <Focusable flow-children="down">
            {textSections(plainNotes(notes) || t("appcard.noReleaseNotes")).map((section, index) => (
              <Focusable key={index} onActivate={() => {}} onFocus={keepInView}>{section}</Focusable>
            ))}
          </Focusable>
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
