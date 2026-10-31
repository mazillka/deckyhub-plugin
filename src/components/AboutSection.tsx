import { DialogButtonPrimary as Button, PanelSection, PanelSectionRow } from "@decky/ui";
import { openExternalWeb } from "../external";
import { FaExternalLinkAlt, FaGithub, FaHeart, FaInfoCircle } from "react-icons/fa";
import { useT } from "../i18n";
import { compactButtonStyle, ellipsis, sectionDividerStyle } from "../utils";
import { Card, IconNote } from "./Card";

// The community catalogs most listed plugins were found through (see the
// registry's scripts/discover.py), credited in About.
const CATALOGS = [
  { name: "Decky Plugins Explorer", author: "SafetZahirovic", url: "https://github.com/SafetZahirovic/decky-plugins-explorer" },
  { name: "Decky Extended Plugins", author: "beallio", url: "https://github.com/beallio/decky-plugins-extended" },
];

// What DeckyHub is and who to thank, at the bottom of the Quick Access panel.
export function AboutSection() {
  const t = useT();
  return (
    <Card>
      <PanelSection title={t("settings.about")}>
        <PanelSectionRow>
          <IconNote icon={<FaInfoCircle />}>{t("settings.aboutText")}</IconNote>
        </PanelSectionRow>
        <PanelSectionRow>
          <Button style={compactButtonStyle} onClick={() => openExternalWeb("https://github.com/mazillka/deckyhub-plugin")}>
            <FaGithub /> {t("settings.aboutSource")}
          </Button>
        </PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <IconNote icon={<FaHeart />}>{t("settings.thanks")}</IconNote>
        </PanelSectionRow>
        {CATALOGS.map((catalog) => (
          <PanelSectionRow key={catalog.url}>
            {/* Name and author on a line each: as one sentence it wrapped to three in the panel. */}
            <Button style={compactButtonStyle} aria-label={t("settings.catalogBy", { name: catalog.name, author: catalog.author })} onClick={() => openExternalWeb(catalog.url)}>
              <FaExternalLinkAlt />
              <span aria-hidden style={{ display: "grid", minWidth: 0, textAlign: "left" }}>
                <span>{catalog.name}</span>
                <small style={{ ...ellipsis, opacity: 0.7 }}>@{catalog.author}</small>
              </span>
            </Button>
          </PanelSectionRow>
        ))}
      </PanelSection>
    </Card>
  );
}
