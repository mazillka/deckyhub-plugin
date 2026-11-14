import { toaster } from "@decky/api";
import { DialogButton, DialogButtonPrimary as Button, Focusable } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaCheck, FaStar, FaTimes } from "react-icons/fa";
import { getSettings, ratePlugin, saveSettings, withdrawRating } from "../api";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import type { Settings } from "../types";
import { iconRow } from "../utils";
import { WideModalRoot } from "./WideModal";

type Mine = { stars?: number; works?: boolean; ui?: boolean };

const choiceStyle = (chosen: boolean) => ({
  ...iconRow,
  margin: 0,
  flex: 1,
  minWidth: 56,
  ...(chosen ? { background: colors.accent, color: "#10151f" } : {}),
});

// Rate a plugin you have installed: whether it works on this device, and 1 to 5 stars. Nothing is sent unless
// Share ratings is on (Settings), which this window can switch on.
export function RatingModal({
  t,
  name,
  repo,
  version,
  closeModal,
}: {
  t: TFunc;
  name: string;
  repo: string;
  version?: string;
  closeModal?: () => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mine, setMine] = useState<Mine>({});
  const [stars, setStars] = useState<number | null>(null);
  const [works, setWorks] = useState<boolean | null>(null);
  const [ui, setUi] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSettings().then((loaded) => {
      setSettings(loaded);
      const existing = loaded.myRatings?.[repo] ?? {};
      setMine(existing);
      setStars(existing.stars ?? null);
      setWorks(existing.works ?? null);
      setUi(existing.ui ?? null);
    });
  }, [repo]);

  const turnOn = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      setSettings(await saveSettings({ ...settings, shareRatings: true }));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      const result = await ratePlugin(repo, version ?? null, stars, works, ui);
      if (result.sent) {
        toaster.toast({ title: "DeckyHub", body: t("rating.sent") });
        closeModal?.();
      } else toaster.toast({ title: "DeckyHub", body: t("rating.failed") });
    } catch {
      toaster.toast({ title: "DeckyHub", body: t("rating.failed") });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const result = await withdrawRating(repo);
      if (result.removed) {
        toaster.toast({ title: "DeckyHub", body: t("rating.removed") });
        closeModal?.();
      } else toaster.toast({ title: "DeckyHub", body: t("rating.failed") });
    } catch {
      toaster.toast({ title: "DeckyHub", body: t("rating.failed") });
    } finally {
      setBusy(false);
    }
  };

  const enabled = settings?.shareRatings === true;
  const hasRating = mine.stars !== undefined || mine.works !== undefined || mine.ui !== undefined;
  return (
    <WideModalRoot closeModal={closeModal}>
      <div style={{ display: "grid", gap: 14 }}>
        <strong style={{ fontSize: "1.25em", textAlign: "center" }}>{t("rating.title", { name })}</strong>
        {settings && !enabled ? (
          <>
            <span style={{ color: colors.muted }}>{t("rating.off")}</span>
            <span style={{ color: colors.dim }}>{t("settings.shareRatingsHint")}</span>
            <Focusable flow-children="right" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button style={{ ...iconRow, margin: 0, flex: 1, minWidth: 150 }} disabled={busy} onClick={turnOn}>
                {t("rating.enable")}
              </Button>
              <DialogButton style={{ ...iconRow, margin: 0, flex: 1, minWidth: 150 }} onClick={() => closeModal?.()}>
                {t("settings.close")}
              </DialogButton>
            </Focusable>
          </>
        ) : (
          <>
            <Focusable flow-children="right" style={{ display: "flex", gap: 8 }}>
              {[1, 2, 3, 4, 5].map((value) => (
                <DialogButton
                  key={value}
                  style={choiceStyle(stars === value)}
                  onClick={() => setStars(stars === value ? null : value)}
                >
                  <FaStar /> {value}
                </DialogButton>
              ))}
            </Focusable>
            <Focusable flow-children="right" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <DialogButton style={choiceStyle(works === true)} onClick={() => setWorks(works === true ? null : true)}>
                <FaCheck /> {t("rating.works")}
              </DialogButton>
              <DialogButton
                style={choiceStyle(works === false)}
                onClick={() => setWorks(works === false ? null : false)}
              >
                <FaTimes /> {t("rating.broken")}
              </DialogButton>
            </Focusable>
            <Focusable flow-children="right" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <DialogButton style={choiceStyle(ui === true)} onClick={() => setUi(ui === true ? null : true)}>
                <FaCheck /> {t("rating.uiYes")}
              </DialogButton>
              <DialogButton style={choiceStyle(ui === false)} onClick={() => setUi(ui === false ? null : false)}>
                <FaTimes /> {t("rating.uiNo")}
              </DialogButton>
            </Focusable>
            <Focusable flow-children="right" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button
                style={{ ...iconRow, margin: 0, flex: 1, minWidth: 150 }}
                disabled={busy || !settings || (stars === null && works === null && ui === null)}
                onClick={send}
              >
                {t("rating.send")}
              </Button>
              {hasRating && (
                <DialogButton
                  style={{ ...iconRow, margin: 0, flex: 1, minWidth: 150 }}
                  disabled={busy}
                  onClick={remove}
                >
                  {t("rating.remove")}
                </DialogButton>
              )}
              <DialogButton style={{ ...iconRow, margin: 0, flex: 1, minWidth: 150 }} onClick={() => closeModal?.()}>
                {t("settings.close")}
              </DialogButton>
            </Focusable>
          </>
        )}
      </div>
    </WideModalRoot>
  );
}
