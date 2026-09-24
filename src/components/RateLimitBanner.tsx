import { DialogButtonPrimary as Button, Focusable, Navigation } from "@decky/ui";
import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { RATE_LIMIT_CHANGED, rateLimit } from "../utils";

// Header notice for an unauthenticated GitHub rate limit, rendered at the top
// of every screen that talks to GitHub. Hides itself once dismissed, once the
// limit should have reset, or as soon as a token is saved (setGithubToken).
export function RateLimitBanner() {
  const t = useT();
  const [limit, setLimit] = useState(rateLimit);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setLimit(rateLimit);
      setDismissed(false);
    };
    window.addEventListener(RATE_LIMIT_CHANGED, sync);
    return () => window.removeEventListener(RATE_LIMIT_CHANGED, sync);
  }, []);

  const remaining = limit.until - Date.now();
  if (dismissed || remaining <= 0) return null;
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));

  return (
    <div className="deckyhub-rate-limit" role="status" style={{ background: "rgba(240, 195, 60, 0.12)", borderLeft: "3px solid #f0c33c", borderRadius: 4, display: "grid", gap: 6, marginBottom: 12, padding: "8px 10px" }}>
      <strong style={{ color: "#f0c33c" }}>{t("rateLimit.title")}</strong>
      <small>
        {limit.minutesKnown ? t("rateLimit.retryIn", { minutes }) : t("rateLimit.retryLater")} {t("rateLimit.howToAvoid")}
      </small>
      <Focusable flow-children="right" style={{ display: "flex", gap: 8 }}>
        <Button style={{ flex: 1, minHeight: 32, padding: "4px 10px", textAlign: "center" }} onClick={() => Navigation.Navigate("/deckyhub/settings")}>
          {t("rateLimit.openSettings")}
        </Button>
        <Button style={{ flex: 1, minHeight: 32, padding: "4px 10px", textAlign: "center" }} onClick={() => setDismissed(true)}>
          {t("rateLimit.dismiss")}
        </Button>
      </Focusable>
    </div>
  );
}
