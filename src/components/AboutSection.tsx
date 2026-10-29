import { DialogButtonPrimary as Button, Navigation, PanelSection, PanelSectionRow } from "@decky/ui";
import { FaExternalLinkAlt, FaGithub, FaHeart, FaInfoCircle } from "react-icons/fa";
import { useT } from "../i18n";
import { compactButtonStyle, sectionDividerStyle } from "../utils";
import { Card, IconNote } from "./Card";

// The community catalogs most listed plugins were found through (see the
// registry's scripts/discover.py), credited in About.
const CATALOGS = [
  { name: "Decky Plugins Explorer", author: "SafetZahirovic", url: "https://github.com/SafetZahirovic/decky-plugins-explorer" },
  { name: "Decky Extended Plugins", author: "beallio", url: "https://decky-extended-plugins.beallio.com/" },
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
          <Button style={compactButtonStyle} onClick={() => Navigation.NavigateToExternalWeb("https://github.com/mazillka/deckyhub-plugin")}>
            <FaGithub /> {t("settings.aboutSource")}
          </Button>
        </PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <IconNote icon={<FaHeart />}>{t("settings.thanks")}</IconNote>
        </PanelSectionRow>
        {CATALOGS.map((catalog) => (
          <PanelSectionRow key={catalog.url}>
            <Button style={compactButtonStyle} onClick={() => Navigation.NavigateToExternalWeb(catalog.url)}>
              <FaExternalLinkAlt /> {t("settings.catalogBy", { name: catalog.name, author: catalog.author })}
            </Button>
          </PanelSectionRow>
        ))}
      </PanelSection>
    </Card>
  );
}
