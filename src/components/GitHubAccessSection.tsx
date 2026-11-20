import { DialogButtonPrimary as Button, Focusable, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { FileSelectionType, openFilePicker, toaster } from "@decky/api";
import { useEffect, useState } from "react";
import { FaExternalLinkAlt, FaFileImport, FaInfoCircle, FaLock, FaSave } from "react-icons/fa";
import { getDeckyHubInfo, readTokenFile } from "../api";
import { openExternalWeb } from "../external";
import { useT } from "../i18n";
import type { TFunc } from "../i18n/en";
import { colors } from "../styles";
import type { Settings } from "../types";
import { compactButtonStyle, sectionDividerStyle, type githubCoreQuota } from "../utils";
import { Card, IconNote } from "./Card";
import { GitHubSignIn } from "./GitHubSignIn";

type Quota = Awaited<ReturnType<typeof githubCoreQuota>>;

const openTokenPage = () => openExternalWeb("https://github.com/settings/tokens");

// Picks a text file in Downloads (made in Desktop Mode, or copied from a PC) and
// puts the token in it into the field; Save stores it, like a typed one.
async function loadToken(t: TFunc, onTokenDraft: (token: string) => void) {
  let file;
  try {
    file = await openFilePicker(FileSelectionType.FILE, (await getDeckyHubInfo()).downloadDir, true, false, undefined, [
      "txt",
    ]);
  } catch {
    return; // Picker closed without a file.
  }
  try {
    const { token } = await readTokenFile(file.realpath);
    if (token) onTokenDraft(token);
    toaster.toast({ title: "DeckyHub", body: token ? t("settings.tokenLoaded") : t("settings.tokenNotFound") });
  } catch (error) {
    toaster.toast({ title: "DeckyHub", body: String(error) });
  }
}

// Same green/yellow/red as the app cards' status colors.
function quotaColorOf(quota: NonNullable<Quota>) {
  if (quota.remaining > quota.limit / 2) return colors.success;
  return quota.remaining > quota.limit / 10 ? colors.warning : colors.danger;
}

// The requests left this hour. Focusable (via onActivate) so the controller can move up onto this
// text: Steam only scrolls to follow focus.
function QuotaLine({ t, quota }: { t: TFunc; quota: NonNullable<Quota> }) {
  const color = quotaColorOf(quota);
  return (
    <Focusable onActivate={() => {}}>
      <strong
        className="deckyhub-github-quota"
        style={{ display: "block", borderLeft: `3px solid ${color}`, color, paddingLeft: 10 }}
      >
        {t("settings.githubQuota", {
          remaining: quota.remaining,
          limit: quota.limit,
          minutes: Math.max(1, Math.ceil((quota.reset * 1000 - Date.now()) / 60_000)),
        })}
      </strong>
    </Focusable>
  );
}

// Why a token helps, and how to make one.
function TokenExplainer({ t }: { t: TFunc }) {
  return (
    <>
      <IconNote icon={<FaInfoCircle />}>{t("settings.githubTokenIntro")}</IconNote>
      {/* A button (A / tap) that opens the token page in Steam's browser. */}
      <Focusable
        className="deckyhub-token-link"
        onActivate={openTokenPage}
        onClick={openTokenPage}
        style={{ borderLeft: "3px solid #1a9fff", cursor: "pointer", paddingLeft: 10 }}
      >
        <div style={{ color: colors.accent, fontSize: "max(12px, 0.9em)", marginBottom: 3 }}>
          {t("settings.githubTokenHowTo")}
        </div>
        <strong
          style={{
            alignItems: "center",
            color: colors.text,
            display: "inline-flex",
            gap: 6,
            textDecoration: "underline",
          }}
        >
          github.com/settings/tokens <FaExternalLinkAlt size="0.8em" />
        </strong>
      </Focusable>
      <IconNote icon={<FaLock />}>{t("settings.githubTokenNote")}</IconNote>
    </>
  );
}

// What a token is for (one line, Why? for the rest), the requests left this hour,
// and the token field: typed, or loaded from a file, then saved on its button.
export function GitHubAccessSection({
  quota,
  tokenDraft,
  onTokenDraft,
  savedToken,
  update,
}: {
  quota: Quota;
  tokenDraft: string;
  onTokenDraft: (token: string) => void;
  savedToken: string;
  update: (next: Partial<Settings>) => void;
}) {
  const t = useT();
  const [why, setWhy] = useState(false);
  const [canSignIn, setCanSignIn] = useState(false);
  useEffect(() => {
    void getDeckyHubInfo().then(
      (info) => setCanSignIn(Boolean(info.githubSignIn)),
      () => undefined,
    );
  }, []);
  return (
    <Card>
      <PanelSection title={t("settings.githubAccess")}>
        <PanelSectionRow>
          <div style={{ display: "grid", gap: 8 }}>
            <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <IconNote icon={<FaInfoCircle />}>{t("settings.githubTokenShort")}</IconNote>
              </div>
              <div style={{ flex: "0 0 auto" }}>
                <Button
                  style={{ ...compactButtonStyle, minHeight: 32, marginBottom: 0, padding: "2px 12px" }}
                  {...({ "aria-expanded": why } as object)}
                  onClick={() => setWhy(!why)}
                >
                  {why ? t("notice.less") : t("settings.githubTokenWhy")}
                </Button>
              </div>
            </Focusable>
            {quota && <QuotaLine t={t} quota={quota} />}
            {why && <TokenExplainer t={t} />}
          </div>
        </PanelSectionRow>
        {canSignIn && (
          <>
            <div aria-hidden style={sectionDividerStyle} />
            <GitHubSignIn
              onToken={(token) => {
                onTokenDraft(token);
                update({ githubToken: token });
              }}
            />
          </>
        )}
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <TextField
            label={t("settings.githubToken")}
            value={tokenDraft}
            bIsPassword
            bShowClearAction
            onChange={(event) => onTokenDraft(event.currentTarget.value)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <Focusable flow-children="right" style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Button
                style={{ ...compactButtonStyle, marginBottom: 0 }}
                onClick={() => void loadToken(t, onTokenDraft)}
              >
                <FaFileImport /> {t("settings.loadTokenFile")}
              </Button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Button
                style={{ ...compactButtonStyle, marginBottom: 0 }}
                disabled={tokenDraft.trim() === savedToken}
                onClick={() => update({ githubToken: tokenDraft.trim() })}
              >
                <FaSave /> {t("settings.saveSettings")}
              </Button>
            </div>
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
    </Card>
  );
}
