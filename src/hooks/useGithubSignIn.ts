import { toaster } from "@decky/api";
import qrcode from "qrcode-generator";
import { useEffect, useMemo, useState } from "react";
import { cancelGithubSignIn, pollGithubSignIn, startGithubSignIn } from "../api";
import type { TFunc } from "../i18n/en";

type Flow = { userCode: string; verificationUri: string; expiresAt: number; interval: number };

// GitHub's device flow: start it, poll at the pace GitHub asked for, count down once a second, and hand
// the token over once the code is entered on github.com/login/device.
export function useGithubSignIn(t: TFunc, onToken: (token: string) => void) {
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

  return {
    flow,
    qr,
    busy,
    start,
    cancel,
    remaining: flow ? Math.max(0, Math.ceil((flow.expiresAt - now) / 1000)) : 0,
  };
}
