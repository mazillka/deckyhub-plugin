import { ConfirmModal, ModalRoot, type ConfirmModalProps } from "@decky/ui";
import type { ComponentProps } from "react";

// Steam's dialogs have a fixed narrow width; every DeckyHub window fills the space
// Steam gives its overlay instead. The style rides inside each window, since modals
// render outside DeckyHub's pages.
const WIDE_MODAL = "deckyhub-wide-modal";
const WideModalStyle = () => <style>{`.${WIDE_MODAL} .GenericDialogBase { width: 100% !important; }`}</style>;

export const WideConfirmModal = ({ strDescription, ...props }: ConfirmModalProps) => (
  <ConfirmModal {...props} modalClassName={WIDE_MODAL} strDescription={<><WideModalStyle />{strDescription}</>} />
);

export const WideModalRoot = ({ children, ...props }: ComponentProps<typeof ModalRoot>) => (
  <ModalRoot {...props} modalClassName={WIDE_MODAL}><WideModalStyle />{children}</ModalRoot>
);
