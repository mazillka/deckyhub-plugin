import { ConfirmModal, ModalRoot, type ConfirmModalProps } from "@decky/ui";
import type { ComponentProps, ReactNode } from "react";
import { navFeedback } from "../haptics";

// Steam's dialogs have a fixed narrow width; every DeckyHub window fills the space
// Steam gives its overlay instead. The style rides inside each window, since modals
// render outside DeckyHub's pages.
const WIDE_MODAL = "deckyhub-wide-modal";
const WideModalStyle = () => <style>{`.${WIDE_MODAL} .GenericDialogBase { width: 100% !important; }`}</style>;

// Windows open outside DeckyHub's pages, so each gives its own navigation feedback.
// React bubbles focus through the window's portal to this box, which has no layout.
const Feedback = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "contents" }} onFocus={navFeedback}>
    {children}
  </div>
);

export const WideConfirmModal = ({ strDescription, ...props }: ConfirmModalProps) => (
  <Feedback>
    <ConfirmModal
      {...props}
      modalClassName={WIDE_MODAL}
      strDescription={
        <>
          <WideModalStyle />
          {strDescription}
        </>
      }
    />
  </Feedback>
);

export const WideModalRoot = ({ children, ...props }: ComponentProps<typeof ModalRoot>) => (
  <Feedback>
    <ModalRoot {...props} modalClassName={WIDE_MODAL}>
      <WideModalStyle />
      {children}
    </ModalRoot>
  </Feedback>
);
