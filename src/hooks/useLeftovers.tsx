import { toaster } from "@decky/api";
import { showModal } from "@decky/ui";
import { useState } from "react";
import { removeLeftovers, scanLeftovers, type Leftover } from "../api";
import { WideConfirmModal } from "../components/WideModal";
import { readableBytes } from "../format";
import type { TFunc } from "../i18n/en";

const showError = (error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) });

// Folders Decky keeps for plugins that are no longer installed: scanned for on request, picked one by one,
// removed after a confirmation.
export function useLeftovers(t: TFunc) {
  const [items, setItems] = useState<Leftover[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const scan = () => {
    setBusy(true);
    void scanLeftovers()
      .then(({ items: found }) => {
        setItems(found);
        setPicked(new Set());
      }, showError)
      .finally(() => setBusy(false));
  };

  const toggle = (name: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });

  const remove = () => {
    const names = [...picked];
    showModal(
      <WideConfirmModal
        strTitle={t("settings.leftoversConfirmTitle", { count: names.length })}
        strDescription={t("settings.leftoversConfirm")}
        strOKButtonText={t("settings.leftoversRemove", { count: names.length })}
        bDestructiveWarning
        onOK={() =>
          void removeLeftovers(names).then((result) => {
            toaster.toast({
              title: "DeckyHub",
              body:
                result.error ??
                t("settings.leftoversRemoved", {
                  count: result.removed ?? 0,
                  size: readableBytes(result.freed ?? 0),
                }),
            });
            scan();
          }, showError)
        }
      />,
    );
  };

  return { items, picked, busy, scan, toggle, remove };
}
