import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, PanelSection, PanelSectionRow, ToggleField, showModal } from "@decky/ui";
import { useState } from "react";
import { FaSearch, FaTrash } from "react-icons/fa";
import { removeLeftovers, scanLeftovers, type Leftover } from "../api";
import { readableBytes, timeAgo } from "../format";
import { useT } from "../i18n";
import { colors } from "../styles";
import { compactButtonStyle, sectionDividerStyle } from "../utils";
import { Card } from "./Card";
import { WideConfirmModal } from "./WideModal";

// Folders Decky keeps for plugins that are no longer installed (leftovers.py). Looked for only when asked:
// the guess can be wrong, so nothing is picked for the user, and removing backs up the settings first.
export function LeftoversSection() {
  const t = useT();
  const [items, setItems] = useState<Leftover[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const scan = () => {
    setBusy(true);
    void scanLeftovers()
      .then(
        ({ items: found }) => {
          setItems(found);
          setPicked(new Set());
        },
        (error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }),
      )
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
          void removeLeftovers(names).then(
            (result) => {
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
            },
            (error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }),
          )
        }
      />,
    );
  };

  return (
    <Card>
      <PanelSection title={t("settings.leftovers")}>
        <PanelSectionRow>
          <div style={{ color: colors.muted, fontSize: "max(12px, 0.85em)" }}>{t("settings.leftoversNote")}</div>
        </PanelSectionRow>
        <PanelSectionRow>
          <Button style={compactButtonStyle} disabled={busy} onClick={scan}>
            <FaSearch /> {t("settings.leftoversScan")}
          </Button>
        </PanelSectionRow>
        {items?.length === 0 && (
          <PanelSectionRow>
            <span style={{ color: colors.success }}>{t("settings.leftoversNone")}</span>
          </PanelSectionRow>
        )}
        {Boolean(items?.length) && <div aria-hidden style={sectionDividerStyle} />}
        {items?.map((item) => (
          <PanelSectionRow key={item.name}>
            <ToggleField
              label={item.name}
              description={t("settings.leftoverInfo", { size: readableBytes(item.size), when: timeAgo(item.modified) })}
              checked={picked.has(item.name)}
              onChange={(on) => toggle(item.name, on)}
            />
          </PanelSectionRow>
        ))}
        {picked.size > 0 && (
          <PanelSectionRow>
            <Button style={{ ...compactButtonStyle, color: colors.danger }} onClick={remove}>
              <FaTrash /> {t("settings.leftoversRemove", { count: picked.size })}
            </Button>
          </PanelSectionRow>
        )}
      </PanelSection>
    </Card>
  );
}
