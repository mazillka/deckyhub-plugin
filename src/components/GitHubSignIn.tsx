import { DialogButtonPrimary as Button, PanelSectionRow } from "@decky/ui";
import { FaGithub, FaTimes } from "react-icons/fa";
import { useGithubSignIn } from "../hooks/useGithubSignIn";
import { useT } from "../i18n";
import { colors } from "../styles";
import { compactButtonStyle } from "../utils";
import { IconNote } from "./Card";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// "Sign in with GitHub" (github_auth.py): a short code to enter on github.com/login/device from any device,
// instead of making and typing a token. Shown only when this build has an OAuth app's Client ID.
export function GitHubSignIn({ onToken }: { onToken: (token: string) => void }) {
  const t = useT();
  const { flow, qr, busy, start, cancel, remaining } = useGithubSignIn(t, onToken);

  if (!flow)
    return (
      <>
        <PanelSectionRow>
          <Button style={compactButtonStyle} disabled={busy} onClick={start}>
            <FaGithub /> {t("settings.githubSignIn")}
          </Button>
        </PanelSectionRow>
        <PanelSectionRow>
          <div style={{ color: colors.muted, fontSize: "max(12px, 0.85em)" }}>{t("settings.githubSignInNote")}</div>
        </PanelSectionRow>
      </>
    );

  return (
    <>
      <PanelSectionRow>
        <div style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center", width: "100%" }}>
          <IconNote icon={<FaGithub />}>
            {t("settings.githubSignInCode", { url: flow.verificationUri.replace(/^https:\/\//, "") })}
          </IconNote>
          <div
            style={{
              border: `1px solid ${colors.success}`,
              borderRadius: 6,
              color: colors.success,
              fontSize: "1.8em",
              fontWeight: "bold",
              letterSpacing: 4,
              padding: "4px 14px",
            }}
          >
            {flow.userCode}
          </div>
          {qr && <img src={qr} alt="" style={{ maxWidth: "100%", height: "auto" }} />}
          <span style={{ color: remaining <= 60 ? colors.warning : colors.muted, fontVariantNumeric: "tabular-nums" }}>
            {t("remote.expiresIn", { time: clock(remaining) })}
          </span>
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <Button style={compactButtonStyle} onClick={cancel}>
          <FaTimes /> {t("content.cancel")}
        </Button>
      </PanelSectionRow>
    </>
  );
}
