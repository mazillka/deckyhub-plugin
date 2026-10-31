import { DialogButtonPrimary as Button } from "@decky/ui";
import type { ReactNode } from "react";
import { FaArrowCircleUp, FaArrowLeft, FaArrowUp, FaCompass, FaExternalLinkAlt, FaSync } from "react-icons/fa";
import { openExternalWeb } from "../external";
import { useT } from "../i18n";
import type { View } from "../types";
import { compactButtonStyle, infoNoticeStyle } from "../utils";
import { AUDIT_WARNINGS, ForkBadge, RootBadge, WarningBadge } from "./AppBadges";
import { PageHeader } from "./Card";
import { KeepInView } from "./KeepInView";
import { LayoutToggle, type Layout } from "./LayoutToggle";
import { Notice } from "./Notice";

const buttonStyle = { ...compactButtonStyle, marginBottom: 0 };

// Where the audit warnings come from, opened from the badge notice.
const AUDIT_URL = "https://decky-extended-plugins.beallio.com/audit";

// Updates' and Discover's header: title, badge, description and actions (Back while
// browsing, Grid / List, Refresh, Update all), then the install disclaimer, cut to
// a line with More, and a notice explaining the badges.
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
      {/* One line each, so plugins show above the fold. The badges get their own notice:
          their tooltips never show on a Deck (no hover), and they aren't part of the warning. */}
      <Notice className="deckyhub-disclaimer" text={t("install.disclaimer")} />
      <Notice
        className="deckyhub-badge-notice"
        style={infoNoticeStyle}
        text={t("appcard.badgesNotice")}
        more={
          <>
            <div className="deckyhub-root-legend" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <RootBadge t={t} />
              <span>{t("appcard.runsAsRootHint")}</span>
            </div>
            <div className="deckyhub-fork-legend" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <ForkBadge t={t} />
              <span>{t("appcard.forkHint")}</span>
            </div>
            <div className="deckyhub-warning-legend" style={{ display: "grid", gap: 6 }}>
              <span>{t("appcard.warningsIntro")}</span>
              <div>
                <Button style={{ ...buttonStyle, width: "auto" }} onClick={() => openExternalWeb(AUDIT_URL)}>
                  <FaExternalLinkAlt /> {t("appcard.auditLink")}
                </Button>
              </div>
              {AUDIT_WARNINGS.map((warning) => (
                <div key={warning} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <WarningBadge t={t} warning={warning} />
                  <span>{t(`appcard.warning.${warning}.hint`)}</span>
                </div>
              ))}
            </div>
          </>
        }
      />
    </KeepInView>
  );
}
