import { DialogButtonPrimary as Button, Focusable, PanelSection, PanelSectionRow, showModal } from "@decky/ui";
import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { FaExternalLinkAlt, FaHeart } from "react-icons/fa";
import { openExternalWeb, rememberOpener } from "../external";
import { useT } from "../i18n";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import { iconRow } from "../utils";
import { Card } from "./Card";
import { WideModalRoot } from "./WideModal";

const KOFI_URL = "https://ko-fi.com/mazillka";
// Ko-fi's own colour, so the button reads as theirs, with dark text: white on it is only 2.4:1.
const KOFI_COLOR = "#ff5e5b";
const KOFI_TEXT = "#15100f";

// The Ko-fi page as a QR code to scan with a phone, and an Open button for this device's own browser.
function SupportModal({ t, closeModal }: { t: TFunc; closeModal?: () => void }) {
  const qr = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(KOFI_URL);
    code.make();
    return code.createDataURL(5, 12);
  }, []);
  return (
    <WideModalRoot closeModal={closeModal}>
      <div style={{ display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
        <strong style={{ fontSize: "1.25em" }}>{t("support.title")}</strong>
        {/* The QR code beside the text, so the window fits a 1280x800 screen without scrolling */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "center" }}>
          <img src={qr} alt="" style={{ width: 200, height: 200, imageRendering: "pixelated" }} />
          <div style={{ display: "grid", gap: 10, flex: "1 1 240px", maxWidth: 360 }}>
            <span style={{ color: colors.muted }}>{t("support.text")}</span>
            <code style={{ color: colors.accent, overflowWrap: "anywhere" }}>{KOFI_URL.replace("https://", "")}</code>
          </div>
        </div>
        <Focusable flow-children="right" style={{ display: "flex", gap: 10, width: "100%", flexWrap: "wrap" }}>
          <Button
            style={{ ...iconRow, margin: 0, flex: 1, minWidth: 150, background: KOFI_COLOR, color: KOFI_TEXT }}
            onClick={() => {
              closeModal?.();
              openExternalWeb(KOFI_URL);
            }}
          >
            <FaExternalLinkAlt /> {t("support.open")}
          </Button>
          <Button style={{ ...iconRow, margin: 0, flex: 1, minWidth: 150 }} onClick={() => closeModal?.()}>
            {t("settings.close")}
          </Button>
        </Focusable>
      </div>
    </WideModalRoot>
  );
}

// One button at the bottom of Quick Access; everything about it is in the window it opens.
export function SupportSection() {
  const t = useT();
  return (
    <Card>
      <PanelSection>
        <PanelSectionRow>
          <Button
            style={{ ...iconRow, margin: 0, width: "100%", background: KOFI_COLOR, color: KOFI_TEXT }}
            onClick={(event) => {
              rememberOpener(event.currentTarget);
              showModal(<SupportModal t={t} />);
            }}
          >
            <FaHeart /> {t("support.button")}
          </Button>
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}
