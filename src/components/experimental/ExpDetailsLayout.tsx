import { Focusable, NavEntryPositionPreferences } from "@decky/ui";
import type { ReactNode } from "react";
import type { TFunc } from "../../i18n/en";
import { displayVersion } from "../../version";
import { keepInView } from "../KeepInView";
import { showReleaseInfo, textSections } from "../ReleaseInfo";

// Experimental: the Manage and DeckyHub update windows as a banner over two columns.
// Left, everything you act on (version, Install / Update, the scan, links, Close), where
// focus starts; right, what you read (About, What's new), one D-pad stop per section,
// reached with Right and walked with Down to the end of the notes.
export function ExpDetailsLayout({
  t,
  icon,
  title,
  aside,
  meta,
  description,
  release,
  notesPreview,
  picker,
  primary,
  scan,
  footer,
}: {
  t: TFunc;
  icon: ReactNode;
  title: string;
  aside?: string;
  meta: ReactNode;
  description?: string;
  release?: { tag: string; publishedAt: string | null; notes?: string } | null;
  notesPreview: string;
  picker: ReactNode;
  primary: ReactNode;
  scan?: ReactNode;
  footer: ReactNode;
}) {
  const sections = (text: string, onActivate: () => void) =>
    textSections(text).map((section, index) => (
      <Focusable key={index} onActivate={onActivate} onFocus={keepInView}>
        {section}
      </Focusable>
    ));
  return (
    <Focusable flow-children="down" className="deckyhub-details dh-exp-details">
      <Focusable onActivate={() => {}} onFocus={keepInView} className="dh-exp-details-hero">
        {icon}
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 12px" }}>
            <strong className="dh-exp-gradient-text" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
              {title}
            </strong>
            {aside && <span style={{ color: "var(--exp-muted)", fontSize: 14 }}>{aside}</span>}
          </div>
          <div
            className="deckyhub-details-meta"
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "6px 14px",
              color: "#c3cfd9",
              fontSize: 14,
            }}
          >
            {meta}
          </div>
        </div>
      </Focusable>
      {/* Down from the banner lands on the actions (Steam otherwise picks the nearer reading column). */}
      <Focusable
        flow-children="right"
        navEntryPreferPosition={NavEntryPositionPreferences.FIRST}
        className="dh-exp-details-cols"
      >
        <Focusable flow-children="down" className="dh-exp-details-side">
          {picker}
          {primary}
          {scan}
          <Focusable flow-children="down" style={{ display: "grid", gap: 10 }}>
            {footer}
          </Focusable>
        </Focusable>
        <Focusable flow-children="down" className="dh-exp-details-main">
          {description && (
            <section className="deckyhub-details-about">
              <h3 className="dh-exp-label">{t("details.about")}</h3>
              <Focusable flow-children="down" className="deckyhub-details-description dh-exp-prose">
                {sections(description, () => {})}
              </Focusable>
            </section>
          )}
          {release && (
            <section className="deckyhub-details-section">
              <h3 className="dh-exp-label">
                {t("details.whatsNew", { version: displayVersion(release.tag) })}
                {release.publishedAt && (
                  <span style={{ marginLeft: 10, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>
                    {new Date(release.publishedAt).toLocaleDateString()}
                  </span>
                )}
              </h3>
              <Focusable flow-children="down" className="deckyhub-details-notes dh-exp-prose dh-exp-notes">
                {sections(notesPreview || t("appcard.noReleaseNotes"), () =>
                  showReleaseInfo(t, `${title} ${displayVersion(release.tag)}`, release.publishedAt, release.notes),
                )}
              </Focusable>
            </section>
          )}
        </Focusable>
      </Focusable>
    </Focusable>
  );
}
