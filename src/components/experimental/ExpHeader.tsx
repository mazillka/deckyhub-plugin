import { DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import type { ComponentProps } from "react";
import { FaArrowLeft, FaArrowUp, FaSync } from "react-icons/fa";
import { useT } from "../../i18n";
import { ContentHeader, HeaderNotices } from "../ContentHeader";
import { keepInView, KeepInView } from "../KeepInView";
import { LayoutToggle } from "../LayoutToggle";

// Experimental: Updates', Discover's and Installed's header as a glowing banner, with
// the same actions and notices as the Default one (ContentHeader).
export function ExpHeader({
  title,
  badge,
  description,
  onBack,
  layout,
  onLayout,
  onRefresh,
  updateAllCount,
  updatingAll,
  onUpdateAll,
}: ComponentProps<typeof ContentHeader>) {
  const t = useT();
  return (
    <KeepInView>
      <Focusable flow-children="right" onFocus={keepInView} className="dh-exp-hero">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 className="dh-exp-gradient-text">{title}</h2>
            {badge}
          </div>
          {description && <p>{description}</p>}
        </div>
        <div className="dh-exp-actions">
          {onBack && (
            <div className="deckyhub-back-button">
              <Button onClick={onBack}>
                <FaArrowLeft /> {t("nav.discover")}
              </Button>
            </div>
          )}
          {layout && (
            <div style={{ width: 120 }}>
              <LayoutToggle layout={layout} onChange={onLayout} />
            </div>
          )}
          <div>
            <Button aria-label={t("content.refresh")} onClick={onRefresh}>
              <FaSync />
            </Button>
          </div>
          {updateAllCount > 1 && (
            <div className="dh-exp-wide">
              <Button disabled={updatingAll} onClick={onUpdateAll}>
                <FaArrowUp /> {t("content.updateAll", { count: updateAllCount })}
              </Button>
            </div>
          )}
        </div>
      </Focusable>
      <HeaderNotices />
    </KeepInView>
  );
}
