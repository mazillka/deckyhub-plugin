import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, PanelSectionRow } from "@decky/ui";
import qrcode from "qrcode-generator";
import { useEffect, useMemo, useState } from "react";
import { FaGithub, FaTimes } from "react-icons/fa";
import { cancelGithubSignIn, pollGithubSignIn, startGithubSignIn } from "../api";
import { useT } from "../i18n";
import { colors } from "../styles";
import { compactButtonStyle } from "../utils";
import { IconNote } from "./Card";

type Flow = { userCode: string; verificationUri: string; expiresAt: number; interval: number };
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// "Sign in with GitHub" (github_auth.py): a short code to enter on github.com/login/device from any device,
// instead of making and typing a token. Shown only when this build has an OAuth app's Client ID.
export function GitHubSignIn({ onToken }: { onToken: (token: string) => void }) {
  const t = useT();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const fail = (error: unknown) => {
    setFlow(null);
    toaster.toast({ title: "DeckyHub", body: String(error) });
  };

  const start = () => {
    setBusy(true);
    void startGithubSignIn()
      .then(({ userCode, verificationUri, expiresIn, interval }) => {
        setNow(Date.now());
        setFlow({ userCode, verificationUri, expiresAt: Date.now() + expiresIn * 1000, interval });
      }, fail)
      .finally(() => setBusy(false));
  };

  const cancel = () => {
    setFlow(null);
    void cancelGithubSignIn().catch(() => undefined);
  };

  // Poll at the pace GitHub asked for, and count down once a second.
  useEffect(() => {
    if (!flow) return;
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    let stopped = false;
    let pollTimer: ReturnType<typeof setTimeout>;
    const poll = async (wait: number) => {
      await new Promise((resolve) => (pollTimer = setTimeout(resolve, wait * 1000)));
      if (stopped) return;
      try {
        const result = await pollGithubSignIn();
        if (stopped) return;
        if (result.status === "signed-in" && result.token) {
          setFlow(null);
          onToken(result.token);
          toaster.toast({ title: "DeckyHub", body: t("settings.githubSignedIn") });
        } else if (result.status === "pending") void poll(result.interval ?? flow.interval);
        else {
          setFlow(null);
          toaster.toast({
            title: "DeckyHub",
            body: result.status === "denied" ? t("settings.githubSignInDenied") : t("settings.githubSignInExpired"),
          });
        }
      } catch (error) {
        if (!stopped) fail(error);
      }
    };
    void poll(flow.interval);
    return () => {
      stopped = true;
      clearInterval(clockTimer);
      clearTimeout(pollTimer);
    };
    // The flow object is replaced only by a new sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);

  const qr = useMemo(() => {
    if (!flow) return null;
    const code = qrcode(0, "M");
    code.addData(flow.verificationUri);
    code.make();
    return code.createDataURL(4, 8);
  }, [flow]);

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

  const remaining = Math.max(0, Math.ceil((flow.expiresAt - now) / 1000));
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
