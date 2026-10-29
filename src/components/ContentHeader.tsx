import { DialogButtonPrimary as Button } from "@decky/ui";
import type { ReactNode } from "react";
import { FaArrowCircleUp, FaArrowLeft, FaArrowUp, FaCompass, FaSync } from "react-icons/fa";
import { useT } from "../i18n";
import type { View } from "../types";
import { compactButtonStyle, disclaimerStyle } from "../utils";
import { RootBadge } from "./AppBadges";
import { PageHeader } from "./Card";
import { KeepInView } from "./KeepInView";
import { LayoutToggle, type Layout } from "./LayoutToggle";

const buttonStyle = { ...compactButtonStyle, marginBottom: 0 };

// Updates' and Discover's header: title, badge, description and actions (Back while
// browsing, Grid / List, Refresh, Update all), then the install disclaimer and, on
// Discover, what the Runs as root badge means.
export function ContentHeader({
  view,
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
}: {
  view: View;
  title: string;
  badge: ReactNode;
  description?: string;
  // Set while browsing Discover's list: goes back to its shelves.
  onBack?: () => void;
  // Set when the page offers the Grid / List switch.
  layout?: Layout;
  onLayout: (layout: Layout) => void;
  onRefresh: () => void;
  updateAllCount: number;
  updatingAll: boolean;
  onUpdateAll: () => void;
}) {
  const t = useT();
  return (
    <KeepInView>
      <PageHeader
        icon={view === "updates" ? <FaArrowCircleUp /> : <FaCompass />}
        title={title}
        badge={badge}
        description={description}
        actions={
          <>
            {onBack && (
              <div className="deckyhub-back-button" style={{ flex: "0 0 150px" }}>
                <Button style={buttonStyle} onClick={onBack}>
                  <FaArrowLeft /> {t("nav.discover")}
                </Button>
              </div>
            )}
            {layout && (
              <div style={{ flex: "0 0 120px" }}>
                <LayoutToggle layout={layout} onChange={onLayout} />
              </div>
            )}
            <div style={{ flex: "0 0 180px" }}>
              <Button style={buttonStyle} onClick={onRefresh}>
                <FaSync /> {t("content.refresh")}
              </Button>
            </div>
            {updateAllCount > 1 && (
              <div style={{ flex: "0 0 220px" }}>
                <Button style={buttonStyle} disabled={updatingAll} onClick={onUpdateAll}>
                  <FaArrowUp /> {t("content.updateAll", { count: updateAllCount })}
                </Button>
              </div>
            )}
          </>
        }
      />
      <div className="deckyhub-disclaimer" style={disclaimerStyle}>{t("install.disclaimer")}</div>
      {/* The badge's tooltip never shows on a Deck (no hover), so Discover spells it out once. */}
      {view === "discover" && (
        <div className="deckyhub-root-legend" style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: "var(--dh-card-gap, 14px)", color: "#d6f5ff", fontSize: "max(12px, 0.85em)" }}>
          <RootBadge t={t} />
          <span>{t("appcard.runsAsRootHint")}</span>
        </div>
      )}
    </KeepInView>
  );
}
